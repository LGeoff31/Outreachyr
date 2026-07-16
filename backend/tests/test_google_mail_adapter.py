from __future__ import annotations

import base64
import unittest
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from googleapiclient.errors import HttpError

from mail_connections.errors import (
    MailboxAuthorizationFailed,
    MailboxPermissionDenied,
    MailboxRateLimited,
)
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

    def test_exchange_uses_pkce_and_returns_stable_user_identity(self) -> None:
        calls: list[tuple[str, str, dict | None, dict | None]] = []

        def request(method, url, *, form=None, headers=None):
            calls.append((method, url, form, headers))
            if url.endswith("/token"):
                return {
                    "access_token": "access",
                    "refresh_token": "refresh",
                    "expires_in": 3600,
                    "scope": (
                        "openid email profile "
                        "https://www.googleapis.com/auth/gmail.send"
                    ),
                }
            return {
                "sub": "stable-google-user",
                "email": "sender@example.com",
                "name": "Sender",
            }

        adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            http_request=request,
        )

        grant = adapter.exchange_code(code="code", code_verifier="verifier")

        self.assertEqual(grant.identity.provider_account_id, "stable-google-user")
        self.assertEqual(grant.identity.email, "sender@example.com")
        self.assertEqual(grant.credentials["oauth_client"], "mail_google")
        self.assertEqual(calls[0][2]["code_verifier"], "verifier")
        self.assertEqual(calls[1][3]["Authorization"], "Bearer access")

    def test_exchange_rejects_missing_refresh_token_or_send_scope(self) -> None:
        def missing_refresh(method, url, *, form=None, headers=None):
            if url.endswith("/token"):
                return {
                    "access_token": "access",
                    "scope": "openid email https://www.googleapis.com/auth/gmail.send",
                }
            return {"sub": "id", "email": "sender@example.com"}

        adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            http_request=missing_refresh,
        )
        with self.assertRaises(MailboxAuthorizationFailed):
            adapter.exchange_code(code="code", code_verifier="verifier")

        def missing_scope(method, url, *, form=None, headers=None):
            return {
                "access_token": "access",
                "refresh_token": "refresh",
                "scope": "openid email profile",
            }

        adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            http_request=missing_scope,
        )
        with self.assertRaises(MailboxPermissionDenied):
            adapter.exchange_code(code="code", code_verifier="verifier")

    def test_refresh_uses_legacy_oauth_client_for_migrated_credentials(self) -> None:
        calls: list[dict] = []

        def request(method, url, *, form=None, headers=None):
            calls.append(form)
            return {"access_token": "new-access", "expires_in": 3600}

        adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            legacy_client_id="legacy-client",
            legacy_client_secret="legacy-secret",
            http_request=request,
        )

        refreshed = adapter.refresh_credentials(
            {
                "access_token": "old",
                "refresh_token": "refresh",
                "expires_at": datetime.now(timezone.utc).timestamp() - 60,
                "oauth_client": "legacy_google",
            }
        )

        self.assertEqual(calls[0]["client_id"], "legacy-client")
        self.assertEqual(calls[0]["client_secret"], "legacy-secret")
        self.assertEqual(refreshed["refresh_token"], "refresh")
        self.assertEqual(refreshed["oauth_client"], "legacy_google")

    def test_revoke_is_best_effort(self) -> None:
        calls: list[str] = []

        def request(method, url, *, form=None, headers=None):
            calls.append(url)
            raise OSError("provider unavailable")

        adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            http_request=request,
        )

        adapter.revoke({"refresh_token": "refresh"})

        self.assertEqual(calls, ["https://oauth2.googleapis.com/revoke"])

    def test_revoke_preserves_migrated_identity_login_grant(self) -> None:
        calls: list[str] = []

        def request(method, url, *, form=None, headers=None):
            calls.append(url)
            return {}

        adapter = GoogleMailboxAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/callback",
            http_request=request,
        )

        adapter.revoke(
            {
                "oauth_client": "legacy_google",
                "refresh_token": "identity-refresh-token",
            }
        )

        self.assertEqual(calls, [])

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

    @patch("mail_connections.providers.google.build")
    def test_send_maps_google_rate_limit_reason(self, build) -> None:
        class Response(dict):
            status = 403
            reason = "Forbidden"

        execute = build.return_value.users.return_value.messages.return_value.send.return_value.execute
        execute.side_effect = HttpError(
            Response(),
            b'{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
        )
        message = EmailMessage()
        message["To"] = "recipient@example.com"
        message.set_content("Body")

        with self.assertRaises(MailboxRateLimited):
            self.adapter.send(
                credentials={"access_token": "access", "refresh_token": "refresh"},
                message=message,
            )


if __name__ == "__main__":
    unittest.main()
