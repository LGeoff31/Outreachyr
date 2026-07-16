from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet

from mail_connections.crypto import CredentialVault
from mail_connections.errors import MailCredentialVersionConflict
from mail_connections.repository import MailConnectionRepository
from mail_connections.types import (
    MailCapability,
    MailboxGrant,
    MailboxIdentity,
)


class _Result:
    def __init__(self, rows: list[dict] | None = None):
        self._rows = rows or []

    def mappings(self):
        return self

    def all(self) -> list[dict]:
        return self._rows

    def first(self) -> dict | None:
        return self._rows[0] if self._rows else None


class _Session:
    def __init__(self, *responses: _Result):
        self.responses = list(responses)
        self.calls: list[tuple[str, dict]] = []
        self.commits = 0
        self.rollbacks = 0

    def execute(self, statement, params=None) -> _Result:
        self.calls.append((str(statement), params or {}))
        if not self.responses:
            raise AssertionError("Unexpected SQL execution")
        return self.responses.pop(0)

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


def _connection_row(owner_id: uuid.UUID, connection_id: uuid.UUID) -> dict:
    return {
        "id": connection_id,
        "owner_id": owner_id,
        "provider": "google",
        "provider_account_id": "google-account",
        "email": "sender@example.com",
        "display_name": "Sender",
        "status": "connected",
        "capabilities": ["send_mail"],
        "granted_scopes": ["gmail.send"],
        "is_default": True,
        "last_verified_at": datetime.now(timezone.utc),
        "last_error_code": None,
    }


class MailConnectionRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner_id = uuid.uuid4()
        self.connection_id = uuid.uuid4()
        self.vault = CredentialVault.from_config(f"v1:{Fernet.generate_key().decode()}")

    def test_list_is_owner_scoped_and_maps_domain_connection(self) -> None:
        session = _Session(
            _Result([_connection_row(self.owner_id, self.connection_id)])
        )
        repository = MailConnectionRepository(session, self.vault)

        connections = repository.list(self.owner_id)

        self.assertEqual(connections[0].id, self.connection_id)
        self.assertEqual(connections[0].provider, "google")
        sql, params = session.calls[0]
        self.assertIn("owner_id = :owner_id", sql)
        self.assertEqual(params["owner_id"], self.owner_id)

    def test_credentials_are_decrypted_only_after_owner_scoped_join(self) -> None:
        encrypted = self.vault.encrypt(
            {"refresh_token": "secret"},
            context=f"connection:{self.connection_id}",
        )
        session = _Session(
            _Result(
                [
                    {
                        "encrypted_payload": encrypted.ciphertext,
                        "key_id": encrypted.key_id,
                        "credential_version": 4,
                    }
                ]
            )
        )
        repository = MailConnectionRepository(session, self.vault)

        credential = repository.read_credentials(self.owner_id, self.connection_id)

        self.assertEqual(credential.payload, {"refresh_token": "secret"})
        self.assertEqual(credential.version, 4)
        sql, params = session.calls[0]
        self.assertIn("join private.mail_connections", sql.lower())
        self.assertEqual(params["owner_id"], self.owner_id)

    def test_credential_write_uses_optimistic_version_compare_and_swap(self) -> None:
        session = _Session(_Result([{"credential_version": 5}]), _Result())
        repository = MailConnectionRepository(session, self.vault)

        version = repository.write_credentials(
            self.owner_id,
            self.connection_id,
            {"refresh_token": "rotated"},
            expected_version=4,
        )
        self.assertEqual(version, 5)
        sql, params = session.calls[0]
        self.assertIn("credential_version = :expected_version", sql)
        self.assertEqual(params["expected_version"], 4)
        self.assertNotIn(b"rotated", params["encrypted_payload"])

        with self.assertRaises(MailCredentialVersionConflict):
            repository.write_credentials(
                self.owner_id,
                self.connection_id,
                {"refresh_token": "lost-race"},
                expected_version=4,
            )

    def test_targeted_reconnect_replaces_legacy_provider_metadata(self) -> None:
        session = _Session(
            _Result([_connection_row(self.owner_id, self.connection_id)])
        )
        repository = MailConnectionRepository(session, self.vault)
        grant = MailboxGrant(
            identity=MailboxIdentity(
                provider_account_id="google-account",
                email="sender@example.com",
            ),
            credentials={
                "refresh_token": "dedicated-refresh",
                "oauth_client": "mail_google",
            },
            granted_scopes=frozenset({"gmail.send"}),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            provider_metadata={"oauth_client": "mail_google"},
        )

        repository.upsert_connection(
            owner_id=self.owner_id,
            provider="google",
            grant=grant,
            target_connection_id=self.connection_id,
        )

        sql, params = session.calls[0]
        self.assertIn("provider_metadata = cast(:provider_metadata as jsonb)", sql)
        self.assertEqual(params["provider_metadata"], '{"oauth_client": "mail_google"}')

    def test_oauth_state_is_encrypted_and_consumed_by_atomic_delete(self) -> None:
        digest = b"state-digest"
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        create_session = _Session(_Result())
        create_repository = MailConnectionRepository(create_session, self.vault)
        create_repository.create_oauth_state(
            state_digest=digest,
            owner_id=self.owner_id,
            provider="google",
            target_connection_id=self.connection_id,
            code_verifier="pkce-secret",
            return_to="/dashboard/settings/sending-accounts",
            expires_at=expires_at,
        )
        _, create_params = create_session.calls[0]
        self.assertNotIn(b"pkce-secret", create_params["encrypted_code_verifier"])

        consume_session = _Session(
            _Result(
                [
                    {
                        "state_digest": digest,
                        "owner_id": self.owner_id,
                        "provider": "google",
                        "target_connection_id": self.connection_id,
                        "encrypted_code_verifier": create_params[
                            "encrypted_code_verifier"
                        ],
                        "key_id": create_params["key_id"],
                        "return_to": "/dashboard/settings/sending-accounts",
                        "expires_at": expires_at,
                    }
                ]
            )
        )
        consume_repository = MailConnectionRepository(consume_session, self.vault)

        state = consume_repository.consume_oauth_state(
            state_digest=digest,
            provider="google",
            now=datetime.now(timezone.utc),
        )

        self.assertEqual(state.code_verifier, "pkce-secret")
        sql, _ = consume_session.calls[0]
        self.assertIn("delete from private.mail_oauth_states", sql.lower())
        self.assertIn("returning", sql.lower())


if __name__ == "__main__":
    unittest.main()
