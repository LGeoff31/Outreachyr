from __future__ import annotations

from dataclasses import dataclass

from .errors import MailProviderNotFound
from .protocols import (
    CredentialRefresher,
    CredentialRevoker,
    MailSender,
    OAuthMailboxConnector,
)
from .types import MailCapability, MailProvider


@dataclass(frozen=True)
class ProviderDefinition:
    provider: MailProvider
    sender: MailSender
    capabilities: frozenset[MailCapability]
    oauth_connector: OAuthMailboxConnector | None = None
    credential_refresher: CredentialRefresher | None = None
    credential_revoker: CredentialRevoker | None = None


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, ProviderDefinition] = {}

    def register(self, definition: ProviderDefinition) -> None:
        key = definition.provider
        if not key or key.strip() != key:
            raise ValueError("Provider id must be a non-empty normalized string")
        if key in self._providers:
            raise ValueError(f"Provider already registered: {key}")
        self._providers[key] = definition

    def get(self, provider: MailProvider) -> ProviderDefinition:
        try:
            return self._providers[provider]
        except KeyError as exc:
            raise MailProviderNotFound() from exc

    def available(self) -> tuple[str, ...]:
        return tuple(sorted(self._providers))
