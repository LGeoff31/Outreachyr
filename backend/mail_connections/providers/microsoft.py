from __future__ import annotations

import base64
import email.policy
from collections.abc import Callable
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import urlencode

import httpx

from ..errors import (
    MailboxAuthorizationFailed,
    MailboxConnectionError,
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

MICROSOFT_PROVIDER = "microsoft"
_MICROSOFT_OAUTH_CLIENT = "mail_microsoft"

MICROSOFT_SCOPES = (
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Send",
)


class MicrosoftGraphAdapter:
    def __init__(
        self,
        *,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        tenant: str = "common",
        http_client: httpx.Client | None = None,
        now: Callable[[], datetime] | None = None,
    ):
        if not tenant or any(ch.isspace() or ch in "/?#:&" for ch in tenant):
            raise ValueError("Invalid Microsoft tenant")
        self.client_id = client_id
        self._client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.tenant = tenant
        self._http = http_client or httpx.Client(
            timeout=httpx.Timeout(connect=5, read=30, write=30, pool=5)
        )
        self._now = now or (lambda: datetime.now(timezone.utc))

    @property
    def _token_url(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0/token"

    def authorization_url(
        self, *, state: str, code_challenge: str, login_hint: str | None
    ) -> str:
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "response_mode": "query",
            "redirect_uri": self.redirect_uri,
            "scope": " ".join(MICROSOFT_SCOPES),
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        if login_hint:
            params["login_hint"] = login_hint
        return (
            f"https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0/authorize?"
            + urlencode(params)
        )

    def exchange_code(self, *, code: str, code_verifier: str) -> MailboxGrant:
        token = self._token_request(
            {
                "client_id": self.client_id,
                "client_secret": self._client_secret,
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code",
                "scope": " ".join(MICROSOFT_SCOPES),
            },
            authorization=True,
        )
        try:
            profile_response = self._http.get(
                "https://graph.microsoft.com/v1.0/me",
                params={"$select": "id,displayName,mail,userPrincipalName"},
                headers={"Authorization": f"Bearer {token['access_token']}"},
            )
        except httpx.HTTPError as exc:
            raise MailboxTemporaryFailure() from exc
        self._raise_graph_error(
            profile_response,
            send_started=False,
            authorization=True,
        )
        try:
            profile = profile_response.json()
        except ValueError as exc:
            raise MailboxAuthorizationFailed() from exc
        account_id = str(profile.get("id") or "").strip()
        address = str(
            profile.get("mail") or profile.get("userPrincipalName") or ""
        ).strip()
        if not account_id or not address:
            raise MailboxAuthorizationFailed()
        return MailboxGrant(
            identity=MailboxIdentity(
                account_id,
                address,
                str(profile.get("displayName") or "").strip() or None,
            ),
            credentials={**token, "oauth_client": _MICROSOFT_OAUTH_CLIENT},
            granted_scopes=frozenset(str(token["scope"]).split()),
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            provider_metadata={"oauth_client": _MICROSOFT_OAUTH_CLIENT},
        )

    def refresh_credentials(
        self, credentials: ProviderCredentialPayload
    ) -> ProviderCredentialPayload:
        expiry = credentials.get("expires_at")
        if isinstance(expiry, (int, float)) and expiry > self._now().timestamp() + 60:
            return credentials
        refresh = credentials.get("refresh_token")
        if not isinstance(refresh, str) or not refresh:
            raise MailboxReauthRequired()
        refreshed = self._token_request(
            {
                "client_id": self.client_id,
                "client_secret": self._client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "scope": " ".join(MICROSOFT_SCOPES),
            },
            authorization=False,
        )
        return {
            **credentials,
            **refreshed,
            "refresh_token": refreshed.get("refresh_token") or refresh,
        }

    def revoke(self, credentials: ProviderCredentialPayload) -> None:
        return None

    def send(
        self, *, credentials: ProviderCredentialPayload, message: EmailMessage
    ) -> SendReceipt:
        token = credentials.get("access_token")
        if not isinstance(token, str) or not token:
            raise MailboxReauthRequired()
        encoded = base64.b64encode(message.as_bytes(policy=email.policy.SMTP))
        if len(encoded) > 4_000_000:
            raise MailboxConnectionError("microsoft_message_too_large")
        try:
            response = self._http.post(
                "https://graph.microsoft.com/v1.0/me/sendMail",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "text/plain",
                },
                content=encoded,
            )
        except (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.PoolTimeout,
        ) as exc:
            raise MailboxTemporaryFailure() from exc
        except (
            httpx.WriteTimeout,
            httpx.ReadTimeout,
            httpx.RemoteProtocolError,
            httpx.WriteError,
            httpx.ReadError,
        ) as exc:
            raise MailboxDeliveryUnknown() from exc
        except httpx.HTTPError as exc:
            raise MailboxDeliveryUnknown() from exc
        if response.status_code == 202:
            return SendReceipt(MICROSOFT_PROVIDER, True, None)
        self._raise_graph_error(response, send_started=True)
        raise MailboxConnectionError("microsoft_provider_error")

    def _token_request(
        self,
        form: dict[str, str],
        *,
        authorization: bool,
    ) -> ProviderCredentialPayload:
        try:
            response = self._http.post(self._token_url, data=form)
        except httpx.HTTPError as exc:
            raise MailboxTemporaryFailure() from exc
        if response.status_code >= 500:
            raise MailboxTemporaryFailure()
        if response.status_code == 429:
            try:
                retry_after = max(1, int(response.headers.get("Retry-After", "60")))
            except ValueError:
                retry_after = 60
            raise MailboxRateLimited(retry_after)
        try:
            payload = response.json()
        except ValueError as exc:
            if authorization:
                raise MailboxAuthorizationFailed() from exc
            if response.status_code >= 400:
                raise MailboxReauthRequired() from exc
            raise MailboxConnectionError("microsoft_oauth_invalid_response") from exc
        if response.status_code >= 400:
            code = str(payload.get("error") or "")
            if code in {"invalid_grant", "interaction_required", "consent_required"}:
                if authorization:
                    raise MailboxAuthorizationFailed()
                raise MailboxReauthRequired()
            if code in {"server_error", "temporarily_unavailable"}:
                raise MailboxTemporaryFailure()
            if authorization:
                raise MailboxAuthorizationFailed()
            raise MailboxConnectionError("microsoft_oauth_configuration")
        access = str(payload.get("access_token") or "").strip()
        refresh = str(payload.get("refresh_token") or "").strip()
        token_type = str(payload.get("token_type") or "").strip()
        try:
            expires_in = float(payload.get("expires_in"))
        except (TypeError, ValueError) as exc:
            if authorization:
                raise MailboxAuthorizationFailed() from exc
            raise MailboxConnectionError("microsoft_oauth_invalid_response") from exc
        if not access or token_type.lower() != "bearer" or expires_in <= 0:
            if authorization:
                raise MailboxAuthorizationFailed()
            raise MailboxConnectionError("microsoft_oauth_invalid_response")
        if form["grant_type"] == "authorization_code" and not refresh:
            raise MailboxAuthorizationFailed()
        scopes = str(payload.get("scope") or form.get("scope") or "")
        normalized = {part.rsplit("/", 1)[-1].lower() for part in scopes.split()}
        if not {"user.read", "mail.send"}.issubset(normalized):
            raise MailboxPermissionDenied()
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "Bearer",
            "expires_at": self._now().timestamp() + expires_in,
            "scope": scopes,
        }

    @staticmethod
    def _raise_graph_error(
        response: httpx.Response,
        *,
        send_started: bool,
        authorization: bool = False,
    ) -> None:
        status = response.status_code
        if status < 400:
            return
        if status == 401:
            if authorization:
                raise MailboxAuthorizationFailed()
            raise MailboxReauthRequired()
        if status == 403:
            raise MailboxPermissionDenied()
        if status == 429:
            try:
                retry_after = max(1, int(response.headers.get("Retry-After", "60")))
            except ValueError:
                retry_after = 60
            raise MailboxRateLimited(retry_after)
        if status == 413:
            raise MailboxConnectionError("microsoft_message_too_large")
        if status >= 500:
            if send_started:
                raise MailboxDeliveryUnknown()
            raise MailboxTemporaryFailure()
        if status == 400:
            if authorization:
                raise MailboxAuthorizationFailed()
            raise MailboxConnectionError("microsoft_message_rejected")
        if authorization:
            raise MailboxAuthorizationFailed()
        raise MailboxConnectionError("microsoft_provider_error")
