from __future__ import annotations

import base64
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import urlencode

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from ..errors import MailboxReauthRequired
from ..types import MailProvider, ProviderCredentialPayload, SendReceipt

GOOGLE_SCOPES = (
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
)


class GoogleMailboxAdapter:
    def __init__(self, *, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id = client_id
        self._client_secret = client_secret
        self.redirect_uri = redirect_uri

    def authorization_url(
        self, *, state: str, code_challenge: str, login_hint: str | None
    ) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": " ".join(GOOGLE_SCOPES),
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        if login_hint:
            params["login_hint"] = login_hint
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    def refresh_credentials(
        self, credentials: ProviderCredentialPayload
    ) -> ProviderCredentialPayload:
        expiry = credentials.get("expires_at")
        if (
            isinstance(expiry, (int, float))
            and expiry > datetime.now(timezone.utc).timestamp() + 60
        ):
            return credentials
        refresh_token = credentials.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise MailboxReauthRequired()
        creds = Credentials(
            token=credentials.get("access_token")
            if isinstance(credentials.get("access_token"), str)
            else None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.client_id,
            client_secret=self._client_secret,
        )
        try:
            creds.refresh(Request())
        except Exception as exc:
            raise MailboxReauthRequired() from exc
        return {
            **credentials,
            "access_token": creds.token or "",
            "expires_at": creds.expiry.timestamp() if creds.expiry else None,
        }

    def revoke(self, credentials: ProviderCredentialPayload) -> None:
        return None

    def send(
        self, *, credentials: ProviderCredentialPayload, message: EmailMessage
    ) -> SendReceipt:
        token = credentials.get("access_token")
        refresh = credentials.get("refresh_token")
        creds = Credentials(
            token=token if isinstance(token, str) else None,
            refresh_token=refresh if isinstance(refresh, str) else None,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=self.client_id,
            client_secret=self._client_secret,
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        result = (
            build("gmail", "v1", credentials=creds, cache_discovery=False)
            .users()
            .messages()
            .send(userId="me", body={"raw": raw})
            .execute()
        )
        return SendReceipt(MailProvider.GOOGLE, True, result.get("id"))
