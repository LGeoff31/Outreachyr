from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from mail_connections.dependencies import (
    get_mail_connection_service,
    get_provider_registry,
)
from mail_connections.errors import MailConnectionAccountMismatch
from mail_connections.registry import ProviderDefinition, ProviderRegistry
from mail_connections.router import router
from mail_connections.service import AuthorizationResult, AuthorizationStart
from mail_connections.types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
)
from user_resume_api import require_supabase_user


class _Service:
    def __init__(self, owner_id: uuid.UUID, connection: MailConnection):
        self.owner_id = owner_id
        self.connection = connection
        self.authorize_error = None
        self.callback_error = None
        self.calls = []

    def list_connections(self, owner_id):
        self.calls.append(("list", owner_id))
        return [self.connection]

    def begin_authorization(self, **kwargs):
        self.calls.append(("authorize", kwargs))
        if self.authorize_error:
            raise self.authorize_error
        return AuthorizationStart("https://provider.example/authorize")

    def complete_authorization(self, **kwargs):
        self.calls.append(("callback", kwargs))
        if self.callback_error:
            raise self.callback_error
        return AuthorizationResult(
            owner_id=self.owner_id,
            connection=self.connection,
            return_to="/dashboard/settings/sending-accounts?source=settings",
        )

    def set_default(self, owner_id, connection_id):
        self.calls.append(("default", owner_id, connection_id))
        return self.connection

    def disconnect(self, owner_id, connection_id):
        self.calls.append(("disconnect", owner_id, connection_id))


class MailConnectionRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner_id = uuid.uuid4()
        self.connection_id = uuid.uuid4()
        self.connection = MailConnection(
            id=self.connection_id,
            owner_id=self.owner_id,
            provider="google",
            provider_account_id="google-account",
            email="sender@example.com",
            display_name="Sender",
            status=MailConnectionStatus.CONNECTED,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            is_default=True,
            last_verified_at=datetime.now(timezone.utc),
        )
        self.service = _Service(self.owner_id, self.connection)
        self.registry = ProviderRegistry()
        self.registry.register(
            ProviderDefinition(
                provider="google",
                sender=object(),
                capabilities=frozenset({MailCapability.SEND_MAIL}),
            )
        )
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_supabase_user] = lambda: {
            "id": str(self.owner_id)
        }
        app.dependency_overrides[get_mail_connection_service] = lambda: self.service
        app.dependency_overrides[get_provider_registry] = lambda: self.registry
        self.client = TestClient(app)

    def test_list_returns_connections_and_backend_enabled_providers(self) -> None:
        response = self.client.get("/api/mail-connections")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["providers"], ["google"])
        self.assertEqual(
            response.json()["connections"][0]["id"], str(self.connection_id)
        )
        self.assertEqual(self.service.calls[0], ("list", self.owner_id))

    def test_authorize_is_owner_scoped_and_returns_nested_domain_errors(self) -> None:
        response = self.client.post(
            "/api/mail-connections/google/authorize",
            json={
                "return_to": "/dashboard/settings/sending-accounts",
                "connection_id": str(self.connection_id),
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["authorization_url"],
            "https://provider.example/authorize",
        )
        self.assertEqual(self.service.calls[-1][1]["owner_id"], self.owner_id)

        self.service.authorize_error = MailConnectionAccountMismatch()
        response = self.client.post(
            "/api/mail-connections/google/authorize",
            json={"return_to": "/dashboard/settings/sending-accounts"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json(),
            {
                "error": {
                    "code": "mail_connection_account_mismatch",
                    "message": (
                        "The authorized mailbox does not match the account being "
                        "reconnected."
                    ),
                    "retryable": False,
                }
            },
        )

    def test_callback_preserves_return_query_and_appends_result(self) -> None:
        response = self.client.get(
            "/api/mail-connections/google/callback",
            params={"state": "opaque", "code": "code"},
            follow_redirects=False,
        )

        self.assertEqual(response.status_code, 303)
        self.assertEqual(
            response.headers["location"],
            "/dashboard/settings/sending-accounts?source=settings&mail_connection=connected",
        )

        error = MailConnectionAccountMismatch()
        error.return_to = "/dashboard/settings/sending-accounts?source=settings"
        self.service.callback_error = error
        response = self.client.get(
            "/api/mail-connections/google/callback",
            params={"state": "opaque", "code": "code"},
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 303)
        self.assertEqual(
            response.headers["location"],
            (
                "/dashboard/settings/sending-accounts?source=settings&"
                "mail_connection_error=mail_connection_account_mismatch"
            ),
        )

    def test_default_and_delete_are_owner_scoped(self) -> None:
        response = self.client.patch(
            f"/api/mail-connections/{self.connection_id}",
            json={"is_default": True},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.service.calls[-1][1], self.owner_id)

        response = self.client.delete(f"/api/mail-connections/{self.connection_id}")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.service.calls[-1][1], self.owner_id)


if __name__ == "__main__":
    unittest.main()
