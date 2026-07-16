"""Bind-level helpers for migrating legacy Gmail sessions without exposing secrets."""

from __future__ import annotations

import json
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, Protocol

from sqlalchemy import text

from config import mailbox_credential_keys
from mail_connections.crypto import CredentialVault, EncryptedPayload
from mail_connections.types import ProviderCredentialPayload

_LEGACY_GOOGLE_CLIENT = "legacy_google"
_GOOGLE_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"


class MigrationBind(Protocol):
    def execute(
        self,
        statement: Any,
        parameters: dict[str, Any] | None = None,
    ) -> Any: ...


def credential_vault_from_environment() -> CredentialVault:
    """Build the migration vault before any schema or data mutation occurs."""

    return CredentialVault.from_config(mailbox_credential_keys())


def _metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, str):
        parsed = json.loads(value)
        return dict(parsed) if isinstance(parsed, Mapping) else {}
    return {}


def _newest_sessions(
    rows: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    newest: dict[str, dict[str, Any]] = {}
    for source in rows:
        row = dict(source)
        owner_id = str(row["owner_id"])
        candidate_key = (row["created_at"], str(row["session_id"]))
        existing = newest.get(owner_id)
        if existing is None or candidate_key > (
            existing["created_at"],
            str(existing["session_id"]),
        ):
            newest[owner_id] = row
    return [newest[owner_id] for owner_id in sorted(newest)]


def _legacy_metadata(session: Mapping[str, Any]) -> dict[str, Any]:
    created_at = session["created_at"]
    return {
        "oauth_client": _LEGACY_GOOGLE_CLIENT,
        "legacy_session_id": str(session["session_id"]),
        "legacy_created_at": (
            created_at.isoformat()
            if isinstance(created_at, datetime)
            else str(created_at)
        ),
    }


def _legacy_payload(session: Mapping[str, Any]) -> ProviderCredentialPayload:
    return {
        "email": str(session["email"]),
        "oauth_client": _LEGACY_GOOGLE_CLIENT,
        "refresh_token": str(session["refresh_token"]),
    }


def _credential_matches(
    row: Mapping[str, Any],
    vault: CredentialVault,
    *,
    connection_id: str,
    expected: ProviderCredentialPayload,
) -> bool:
    ciphertext = row.get("encrypted_payload")
    key_id = row.get("key_id")
    if ciphertext is None or key_id is None:
        return False
    try:
        actual = vault.decrypt(
            EncryptedPayload(key_id=str(key_id), ciphertext=bytes(ciphertext)),
            context=f"connection:{connection_id}",
        )
    except ValueError:
        return False
    return actual == expected


def _write_credentials(
    bind: MigrationBind,
    vault: CredentialVault,
    *,
    connection_id: str,
    payload: ProviderCredentialPayload,
) -> None:
    encrypted = vault.encrypt(payload, context=f"connection:{connection_id}")
    bind.execute(
        text(
            """/* legacy-mail:write-credentials */
            insert into private.mail_connection_credentials
              (connection_id, encrypted_payload, key_id, credential_version)
            values
              (:connection_id, :encrypted_payload, :key_id, 1)
            on conflict (connection_id) do update set
              encrypted_payload = excluded.encrypted_payload,
              key_id = excluded.key_id,
              credential_version =
                private.mail_connection_credentials.credential_version + 1,
              updated_at = now()
            """
        ),
        {
            "connection_id": connection_id,
            "encrypted_payload": encrypted.ciphertext,
            "key_id": encrypted.key_id,
        },
    )


def sync_legacy_google_sessions(bind: MigrationBind, vault: CredentialVault) -> int:
    """Copy each owner's newest legacy Gmail session into private storage.

    Existing dedicated Google connections always win. Existing legacy imports
    are updated only when their selected source row actually changed.
    """

    selected_rows = (
        bind.execute(
            text(
                """/* legacy-mail:load-sessions */
                select distinct on (owner_id)
                  session_id, owner_id, refresh_token, email, created_at
                from public.gmail_send_sessions
                order by owner_id, created_at desc, session_id desc
                """
            )
        )
        .mappings()
        .all()
    )
    rows = [dict(row) for row in selected_rows]
    changed = 0
    for session in _newest_sessions(rows):
        owner_id = str(session["owner_id"])
        selected_connections = (
            bind.execute(
                text(
                    """/* legacy-mail:load-connections */
                    select mc.id, mc.owner_id, mc.provider, mc.email,
                      mc.is_default, mc.created_at, mc.provider_metadata,
                      credentials.encrypted_payload, credentials.key_id,
                      credentials.credential_version
                    from private.mail_connections mc
                    left join private.mail_connection_credentials credentials
                      on credentials.connection_id = mc.id
                    where mc.owner_id = :owner_id
                    order by mc.created_at desc, mc.id desc
                    """
                ),
                {"owner_id": owner_id},
            )
            .mappings()
            .all()
        )
        existing = [dict(row) for row in selected_connections]
        google_connections = [
            row for row in existing if str(row.get("provider")) == "google"
        ]
        legacy = next(
            (
                row
                for row in google_connections
                if _metadata(row.get("provider_metadata")).get("oauth_client")
                == _LEGACY_GOOGLE_CLIENT
            ),
            None,
        )
        if legacy is None and google_connections:
            continue

        expected_metadata = _legacy_metadata(session)
        expected_payload = _legacy_payload(session)
        if legacy is None:
            connection_id = str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"outreachyr:legacy-google:{owner_id}",
                )
            )
            bind.execute(
                text(
                    f"""/* legacy-mail:insert-connection */
                    insert into private.mail_connections
                      (id, owner_id, provider, provider_account_id, email,
                       status, capabilities, granted_scopes, provider_metadata,
                       is_default, created_at, updated_at)
                    values
                      (:connection_id, :owner_id, 'google', null, :email,
                       'connected', array['send_mail']::text[],
                       array['{_GOOGLE_SEND_SCOPE}']::text[],
                       cast(:provider_metadata as jsonb), :is_default,
                       :created_at, now())
                    """
                ),
                {
                    "connection_id": connection_id,
                    "owner_id": owner_id,
                    "email": str(session["email"]),
                    "provider_metadata": json.dumps(expected_metadata, sort_keys=True),
                    "is_default": not any(
                        bool(row.get("is_default")) for row in existing
                    ),
                    "created_at": session["created_at"],
                },
            )
        else:
            connection_id = str(legacy["id"])
            if (
                str(legacy.get("email")) == str(session["email"])
                and _metadata(legacy.get("provider_metadata")) == expected_metadata
                and _credential_matches(
                    legacy,
                    vault,
                    connection_id=connection_id,
                    expected=expected_payload,
                )
            ):
                continue
            bind.execute(
                text(
                    f"""/* legacy-mail:update-connection */
                    update private.mail_connections
                    set email = :email,
                      status = 'connected',
                      capabilities = array['send_mail']::text[],
                      granted_scopes = array['{_GOOGLE_SEND_SCOPE}']::text[],
                      provider_metadata = cast(:provider_metadata as jsonb),
                      last_error_code = null,
                      last_error_at = null,
                      updated_at = now()
                    where id = :connection_id and provider = 'google'
                    """
                ),
                {
                    "connection_id": connection_id,
                    "email": str(session["email"]),
                    "provider_metadata": json.dumps(expected_metadata, sort_keys=True),
                },
            )

        _write_credentials(
            bind,
            vault,
            connection_id=connection_id,
            payload=expected_payload,
        )
        changed += 1
    return changed


def assert_legacy_owner_coverage(bind: MigrationBind) -> None:
    missing_count = bind.execute(
        text(
            """/* legacy-mail:coverage */
            select count(*)
            from (
              select distinct owner_id
              from public.gmail_send_sessions
              except
              select distinct owner_id
              from private.mail_connections
              where provider = 'google'
            ) missing
            """
        )
    ).scalar_one()
    if int(missing_count):
        raise RuntimeError(
            "At least one legacy Gmail owner has no Google mail connection"
        )


def assert_no_pending_send_jobs(bind: MigrationBind) -> None:
    has_pending = bind.execute(
        text(
            """/* legacy-mail:pending */
            select exists (
              select 1
              from public.campaign_send_jobs
              where status = :pending_status
            )
            """
        ),
        {"pending_status": "pending"},
    ).scalar_one()
    if bool(has_pending):
        raise RuntimeError(
            "Cannot remove legacy mail tables while pending campaign send jobs remain"
        )


def assert_legacy_tables_exist(bind: MigrationBind) -> None:
    tables_exist = bind.execute(
        text(
            """/* legacy-mail:legacy-tables */
            select
              to_regclass(:sessions_table) is not null
              and to_regclass(:jobs_table) is not null
            """
        ),
        {
            "sessions_table": "public.gmail_send_sessions",
            "jobs_table": "public.campaign_send_jobs",
        },
    ).scalar_one()
    if not bool(tables_exist):
        raise RuntimeError(
            "Legacy Gmail session and campaign job tables must exist before downgrade"
        )


def reconstruct_legacy_gmail_sessions(
    bind: MigrationBind, vault: CredentialVault
) -> int:
    """Restore one usable legacy row for every imported Google connection."""

    rows = (
        bind.execute(
            text(
                """/* legacy-mail:reconstruct-source */
                select mc.id, mc.owner_id, mc.email, mc.created_at,
                  mc.provider_metadata, credentials.encrypted_payload,
                  credentials.key_id, credentials.credential_version
                from private.mail_connections mc
                join private.mail_connection_credentials credentials
                  on credentials.connection_id = mc.id
                where mc.provider = 'google'
                  and mc.provider_metadata ->> 'oauth_client' = :oauth_client
                order by mc.owner_id, mc.created_at desc, mc.id desc
                """
            ),
            {"oauth_client": _LEGACY_GOOGLE_CLIENT},
        )
        .mappings()
        .all()
    )
    restored = 0
    for row in rows:
        connection_id = str(row["id"])
        payload = vault.decrypt(
            EncryptedPayload(
                key_id=str(row["key_id"]),
                ciphertext=bytes(row["encrypted_payload"]),
            ),
            context=f"connection:{connection_id}",
        )
        refresh_token = payload.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token:
            raise RuntimeError(
                "Legacy Google connection cannot be reconstructed without a refresh token"
            )
        payload_email = payload.get("email")
        email = (
            payload_email
            if isinstance(payload_email, str) and payload_email
            else str(row["email"])
        )
        metadata = _metadata(row.get("provider_metadata"))
        session_id = str(metadata.get("legacy_session_id") or f"legacy-{connection_id}")
        bind.execute(
            text(
                """/* legacy-mail:restore-session */
                insert into public.gmail_send_sessions
                  (session_id, owner_id, refresh_token, email, created_at)
                values
                  (:session_id, :owner_id, :refresh_token, :email, :created_at)
                on conflict (session_id) do update set
                  owner_id = excluded.owner_id,
                  refresh_token = excluded.refresh_token,
                  email = excluded.email,
                  created_at = excluded.created_at
                """
            ),
            {
                "session_id": session_id,
                "owner_id": str(row["owner_id"]),
                "refresh_token": refresh_token,
                "email": email,
                "created_at": row["created_at"],
            },
        )
        restored += 1
    return restored
