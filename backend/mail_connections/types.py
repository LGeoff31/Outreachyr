from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import TypeAlias

JSONValue: TypeAlias = (
    None | bool | int | float | str | list["JSONValue"] | dict[str, "JSONValue"]
)
ProviderCredentialPayload: TypeAlias = dict[str, JSONValue]


class MailProvider(str, Enum):
    GOOGLE = "google"


class MailCapability(str, Enum):
    SEND_MAIL = "send_mail"


class MailConnectionStatus(str, Enum):
    CONNECTED = "connected"
    RECONNECT_REQUIRED = "reconnect_required"
    ERROR = "error"


@dataclass(frozen=True)
class MailboxIdentity:
    provider_account_id: str
    email: str
    display_name: str | None = None


@dataclass(frozen=True, repr=False)
class MailboxGrant:
    identity: MailboxIdentity
    credentials: ProviderCredentialPayload
    granted_scopes: frozenset[str]
    capabilities: frozenset[MailCapability]

    def __repr__(self) -> str:
        return f"MailboxGrant(identity={self.identity!r}, credentials=<redacted>)"


@dataclass(frozen=True)
class PublicMailConnection:
    id: str
    provider: str
    email: str
    display_name: str | None
    status: str
    capabilities: tuple[str, ...]
    is_default: bool
    last_verified_at: datetime | None
    last_error_code: str | None


@dataclass(frozen=True, repr=False)
class MailConnection:
    id: uuid.UUID
    owner_id: uuid.UUID
    provider: MailProvider
    provider_account_id: str | None
    email: str
    display_name: str | None
    status: MailConnectionStatus
    capabilities: frozenset[MailCapability]
    granted_scopes: frozenset[str] = field(default_factory=frozenset)
    is_default: bool = False
    last_verified_at: datetime | None = None
    last_error_code: str | None = None

    def public(self) -> PublicMailConnection:
        return PublicMailConnection(
            id=str(self.id),
            provider=self.provider.value,
            email=self.email,
            display_name=self.display_name,
            status=self.status.value,
            capabilities=tuple(sorted(x.value for x in self.capabilities)),
            is_default=self.is_default,
            last_verified_at=self.last_verified_at,
            last_error_code=self.last_error_code,
        )

    def __repr__(self) -> str:
        return f"MailConnection(id={self.id!s}, provider={self.provider.value!r}, email={self.email!r})"


@dataclass(frozen=True)
class SendReceipt:
    provider: MailProvider
    accepted: bool
    provider_message_id: str | None = None
