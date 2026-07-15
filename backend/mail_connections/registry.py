from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .errors import MailProviderNotFound
from .types import MailCapability, MailProvider


@dataclass(frozen=True)
class ProviderDefinition:
    provider: MailProvider
    sender: Any
    capabilities: frozenset[MailCapability]
    oauth_connector: Any | None = None
    credential_refresher: Any | None = None
    credential_revoker: Any | None = None


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, ProviderDefinition] = {}

    def register(self, definition: ProviderDefinition) -> None:
        key = definition.provider.value
        if key in self._providers:
            raise ValueError(f"Provider already registered: {key}")
        self._providers[key] = definition

    def get(self, provider: str | MailProvider) -> ProviderDefinition:
        key = provider.value if isinstance(provider, MailProvider) else provider
        try:
            return self._providers[key]
        except KeyError as exc:
            raise MailProviderNotFound() from exc

    def available(self) -> tuple[str, ...]:
        return tuple(sorted(self._providers))
