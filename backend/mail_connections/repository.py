from __future__ import annotations

import builtins
import json
import uuid
from datetime import datetime
from typing import Any, Mapping

from sqlalchemy import text
from sqlalchemy.orm import Session

from .crypto import CredentialVault, EncryptedPayload
from .errors import (
    MailConnectionNotFound,
    MailCredentialVersionConflict,
)
from .types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
    MailProvider,
    MailboxGrant,
    OAuthState,
    ProviderCredentialPayload,
    StoredCredential,
)


_CONNECTION_COLUMNS = """
id, owner_id, provider, provider_account_id, email, display_name, status,
capabilities, granted_scopes, is_default, last_verified_at, last_error_code
"""


def _connection_from_row(row: Mapping[str, Any]) -> MailConnection:
    return MailConnection(
        id=uuid.UUID(str(row["id"])),
        owner_id=uuid.UUID(str(row["owner_id"])),
        provider=str(row["provider"]),
        provider_account_id=row.get("provider_account_id"),
        email=str(row["email"]),
        display_name=row.get("display_name"),
        status=MailConnectionStatus(str(row["status"])),
        capabilities=frozenset(
            MailCapability(str(value)) for value in (row.get("capabilities") or [])
        ),
        granted_scopes=frozenset(
            str(value) for value in (row.get("granted_scopes") or [])
        ),
        is_default=bool(row.get("is_default")),
        last_verified_at=row.get("last_verified_at"),
        last_error_code=row.get("last_error_code"),
    )


class MailConnectionRepository:
    """Server-only persistence for owner-scoped mailbox connections."""

    def __init__(self, session: Session, vault: CredentialVault):
        self.session = session
        self.vault = vault

    def commit(self) -> None:
        self.session.commit()

    def rollback(self) -> None:
        self.session.rollback()

    def list(self, owner_id: uuid.UUID) -> builtins.list[MailConnection]:
        rows = (
            self.session.execute(
                text(
                    f"""select {_CONNECTION_COLUMNS}
                from private.mail_connections
                where owner_id = :owner_id
                order by is_default desc, created_at asc, id asc"""
                ),
                {"owner_id": owner_id},
            )
            .mappings()
            .all()
        )
        return [_connection_from_row(dict(row)) for row in rows]

    def get(
        self, owner_id: uuid.UUID, connection_id: uuid.UUID
    ) -> MailConnection | None:
        row = (
            self.session.execute(
                text(
                    f"""select {_CONNECTION_COLUMNS}
                from private.mail_connections
                where owner_id = :owner_id and id = :connection_id"""
                ),
                {"owner_id": owner_id, "connection_id": connection_id},
            )
            .mappings()
            .first()
        )
        return _connection_from_row(dict(row)) if row else None

    def get_default(self, owner_id: uuid.UUID) -> MailConnection | None:
        row = (
            self.session.execute(
                text(
                    f"""select {_CONNECTION_COLUMNS}
                from private.mail_connections
                where owner_id = :owner_id and is_default
                limit 1"""
                ),
                {"owner_id": owner_id},
            )
            .mappings()
            .first()
        )
        return _connection_from_row(dict(row)) if row else None

    def upsert_connection(
        self,
        *,
        owner_id: uuid.UUID,
        provider: MailProvider,
        grant: MailboxGrant,
        target_connection_id: uuid.UUID | None = None,
        is_default: bool = False,
    ) -> MailConnection:
        params = {
            "owner_id": owner_id,
            "provider": provider,
            "provider_account_id": grant.identity.provider_account_id,
            "email": grant.identity.email,
            "display_name": grant.identity.display_name,
            "capabilities": [capability.value for capability in grant.capabilities],
            "granted_scopes": sorted(grant.granted_scopes),
            "provider_metadata": json.dumps(
                grant.provider_metadata,
                sort_keys=True,
            ),
            "is_default": is_default,
            "connection_id": target_connection_id,
        }
        if target_connection_id is not None:
            statement = text(
                f"""update private.mail_connections
                set provider_account_id = :provider_account_id,
                    email = :email,
                    display_name = :display_name,
                    status = 'connected',
                    capabilities = :capabilities,
                    granted_scopes = :granted_scopes,
                    provider_metadata = cast(:provider_metadata as jsonb),
                    last_verified_at = now(),
                    last_error_code = null,
                    last_error_at = null,
                    updated_at = now()
                where id = :connection_id and owner_id = :owner_id
                  and provider = :provider
                returning {_CONNECTION_COLUMNS}"""
            )
        else:
            statement = text(
                f"""insert into private.mail_connections
                  (owner_id, provider, provider_account_id, email, display_name,
                   status, capabilities, granted_scopes, provider_metadata,
                   is_default, last_verified_at)
                values
                  (:owner_id, :provider, :provider_account_id, :email, :display_name,
                   'connected', :capabilities, :granted_scopes,
                   cast(:provider_metadata as jsonb), :is_default, now())
                on conflict (owner_id, provider, provider_account_id)
                  where provider_account_id is not null
                do update set email = excluded.email,
                  display_name = excluded.display_name,
                  status = 'connected',
                  capabilities = excluded.capabilities,
                  granted_scopes = excluded.granted_scopes,
                  provider_metadata = excluded.provider_metadata,
                  last_verified_at = now(),
                  last_error_code = null,
                  last_error_at = null,
                  updated_at = now()
                returning {_CONNECTION_COLUMNS}"""
            )
        row = self.session.execute(statement, params).mappings().first()
        if not row:
            raise MailConnectionNotFound()
        return _connection_from_row(dict(row))

    def set_default(
        self, owner_id: uuid.UUID, connection_id: uuid.UUID
    ) -> MailConnection:
        existing = self.get(owner_id, connection_id)
        if existing is None:
            raise MailConnectionNotFound()
        self.session.execute(
            text(
                """update private.mail_connections
                set is_default = false, updated_at = now()
                where owner_id = :owner_id and is_default"""
            ),
            {"owner_id": owner_id},
        )
        row = (
            self.session.execute(
                text(
                    f"""update private.mail_connections
                set is_default = true, updated_at = now()
                where owner_id = :owner_id and id = :connection_id
                returning {_CONNECTION_COLUMNS}"""
                ),
                {"owner_id": owner_id, "connection_id": connection_id},
            )
            .mappings()
            .first()
        )
        if not row:
            raise MailConnectionNotFound()
        return _connection_from_row(dict(row))

    def delete(self, owner_id: uuid.UUID, connection_id: uuid.UUID) -> bool:
        row = (
            self.session.execute(
                text(
                    """delete from private.mail_connections
                where owner_id = :owner_id and id = :connection_id
                returning id"""
                ),
                {"owner_id": owner_id, "connection_id": connection_id},
            )
            .mappings()
            .first()
        )
        return row is not None

    def read_credentials(
        self, owner_id: uuid.UUID, connection_id: uuid.UUID
    ) -> StoredCredential:
        row = (
            self.session.execute(
                text(
                    """select c.encrypted_payload, c.key_id, c.credential_version
                from private.mail_connection_credentials c
                join private.mail_connections mc on mc.id = c.connection_id
                where mc.owner_id = :owner_id and mc.id = :connection_id"""
                ),
                {"owner_id": owner_id, "connection_id": connection_id},
            )
            .mappings()
            .first()
        )
        if not row:
            raise MailConnectionNotFound()
        encrypted = EncryptedPayload(
            key_id=str(row["key_id"]), ciphertext=bytes(row["encrypted_payload"])
        )
        payload = self.vault.decrypt(encrypted, context=f"connection:{connection_id}")
        return StoredCredential(payload=payload, version=int(row["credential_version"]))

    def write_credentials(
        self,
        owner_id: uuid.UUID,
        connection_id: uuid.UUID,
        payload: ProviderCredentialPayload,
        *,
        expected_version: int | None = None,
    ) -> int:
        encrypted = self.vault.encrypt(payload, context=f"connection:{connection_id}")
        params = {
            "owner_id": owner_id,
            "connection_id": connection_id,
            "encrypted_payload": encrypted.ciphertext,
            "key_id": encrypted.key_id,
            "expected_version": expected_version,
        }
        if expected_version is None:
            statement = text(
                """insert into private.mail_connection_credentials
                  (connection_id, encrypted_payload, key_id, credential_version)
                select id, :encrypted_payload, :key_id, 1
                from private.mail_connections
                where id = :connection_id and owner_id = :owner_id
                on conflict (connection_id) do update
                  set encrypted_payload = excluded.encrypted_payload,
                      key_id = excluded.key_id,
                      credential_version = private.mail_connection_credentials.credential_version + 1,
                      updated_at = now()
                returning credential_version"""
            )
        else:
            statement = text(
                """update private.mail_connection_credentials c
                set encrypted_payload = :encrypted_payload,
                    key_id = :key_id,
                    credential_version = c.credential_version + 1,
                    updated_at = now()
                from private.mail_connections mc
                where c.connection_id = :connection_id
                  and mc.id = c.connection_id
                  and mc.owner_id = :owner_id
                  and c.credential_version = :expected_version
                returning c.credential_version"""
            )
        row = self.session.execute(statement, params).mappings().first()
        if not row:
            if expected_version is not None:
                raise MailCredentialVersionConflict()
            raise MailConnectionNotFound()
        return int(row["credential_version"])

    def create_oauth_state(
        self,
        *,
        state_digest: bytes,
        owner_id: uuid.UUID,
        provider: MailProvider,
        target_connection_id: uuid.UUID | None,
        code_verifier: str,
        return_to: str,
        expires_at: datetime,
    ) -> None:
        encrypted = self.vault.encrypt(
            {"code_verifier": code_verifier},
            context=f"mail-oauth-state:{state_digest.hex()}",
        )
        self.session.execute(
            text(
                """insert into private.mail_oauth_states
                  (state_digest, owner_id, provider, target_connection_id,
                   encrypted_code_verifier, key_id, return_to, expires_at)
                values
                  (:state_digest, :owner_id, :provider, :target_connection_id,
                   :encrypted_code_verifier, :key_id, :return_to, :expires_at)"""
            ),
            {
                "state_digest": state_digest,
                "owner_id": owner_id,
                "provider": provider,
                "target_connection_id": target_connection_id,
                "encrypted_code_verifier": encrypted.ciphertext,
                "key_id": encrypted.key_id,
                "return_to": return_to,
                "expires_at": expires_at,
            },
        )

    def consume_oauth_state(
        self,
        *,
        state_digest: bytes,
        provider: MailProvider,
        now: datetime,
    ) -> OAuthState | None:
        row = (
            self.session.execute(
                text(
                    """delete from private.mail_oauth_states
                where state_digest = :state_digest
                  and provider = :provider
                  and expires_at > :now
                returning state_digest, owner_id, provider, target_connection_id,
                  encrypted_code_verifier, key_id, return_to, expires_at"""
                ),
                {"state_digest": state_digest, "provider": provider, "now": now},
            )
            .mappings()
            .first()
        )
        if not row:
            return None
        encrypted = EncryptedPayload(
            key_id=str(row["key_id"]),
            ciphertext=bytes(row["encrypted_code_verifier"]),
        )
        payload = self.vault.decrypt(
            encrypted, context=f"mail-oauth-state:{state_digest.hex()}"
        )
        verifier = payload.get("code_verifier")
        if not isinstance(verifier, str) or not verifier:
            raise ValueError("Invalid encrypted OAuth state")
        target = row.get("target_connection_id")
        return OAuthState(
            owner_id=uuid.UUID(str(row["owner_id"])),
            provider=str(row["provider"]),
            target_connection_id=uuid.UUID(str(target)) if target else None,
            code_verifier=verifier,
            return_to=str(row["return_to"]),
            expires_at=row["expires_at"],
        )

    def update_status(
        self,
        owner_id: uuid.UUID,
        connection_id: uuid.UUID,
        *,
        status: MailConnectionStatus,
        error_code: str | None,
        verified_at: datetime | None = None,
    ) -> None:
        self.session.execute(
            text(
                """update private.mail_connections
                set status = :status,
                    last_error_code = :error_code,
                    last_error_at = case when :error_code is null then null else now() end,
                    last_verified_at = coalesce(:verified_at, last_verified_at),
                    updated_at = now()
                where owner_id = :owner_id and id = :connection_id"""
            ),
            {
                "owner_id": owner_id,
                "connection_id": connection_id,
                "status": status.value,
                "error_code": error_code,
                "verified_at": verified_at,
            },
        )
