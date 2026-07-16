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


if __name__ == "__main__":
    unittest.main()
