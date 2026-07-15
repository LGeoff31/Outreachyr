from __future__ import annotations

import base64
import unittest
from email.message import EmailMessage
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from mail_connections.providers.google import GoogleMailboxAdapter


class GoogleMailboxAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/api/mail-connections/google/callback",
        )

    def test_authorization_is_pkce_and_send_only(self) -> None:
        url = self.adapter.authorization_url(
            state="opaque", code_challenge="challenge", login_hint=None
        )
        query = parse_qs(urlparse(url).query)
        self.assertEqual(query["state"], ["opaque"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["access_type"], ["offline"])
        self.assertEqual(query["prompt"], ["consent"])
        self.assertIn("https://www.googleapis.com/auth/gmail.send", query["scope"][0])
        self.assertNotIn("mail-secret", url)

    @patch("mail_connections.providers.google.build")
    def test_send_preserves_mime_and_returns_provider_id(self, build) -> None:
        execute = build.return_value.users.return_value.messages.return_value.send.return_value.execute
        execute.return_value = {"id": "gmail-id"}
        message = EmailMessage()
        message["From"] = "sender@example.com"
        message["To"] = "recipient@example.com"
        message["Subject"] = "Hello"
        message.set_content("Body")

        receipt = self.adapter.send(
            credentials={"access_token": "access", "refresh_token": "refresh"},
            message=message,
        )

        payload = build.return_value.users.return_value.messages.return_value.send.call_args.kwargs[
            "body"
        ]["raw"]
        self.assertEqual(base64.urlsafe_b64decode(payload), message.as_bytes())
        self.assertEqual(receipt.provider_message_id, "gmail-id")


if __name__ == "__main__":
    unittest.main()
