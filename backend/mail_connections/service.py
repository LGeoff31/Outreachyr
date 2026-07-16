from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable
from urllib.parse import urlsplit

from .errors import (
    MailboxConnectionError,
    MailConnectionAccountMismatch,
    MailConnectionNotFound,
    MailConnectionProviderMismatch,
    MailInvalidReturnTo,
    MailOAuthStateInvalid,
    MailProviderNotFound,
    MailProviderAuthorizationNotSupported,
)
from .registry import ProviderRegistry
from .repository import MailConnectionRepository
from .types import MailConnection, MailProvider


@dataclass(frozen=True)
class AuthorizationStart:
    authorization_url: str


@dataclass(frozen=True)
class AuthorizationResult:
    owner_id: uuid.UUID
    connection: MailConnection
    return_to: str


def safe_return_to(value: str) -> str:
    candidate = value.strip()
    parsed = urlsplit(candidate)
    if (
        not candidate.startswith("/")
        or candidate.startswith("//")
        or parsed.scheme
        or parsed.netloc
        or "\\" in candidate
        or "\r" in candidate
        or "\n" in candidate
    ):
        raise MailInvalidReturnTo()
    return candidate


def _state_digest(state: str) -> bytes:
    return hashlib.sha256(state.encode("utf-8")).digest()


def _pkce_challenge(verifier: str) -> str:
    return (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )


class MailConnectionService:
    def __init__(
        self,
        repository: MailConnectionRepository,
        registry: ProviderRegistry,
        *,
        now: Callable[[], datetime] | None = None,
    ):
        self.repository = repository
        self.registry = registry
        self._now = now or (lambda: datetime.now(timezone.utc))

    def list_connections(self, owner_id: uuid.UUID) -> list[MailConnection]:
        return self.repository.list(owner_id)

    def begin_authorization(
        self,
        *,
        owner_id: uuid.UUID,
        provider: MailProvider,
        return_to: str,
        target_connection_id: uuid.UUID | None = None,
    ) -> AuthorizationStart:
        definition = self.registry.get(provider)
        connector = definition.oauth_connector
        if connector is None:
            raise MailProviderAuthorizationNotSupported()
        resolved_return_to = safe_return_to(return_to)
        target: MailConnection | None = None
        if target_connection_id is not None:
            target = self.repository.get(owner_id, target_connection_id)
            if target is None:
                raise MailConnectionNotFound()
            if target.provider != provider:
                raise MailConnectionProviderMismatch()

        state = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        self.repository.create_oauth_state(
            state_digest=_state_digest(state),
            owner_id=owner_id,
            provider=provider,
            target_connection_id=target_connection_id,
            code_verifier=verifier,
            return_to=resolved_return_to,
            expires_at=self._now() + timedelta(minutes=10),
        )
        self.repository.commit()
        return AuthorizationStart(
            authorization_url=connector.authorization_url(
                state=state,
                code_challenge=_pkce_challenge(verifier),
                login_hint=target.email if target else None,
            )
        )

    def complete_authorization(
        self,
        *,
        provider: MailProvider,
        state: str,
        code: str,
    ) -> AuthorizationResult:
        if not state or not code:
            raise MailOAuthStateInvalid()
        oauth_state = self.repository.consume_oauth_state(
            state_digest=_state_digest(state),
            provider=provider,
            now=self._now(),
        )
        if oauth_state is None:
            raise MailOAuthStateInvalid()
        # Persist the one-time consume before making any provider request. This
        # prevents a callback replay even when exchange or persistence fails.
        self.repository.commit()
        if oauth_state.provider != provider:
            raise MailOAuthStateInvalid()

        definition = self.registry.get(provider)
        connector = definition.oauth_connector
        if connector is None:
            raise MailProviderAuthorizationNotSupported()
        try:
            grant = connector.exchange_code(
                code=code,
                code_verifier=oauth_state.code_verifier,
            )
        except MailboxConnectionError as exc:
            exc.return_to = safe_return_to(oauth_state.return_to)
            raise

        target: MailConnection | None = None
        if oauth_state.target_connection_id is not None:
            target = self.repository.get(
                oauth_state.owner_id, oauth_state.target_connection_id
            )
            if target is None:
                self.repository.rollback()
                exc = MailConnectionNotFound()
                exc.return_to = safe_return_to(oauth_state.return_to)
                raise exc
            if target.provider != provider:
                self.repository.rollback()
                exc = MailConnectionProviderMismatch()
                exc.return_to = safe_return_to(oauth_state.return_to)
                raise exc
            if (
                target.provider_account_id
                and target.provider_account_id != grant.identity.provider_account_id
            ):
                self.repository.rollback()
                exc = MailConnectionAccountMismatch()
                exc.return_to = safe_return_to(oauth_state.return_to)
                raise exc
            if (
                not target.provider_account_id
                and target.email.casefold() != grant.identity.email.casefold()
            ):
                self.repository.rollback()
                exc = MailConnectionAccountMismatch()
                exc.return_to = safe_return_to(oauth_state.return_to)
                raise exc

        is_default = (
            target.is_default
            if target is not None
            else self.repository.get_default(oauth_state.owner_id) is None
        )
        try:
            connection = self.repository.upsert_connection(
                owner_id=oauth_state.owner_id,
                provider=provider,
                grant=grant,
                target_connection_id=oauth_state.target_connection_id,
                is_default=is_default,
            )
            self.repository.write_credentials(
                oauth_state.owner_id,
                connection.id,
                grant.credentials,
            )
            self.repository.commit()
        except MailboxConnectionError as exc:
            self.repository.rollback()
            exc.return_to = safe_return_to(oauth_state.return_to)
            raise
        except Exception:
            self.repository.rollback()
            raise
        return AuthorizationResult(
            owner_id=oauth_state.owner_id,
            connection=connection,
            return_to=safe_return_to(oauth_state.return_to),
        )

    def reject_authorization(self, *, provider: MailProvider, state: str) -> str:
        if not state:
            raise MailOAuthStateInvalid()
        oauth_state = self.repository.consume_oauth_state(
            state_digest=_state_digest(state),
            provider=provider,
            now=self._now(),
        )
        if oauth_state is None:
            raise MailOAuthStateInvalid()
        self.repository.commit()
        return safe_return_to(oauth_state.return_to)

    def set_default(
        self, owner_id: uuid.UUID, connection_id: uuid.UUID
    ) -> MailConnection:
        try:
            connection = self.repository.set_default(owner_id, connection_id)
            self.repository.commit()
            return connection
        except Exception:
            self.repository.rollback()
            raise

    def disconnect(self, owner_id: uuid.UUID, connection_id: uuid.UUID) -> None:
        connection = self.repository.get(owner_id, connection_id)
        if connection is None:
            raise MailConnectionNotFound()
        try:
            definition = self.registry.get(connection.provider)
        except MailProviderNotFound:
            definition = None
        if definition is not None and definition.credential_revoker is not None:
            try:
                stored = self.repository.read_credentials(owner_id, connection_id)
                definition.credential_revoker.revoke(stored.payload)
            except MailConnectionNotFound:
                pass
            except Exception:
                # Revocation is best-effort; deleting our copy remains the
                # security-critical operation.
                pass
        if not self.repository.delete(owner_id, connection_id):
            self.repository.rollback()
            raise MailConnectionNotFound()
        if connection.is_default:
            remaining = self.repository.list(owner_id)
            if remaining:
                self.repository.set_default(owner_id, remaining[0].id)
        self.repository.commit()
