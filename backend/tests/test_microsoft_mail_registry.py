from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from mail_connections.dependencies import build_provider_registry
from mail_connections.providers.google import GOOGLE_PROVIDER
from mail_connections.providers.microsoft import MICROSOFT_PROVIDER


class MicrosoftMailRegistryTests(unittest.TestCase):
    @staticmethod
    def _google_patches():
        return (
            patch(
                "mail_connections.dependencies.google_mail_client_id",
                return_value="google-client",
            ),
            patch(
                "mail_connections.dependencies.google_mail_client_secret",
                return_value="google-secret",
            ),
            patch(
                "mail_connections.dependencies.google_mail_redirect_uri",
                return_value="https://app.example/google/callback",
            ),
        )

    def test_registry_omits_microsoft_when_credentials_are_absent(self) -> None:
        client_id, client_secret, redirect_uri = self._google_patches()
        with (
            client_id,
            client_secret,
            redirect_uri,
            patch(
                "mail_connections.dependencies.microsoft_mail_configured",
                return_value=False,
            ),
        ):
            registry = build_provider_registry()

        self.assertEqual(registry.available(), (GOOGLE_PROVIDER,))

    def test_registry_adds_microsoft_when_credentials_are_configured(self) -> None:
        client_id, client_secret, redirect_uri = self._google_patches()
        microsoft_config = SimpleNamespace(
            client_id="microsoft-client",
            client_secret="microsoft-secret",
            redirect_uri="https://app.example/microsoft/callback",
            tenant="common",
        )
        with (
            client_id,
            client_secret,
            redirect_uri,
            patch(
                "mail_connections.dependencies.microsoft_mail_configured",
                return_value=True,
            ),
            patch(
                "mail_connections.dependencies.microsoft_mail_config",
                return_value=microsoft_config,
            ),
        ):
            registry = build_provider_registry()

        self.assertEqual(
            registry.available(),
            (GOOGLE_PROVIDER, MICROSOFT_PROVIDER),
        )


if __name__ == "__main__":
    unittest.main()
