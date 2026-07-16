from __future__ import annotations

import base64
import json
import unittest
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import parse_qs, urlparse

import httpx

from mail_connections.errors import (
    MailboxAuthorizationFailed,
    MailboxDeliveryUnknown,
    MailboxRateLimited,
    MailboxReauthRequired,
    MailboxTemporaryFailure,
)
from mail_connections.providers.microsoft import (
    MICROSOFT_PROVIDER,
    MicrosoftGraphAdapter,
)


class MicrosoftGraphAdapterTests(unittest.TestCase):
    def test_authorization_uses_common_pkce_and_only_send_permissions(self) -> None:
        adapter = self._adapter(lambda request: httpx.Response(500))
        url = adapter.authorization_url(
            state="opaque", code_challenge="challenge", login_hint=None
        )
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        self.assertIn("/common/oauth2/v2.0/authorize", parsed.path)
        self.assertEqual(query["response_mode"], ["query"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["prompt"], ["select_account"])
        self.assertEqual(
            set(query["scope"][0].split()),
            {
                "offline_access",
                "https://graph.microsoft.com/User.Read",
                "https://graph.microsoft.com/Mail.Send",
            },
        )
        self.assertNotIn("mail-secret", url)

    def test_exchange_maps_graph_identity_and_credentials(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "login.microsoftonline.com":
                return httpx.Response(
                    200,
                    json={
                        "access_token": "access",
                        "refresh_token": "refresh",
                        "token_type": "Bearer",
                        "expires_in": 3600,
                        "scope": "offline_access User.Read Mail.Send",
                    },
                )
            return httpx.Response(
                200,
                json={
                    "id": "ms-user",
                    "displayName": "Sender",
                    "mail": "sender@outlook.com",
                    "userPrincipalName": "sender@example.onmicrosoft.com",
                },
            )

        grant = self._adapter(handler).exchange_code(
            code="code", code_verifier="verifier"
        )
        self.assertEqual(grant.identity.provider_account_id, "ms-user")
        self.assertEqual(grant.identity.email, "sender@outlook.com")
        self.assertEqual(grant.credentials["refresh_token"], "refresh")
        self.assertEqual(grant.credentials["oauth_client"], "mail_microsoft")
        self.assertEqual(
            grant.provider_metadata,
            {"oauth_client": "mail_microsoft"},
        )

    def test_refresh_preserves_metadata_and_rotates_refresh_token(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "access_token": "new-access",
                    "refresh_token": "new-refresh",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "scope": "offline_access User.Read Mail.Send",
                },
            )

        refreshed = self._adapter(handler).refresh_credentials(
            {
                "access_token": "old-access",
                "refresh_token": "old-refresh",
                "expires_at": 0,
                "oauth_client": "mail_microsoft",
            }
        )

        self.assertEqual(refreshed["access_token"], "new-access")
        self.assertEqual(refreshed["refresh_token"], "new-refresh")
        self.assertEqual(refreshed["oauth_client"], "mail_microsoft")

    def test_exchange_transport_failure_is_temporary(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.host == "login.microsoftonline.com":
                return httpx.Response(
                    200,
                    json={
                        "access_token": "access",
                        "refresh_token": "refresh",
                        "token_type": "Bearer",
                        "expires_in": 3600,
                        "scope": "offline_access User.Read Mail.Send",
                    },
                )
            raise httpx.ConnectError("profile unavailable", request=request)

        with self.assertRaises(MailboxTemporaryFailure):
            self._adapter(handler).exchange_code(
                code="code",
                code_verifier="verifier",
            )

    def test_invalid_grant_distinguishes_authorization_from_refresh(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(400, json={"error": "invalid_grant"})

        adapter = self._adapter(handler)
        with self.assertRaises(MailboxAuthorizationFailed):
            adapter.exchange_code(code="code", code_verifier="verifier")
        with self.assertRaises(MailboxReauthRequired):
            adapter.refresh_credentials(
                {
                    "access_token": "expired",
                    "refresh_token": "refresh",
                    "expires_at": 0,
                }
            )

    def test_non_json_token_server_error_is_temporary(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="temporarily unavailable")

        with self.assertRaises(MailboxTemporaryFailure):
            self._adapter(handler).exchange_code(
                code="code",
                code_verifier="verifier",
            )

    def test_send_uses_standard_base64_mime_and_accepts_only_202(self) -> None:
        captured: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return httpx.Response(202)

        message = EmailMessage()
        message["From"] = "sender@outlook.com"
        message["To"] = "recipient@example.com"
        message["Subject"] = "Hello"
        message.set_content("Body")
        receipt = self._adapter(handler).send(
            credentials={"access_token": "access"}, message=message
        )
        self.assertEqual(receipt.provider, MICROSOFT_PROVIDER)
        self.assertIsNone(receipt.provider_message_id)
        self.assertEqual(
            base64.b64decode(captured[0].content),
            message.as_bytes(policy=__import__("email").policy.SMTP),
        )

    def test_rate_limit_and_ambiguous_server_error_are_domain_errors(self) -> None:
        message = EmailMessage()
        message.set_content("Body")
        with self.assertRaises(MailboxRateLimited):
            self._adapter(
                lambda request: httpx.Response(429, headers={"Retry-After": "12"})
            ).send(credentials={"access_token": "access"}, message=message)
        with self.assertRaises(MailboxDeliveryUnknown):
            self._adapter(
                lambda request: httpx.Response(503, content=json.dumps({"error": "no"}))
            ).send(credentials={"access_token": "access"}, message=message)

    @staticmethod
    def _adapter(handler) -> MicrosoftGraphAdapter:
        return MicrosoftGraphAdapter(
            client_id="mail-client",
            client_secret="mail-secret",
            redirect_uri="https://app.example/api/mail-connections/microsoft/callback",
            http_client=httpx.Client(transport=httpx.MockTransport(handler)),
            now=lambda: datetime(2026, 7, 15, tzinfo=timezone.utc),
        )


if __name__ == "__main__":
    unittest.main()
