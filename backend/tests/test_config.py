from __future__ import annotations

import unittest
from unittest.mock import patch

import config


class FrontendUrlConfigTests(unittest.TestCase):
    def test_frontend_base_url_derives_from_frontend_port(self) -> None:
        with patch.dict("os.environ", {"FRONTEND_PORT": "4123"}, clear=True):
            self.assertEqual(config.frontend_base_url(), "http://localhost:4123")

    def test_frontend_origins_default_to_frontend_base_url(self) -> None:
        with patch.dict("os.environ", {"FRONTEND_PORT": "4123"}, clear=True):
            self.assertEqual(config.frontend_origins(), ["http://localhost:4123"])

    def test_frontend_url_override_wins(self) -> None:
        with patch.dict(
            "os.environ",
            {"FRONTEND_PORT": "4123", "FRONTEND_URL": "https://app.example.com/"},
            clear=True,
        ):
            self.assertEqual(config.frontend_base_url(), "https://app.example.com")

    def test_google_mail_redirect_uri_defaults_to_frontend_base_url(self) -> None:
        with patch.dict("os.environ", {"FRONTEND_PORT": "4123"}, clear=True):
            self.assertEqual(
                config.google_mail_redirect_uri(),
                "http://localhost:4123/api/mail-connections/google/callback",
            )

    def test_microsoft_mail_is_disabled_without_client_credentials(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(config.microsoft_mail_configured())

    def test_microsoft_mail_config_defaults_tenant_and_redirect(self) -> None:
        env = {
            "MICROSOFT_MAIL_CLIENT_ID": "client",
            "MICROSOFT_MAIL_CLIENT_SECRET": "secret",
            "FRONTEND_PORT": "4123",
        }
        with patch.dict("os.environ", env, clear=True):
            cfg = config.microsoft_mail_config()
        self.assertEqual(cfg.tenant, "common")
        self.assertEqual(cfg.client_id, "client")
        self.assertEqual(
            cfg.redirect_uri,
            "http://localhost:4123/api/mail-connections/microsoft/callback",
        )

    def test_microsoft_mail_config_rejects_partial_configuration(self) -> None:
        with patch.dict(
            "os.environ", {"MICROSOFT_MAIL_CLIENT_ID": "client"}, clear=True
        ):
            self.assertTrue(config.microsoft_mail_configured())
            with self.assertRaisesRegex(RuntimeError, "MICROSOFT_MAIL_CLIENT_SECRET"):
                config.microsoft_mail_config()

    def test_microsoft_mail_config_rejects_lookalike_localhost(self) -> None:
        env = {
            "MICROSOFT_MAIL_CLIENT_ID": "client",
            "MICROSOFT_MAIL_CLIENT_SECRET": "secret",
            "MICROSOFT_MAIL_REDIRECT_URI": "http://localhost.example/callback",
        }
        with patch.dict("os.environ", env, clear=True):
            with self.assertRaisesRegex(RuntimeError, "HTTPS or localhost"):
                config.microsoft_mail_config()


if __name__ == "__main__":
    unittest.main()
