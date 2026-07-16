from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..errors import (
    MailboxAuthorizationFailed,
    MailboxDeliveryUnknown,
    MailboxPermissionDenied,
    MailboxRateLimited,
    MailboxReauthRequired,
    MailboxTemporaryFailure,
)
from ..types import (
    MailCapability,
    MailboxGrant,
    MailboxIdentity,
    ProviderCredentialPayload,
    SendReceipt,
)

GOOGLE_PROVIDER = "google"

GOOGLE_SCOPES = (
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
)
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
_GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"


class _HttpFailure(RuntimeError):
    def __init__(self, status: int, payload: object):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.payload = payload


HttpRequest = Callable[..., dict]


def _default_http_request(
    method: str,
    url: str,
    *,
    form: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> dict:
    request_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if form is not None:
        data = urlencode(form).encode("utf-8")
        request_headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = Request(url, data=data, method=method, headers=request_headers)
    try:
        with urlopen(request, timeout=30) as response:
            body = response.read()
    except HTTPError as exc:
        body = exc.read()
        try:
            payload: object = json.loads(body) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = body.decode(errors="replace")
        raise _HttpFailure(exc.code, payload) from exc
    except (OSError, URLError) as exc:
        raise MailboxTemporaryFailure() from exc
    if not body:
        return {}
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MailboxTemporaryFailure() from exc
    if not isinstance(payload, dict):
        raise MailboxTemporaryFailure()
    return payload


def _failure_text(payload: object) -> str:
    try:
        return json.dumps(payload).lower()
    except (TypeError, ValueError):
        return str(payload).lower()


def _map_provider_failure(exc: _HttpFailure, *, authorization: bool) -> Exception:
    detail = _failure_text(exc.payload)
    if exc.status == 429:
        return MailboxRateLimited()
    if exc.status >= 500:
        return MailboxTemporaryFailure()
    if exc.status in (401, 403):
        if "insufficient" in detail or "scope" in detail:
            return MailboxPermissionDenied()
        return (
            MailboxAuthorizationFailed() if authorization else MailboxReauthRequired()
        )
    if "invalid_grant" in detail:
        return (
            MailboxAuthorizationFailed() if authorization else MailboxReauthRequired()
        )
    return MailboxAuthorizationFailed() if authorization else MailboxTemporaryFailure()


class GoogleMailboxAdapter:
    def __init__(
        self,
        *,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        legacy_client_id: str | None = None,
        legacy_client_secret: str | None = None,
        http_request: HttpRequest | None = None,
    ):
        self.client_id = client_id
        self._client_secret = client_secret
        self.redirect_uri = redirect_uri
        self._legacy_client_id = legacy_client_id
        self._legacy_client_secret = legacy_client_secret
        self._http_request = http_request or _default_http_request

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

    def exchange_code(self, *, code: str, code_verifier: str) -> MailboxGrant:
        try:
            token = self._http_request(
                "POST",
                _TOKEN_URL,
                form={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self._client_secret,
                    "redirect_uri": self.redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": code_verifier,
                },
            )
        except _HttpFailure as exc:
            raise _map_provider_failure(exc, authorization=True) from exc
        access_token = token.get("access_token")
        refresh_token = token.get("refresh_token")
        if not isinstance(access_token, str) or not access_token:
            raise MailboxAuthorizationFailed()
        if not isinstance(refresh_token, str) or not refresh_token:
            raise MailboxAuthorizationFailed()
        raw_scopes = token.get("scope")
        scopes = (
            frozenset(raw_scopes.split())
            if isinstance(raw_scopes, str)
            else frozenset()
        )
        if _GMAIL_SEND_SCOPE not in scopes:
            raise MailboxPermissionDenied()
        try:
            identity = self._http_request(
                "GET",
                _USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        except _HttpFailure as exc:
            raise _map_provider_failure(exc, authorization=True) from exc
        account_id = identity.get("sub")
        email = identity.get("email")
        if not isinstance(account_id, str) or not account_id:
            raise MailboxAuthorizationFailed()
        if not isinstance(email, str) or not email:
            raise MailboxAuthorizationFailed()
        expires_in = token.get("expires_in")
        expires_at = None
        if isinstance(expires_in, (int, float)):
            expires_at = datetime.now(timezone.utc).timestamp() + float(expires_in)
        credentials: ProviderCredentialPayload = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
            "oauth_client": "mail_google",
        }
        return MailboxGrant(
            identity=MailboxIdentity(
                provider_account_id=account_id,
                email=email,
                display_name=(
                    str(identity["name"])
                    if isinstance(identity.get("name"), str)
                    else None
                ),
            ),
            credentials=credentials,
            granted_scopes=scopes,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            provider_metadata={"oauth_client": "mail_google"},
        )

    def _oauth_client_for(
        self, credentials: ProviderCredentialPayload
    ) -> tuple[str, str]:
        if credentials.get("oauth_client") == "legacy_google":
            if not self._legacy_client_id or not self._legacy_client_secret:
                raise MailboxReauthRequired()
            return self._legacy_client_id, self._legacy_client_secret
        return self.client_id, self._client_secret

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
        client_id, client_secret = self._oauth_client_for(credentials)
        try:
            token = self._http_request(
                "POST",
                _TOKEN_URL,
                form={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        except _HttpFailure as exc:
            raise _map_provider_failure(exc, authorization=False) from exc
        access_token = token.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise MailboxReauthRequired()
        expires_in = token.get("expires_in")
        expires_at = None
        if isinstance(expires_in, (int, float)):
            expires_at = datetime.now(timezone.utc).timestamp() + float(expires_in)
        rotated_refresh = token.get("refresh_token")
        return {
            **credentials,
            "access_token": access_token,
            "refresh_token": (
                rotated_refresh
                if isinstance(rotated_refresh, str) and rotated_refresh
                else refresh_token
            ),
            "expires_at": expires_at,
        }

    def revoke(self, credentials: ProviderCredentialPayload) -> None:
        # Imported Gmail credentials came from the app-login grant. Revoking
        # that grant would unexpectedly disconnect Supabase identity login.
        if credentials.get("oauth_client") == "legacy_google":
            return
        token = credentials.get("refresh_token") or credentials.get("access_token")
        if not isinstance(token, str) or not token:
            return
        try:
            self._http_request("POST", _REVOKE_URL, form={"token": token})
        except Exception:
            return

    def send(
        self, *, credentials: ProviderCredentialPayload, message: EmailMessage
    ) -> SendReceipt:
        token = credentials.get("access_token")
        refresh = credentials.get("refresh_token")
        client_id, client_secret = self._oauth_client_for(credentials)
        creds = Credentials(
            token=token if isinstance(token, str) else None,
            refresh_token=refresh if isinstance(refresh, str) else None,
            token_uri=_TOKEN_URL,
            client_id=client_id,
            client_secret=client_secret,
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        try:
            result = (
                build("gmail", "v1", credentials=creds, cache_discovery=False)
                .users()
                .messages()
                .send(userId="me", body={"raw": raw})
                .execute()
            )
        except HttpError as exc:
            status = int(getattr(exc.resp, "status", 0))
            detail = bytes(exc.content or b"").decode(errors="replace").lower()
            if status == 401:
                raise MailboxReauthRequired() from exc
            if status == 429 or "ratelimit" in detail or "rate limit" in detail:
                raise MailboxRateLimited() from exc
            if status == 403:
                raise MailboxPermissionDenied() from exc
            if status >= 500:
                raise MailboxTemporaryFailure() from exc
            if "insufficient" in detail or "scope" in detail:
                raise MailboxPermissionDenied() from exc
            raise MailboxDeliveryUnknown() from exc
        return SendReceipt(GOOGLE_PROVIDER, True, result.get("id"))
