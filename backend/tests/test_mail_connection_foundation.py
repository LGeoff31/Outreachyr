from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone

from cryptography.fernet import Fernet

from mail_connections.crypto import CredentialVault
from mail_connections.errors import MailProviderNotFound
from mail_connections.registry import ProviderDefinition, ProviderRegistry
from mail_connections.types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
    MailProvider,
)


class MailConnectionFoundationTests(unittest.TestCase):
    def test_wire_values_and_public_projection_are_provider_neutral(self) -> None:
        self.assertEqual(MailProvider.GOOGLE.value, "google")
        self.assertEqual(MailCapability.SEND_MAIL.value, "send_mail")
        connection = MailConnection(
            id=uuid.uuid4(),
            owner_id=uuid.uuid4(),
            provider=MailProvider.GOOGLE,
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
            provider=MailProvider.GOOGLE,
            sender=object(),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
        )
        registry.register(definition)
        with self.assertRaises(ValueError):
            registry.register(definition)
        with self.assertRaises(MailProviderNotFound):
            registry.get("microsoft")

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


if __name__ == "__main__":
    unittest.main()
