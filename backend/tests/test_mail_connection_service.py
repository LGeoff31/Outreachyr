from __future__ import annotations

import unittest
import uuid
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from mail_connections.errors import (
    MailConnectionAccountMismatch,
    MailInvalidReturnTo,
)
from mail_connections.registry import ProviderDefinition, ProviderRegistry
from mail_connections.service import MailConnectionService
from mail_connections.types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
    MailboxGrant,
    MailboxIdentity,
    OAuthState,
    StoredCredential,
)


def _connection(
    owner_id: uuid.UUID,
    connection_id: uuid.UUID,
    *,
    account_id: str = "google-account",
    is_default: bool = True,
) -> MailConnection:
    return MailConnection(
        id=connection_id,
        owner_id=owner_id,
        provider="google",
        provider_account_id=account_id,
        email="sender@example.com",
        display_name="Sender",
        status=MailConnectionStatus.CONNECTED,
        capabilities=frozenset({MailCapability.SEND_MAIL}),
        is_default=is_default,
    )


class _OAuthAdapter:
    def __init__(self, grant: MailboxGrant):
        self.grant = grant
        self.exchange_calls: list[tuple[str, str]] = []
        self.revoked: list[dict] = []

    def authorization_url(
        self, *, state: str, code_challenge: str, login_hint: str | None
    ) -> str:
        return (
            "https://provider.example/authorize?"
            f"state={state}&challenge={code_challenge}&login_hint={login_hint or ''}"
        )

    def exchange_code(self, *, code: str, code_verifier: str) -> MailboxGrant:
        self.exchange_calls.append((code, code_verifier))
        return self.grant

    def revoke(self, credentials) -> None:
        self.revoked.append(credentials)


class _Repository:
    def __init__(self):
        self.connections: dict[uuid.UUID, MailConnection] = {}
        self.default: MailConnection | None = None
        self.consumed_state: OAuthState | None = None
        self.created_state: dict | None = None
        self.events: list[str] = []
        self.upserted: dict | None = None
        self.written_credentials: dict | None = None
        self.credentials = {"oauth_client": "mail_google", "refresh_token": "refresh"}

    def get(self, owner_id, connection_id):
        connection = self.connections.get(connection_id)
        if connection and connection.owner_id == owner_id:
            return connection
        return None

    def get_default(self, owner_id):
        return self.default

    def create_oauth_state(self, **kwargs):
        self.created_state = kwargs
        self.events.append("state-created")

    def consume_oauth_state(self, **kwargs):
        self.events.append("state-consumed")
        return self.consumed_state

    def upsert_connection(self, **kwargs):
        self.upserted = kwargs
        self.events.append("connection-upserted")
        target_id = kwargs.get("target_connection_id") or uuid.uuid4()
        result = _connection(
            kwargs["owner_id"],
            target_id,
            account_id=kwargs["grant"].identity.provider_account_id,
            is_default=kwargs["is_default"],
        )
        self.connections[result.id] = result
        return result

    def write_credentials(self, owner_id, connection_id, payload, **kwargs):
        self.written_credentials = payload
        self.events.append("credentials-written")
        return 1

    def commit(self):
        self.events.append("committed")

    def rollback(self):
        self.events.append("rolled-back")

    def read_credentials(self, owner_id, connection_id):
        return StoredCredential(payload=self.credentials, version=1)

    def delete(self, owner_id, connection_id):
        return self.connections.pop(connection_id, None) is not None

    def list(self, owner_id):
        return [
            connection
            for connection in self.connections.values()
            if connection.owner_id == owner_id
        ]

    def set_default(self, owner_id, connection_id):
        return self.connections[connection_id]


class MailConnectionServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner_id = uuid.uuid4()
        self.connection_id = uuid.uuid4()
        self.grant = MailboxGrant(
            identity=MailboxIdentity(
                provider_account_id="google-account",
                email="sender@example.com",
                display_name="Sender",
            ),
            credentials={"refresh_token": "refresh"},
            granted_scopes=frozenset({"gmail.send"}),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
        )
        self.adapter = _OAuthAdapter(self.grant)
        self.registry = ProviderRegistry()
        self.registry.register(
            ProviderDefinition(
                provider="google",
                sender=self.adapter,
                capabilities=frozenset({MailCapability.SEND_MAIL}),
                oauth_connector=self.adapter,
                credential_revoker=self.adapter,
            )
        )
        self.repository = _Repository()
        self.service = MailConnectionService(
            self.repository,
            self.registry,
            now=lambda: datetime(2026, 7, 15, tzinfo=timezone.utc),
        )

    def test_authorize_generates_pkce_and_persists_only_a_state_digest(self) -> None:
        connection = _connection(self.owner_id, self.connection_id)
        self.repository.connections[connection.id] = connection

        result = self.service.begin_authorization(
            owner_id=self.owner_id,
            provider="google",
            return_to="/dashboard/settings/sending-accounts?source=settings",
            target_connection_id=self.connection_id,
        )

        query = parse_qs(urlparse(result.authorization_url).query)
        self.assertTrue(query["state"][0])
        self.assertNotEqual(
            query["state"][0].encode(), self.repository.created_state["state_digest"]
        )
        self.assertGreaterEqual(len(query["challenge"][0]), 43)
        self.assertEqual(query["login_hint"], ["sender@example.com"])
        self.assertEqual(
            self.repository.created_state["return_to"],
            "/dashboard/settings/sending-accounts?source=settings",
        )
        self.assertEqual(self.repository.events[-1], "committed")

    def test_authorize_rejects_external_or_protocol_relative_return_urls(self) -> None:
        for value in ("https://evil.example", "//evil.example/path", "dashboard"):
            with self.subTest(value=value), self.assertRaises(MailInvalidReturnTo):
                self.service.begin_authorization(
                    owner_id=self.owner_id,
                    provider="google",
                    return_to=value,
                )

    def test_callback_consumes_state_before_exchange_then_persists_grant(self) -> None:
        self.repository.consumed_state = OAuthState(
            owner_id=self.owner_id,
            provider="google",
            target_connection_id=None,
            code_verifier="verifier",
            return_to="/dashboard/settings/sending-accounts",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )

        result = self.service.complete_authorization(
            provider="google",
            state="opaque-state",
            code="authorization-code",
        )

        self.assertEqual(
            self.adapter.exchange_calls, [("authorization-code", "verifier")]
        )
        self.assertEqual(
            self.repository.written_credentials, {"refresh_token": "refresh"}
        )
        self.assertTrue(self.repository.upserted["is_default"])
        self.assertEqual(result.owner_id, self.owner_id)
        self.assertEqual(result.return_to, "/dashboard/settings/sending-accounts")
        self.assertLess(
            self.repository.events.index("committed"),
            self.repository.events.index("connection-upserted"),
        )

    def test_targeted_reconnect_rejects_a_different_provider_identity(self) -> None:
        existing = _connection(self.owner_id, self.connection_id)
        self.repository.connections[existing.id] = existing
        self.repository.consumed_state = OAuthState(
            owner_id=self.owner_id,
            provider="google",
            target_connection_id=self.connection_id,
            code_verifier="verifier",
            return_to="/dashboard/settings/sending-accounts",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )
        self.adapter.grant = MailboxGrant(
            identity=MailboxIdentity(
                provider_account_id="different-account", email="other@example.com"
            ),
            credentials={"refresh_token": "other"},
            granted_scopes=frozenset({"gmail.send"}),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
        )

        with self.assertRaises(MailConnectionAccountMismatch):
            self.service.complete_authorization(
                provider="google",
                state="opaque-state",
                code="authorization-code",
            )

        self.assertIsNone(self.repository.upserted)
        self.assertIsNone(self.repository.written_credentials)

    def test_disconnect_delegates_revocation_policy_to_provider(self) -> None:
        existing = _connection(self.owner_id, self.connection_id)
        self.repository.connections[existing.id] = existing
        self.repository.credentials = {
            "oauth_client": "legacy_google",
            "refresh_token": "identity-refresh-token",
        }

        self.service.disconnect(self.owner_id, self.connection_id)

        self.assertEqual(self.adapter.revoked, [self.repository.credentials])
        self.assertNotIn(self.connection_id, self.repository.connections)
        self.assertEqual(self.repository.events[-1], "committed")

    def test_disconnect_still_deletes_a_disabled_provider_connection(self) -> None:
        existing = replace(
            _connection(self.owner_id, self.connection_id),
            provider="disabled-provider",
        )
        self.repository.connections[existing.id] = existing

        self.service.disconnect(self.owner_id, self.connection_id)

        self.assertNotIn(self.connection_id, self.repository.connections)
        self.assertEqual(self.repository.events[-1], "committed")


if __name__ == "__main__":
    unittest.main()
