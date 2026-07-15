from __future__ import annotations

from email.message import EmailMessage
from typing import Protocol

from .types import MailboxGrant, ProviderCredentialPayload, SendReceipt


class OAuthMailboxConnector(Protocol):
    def authorization_url(
        self, *, state: str, code_challenge: str, login_hint: str | None
    ) -> str: ...
    def exchange_code(self, *, code: str, code_verifier: str) -> MailboxGrant: ...


class CredentialRefresher(Protocol):
    def refresh_credentials(
        self, credentials: ProviderCredentialPayload
    ) -> ProviderCredentialPayload: ...


class CredentialRevoker(Protocol):
    def revoke(self, credentials: ProviderCredentialPayload) -> None: ...


class MailSender(Protocol):
    def send(
        self, *, credentials: ProviderCredentialPayload, message: EmailMessage
    ) -> SendReceipt: ...
