from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from cryptography.fernet import Fernet

from mail_connections.crypto import CredentialVault
from mail_connections.dependencies import build_provider_registry
from mail_connections.errors import MailProviderNotFound
from mail_connections.providers.google import GOOGLE_PROVIDER
from mail_connections.registry import ProviderDefinition, ProviderRegistry
from mail_connections.types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
)


class _NoopSender:
    def send(self, *, credentials, message):
        raise AssertionError("not used")


class MailConnectionFoundationTests(unittest.TestCase):
    def test_wire_values_and_public_projection_are_provider_neutral(self) -> None:
        self.assertEqual(GOOGLE_PROVIDER, "google")
        self.assertEqual(MailCapability.SEND_MAIL.value, "send_mail")
        connection = MailConnection(
            id=uuid.uuid4(),
            owner_id=uuid.uuid4(),
            provider=GOOGLE_PROVIDER,
            provider_account_id="google-user",
            email="sender@example.com",
            display_name="Sender",
            status=MailConnectionStatus.CONNECTED,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            granted_scopes=frozenset({"gmail.send"}),
            is_default=True,
            last_verified_at=datetime.now(timezone.utc),
            last_error_code=None,
        )
        public = connection.public()
        self.assertEqual(public.provider, "google")
        self.assertNotIn("owner", repr(public))
        self.assertNotIn("credential", repr(public))

    def test_registry_rejects_duplicates_and_unknown_provider(self) -> None:
        registry = ProviderRegistry()
        definition = ProviderDefinition(
            provider=GOOGLE_PROVIDER,
            sender=_NoopSender(),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
        )
        registry.register(definition)
        with self.assertRaises(ValueError):
            registry.register(definition)
        with self.assertRaises(MailProviderNotFound):
            registry.get("microsoft")

    def test_registry_accepts_a_provider_id_without_a_core_enum_change(self) -> None:
        registry = ProviderRegistry()
        definition = ProviderDefinition(
            provider="custom-mail",
            sender=_NoopSender(),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
        )

        registry.register(definition)

        self.assertIs(registry.get("custom-mail"), definition)

    def test_vault_encrypts_with_context_and_supports_rotation(self) -> None:
        old_key = Fernet.generate_key().decode()
        active_key = Fernet.generate_key().decode()
        vault = CredentialVault.from_config(f"v1:{active_key},v0:{old_key}")
        encrypted = vault.encrypt({"refresh_token": "secret"}, context="connection:one")
        self.assertEqual(encrypted.key_id, "v1")
        self.assertEqual(
            vault.decrypt(encrypted, context="connection:one"),
            {"refresh_token": "secret"},
        )
        with self.assertRaises(ValueError):
            vault.decrypt(encrypted, context="connection:two")
        self.assertNotIn("secret", repr(encrypted))

    @patch("mail_connections.dependencies.GoogleMailboxAdapter")
    @patch("mail_connections.dependencies.google_mail_redirect_uri")
    @patch("mail_connections.dependencies.google_mail_client_secret")
    @patch("mail_connections.dependencies.google_mail_client_id")
    def test_google_registry_passes_legacy_identity_oauth_client(
        self,
        mail_client_id,
        mail_client_secret,
        redirect_uri,
        adapter,
    ) -> None:
        mail_client_id.return_value = "mail-client"
        mail_client_secret.return_value = "mail-secret"
        redirect_uri.return_value = "https://app.example/callback"

        with patch.dict(
            "os.environ",
            {
                "GOOGLE_CLIENT_ID": "legacy-client",
                "GOOGLE_CLIENT_SECRET": "legacy-secret",
            },
        ):
            build_provider_registry()

        adapter.assert_called_once_with(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            legacy_client_id="legacy-client",
            legacy_client_secret="legacy-secret",
        )


if __name__ == "__main__":
    unittest.main()
