"""Create provider-neutral encrypted mail connections and import Gmail sessions.

Revision ID: 0009_mail_connections
Revises: 0008_campaign_send_jobs
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text
from sqlalchemy.engine import Connection

from mail_connection_migration import (
    assert_legacy_owner_coverage,
    assert_legacy_tables_exist,
    credential_vault_from_environment,
    sync_legacy_google_sessions,
)

revision: str = "0009_mail_connections"
down_revision: str | None = "0008_campaign_send_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = (
    "create schema if not exists private",
    "revoke all privileges on schema private from public, anon, authenticated",
    """
    create table private.mail_connections (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users(id) on delete cascade,
      provider text not null check (btrim(provider) <> ''),
      provider_account_id text,
      email text not null check (btrim(email) <> ''),
      display_name text,
      status text not null default 'connected'
        check (status in ('connected', 'reconnect_required', 'error')),
      capabilities text[] not null default array[]::text[]
        check (array_position(capabilities, null) is null),
      granted_scopes text[] not null default array[]::text[]
        check (array_position(granted_scopes, null) is null),
      provider_metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(provider_metadata) = 'object'),
      is_default boolean not null default false,
      last_verified_at timestamptz,
      last_error_code text,
      last_error_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create unique index mail_connections_provider_account_key
      on private.mail_connections
        (owner_id, provider, provider_account_id)
      where provider_account_id is not null
    """,
    """
    create unique index mail_connections_one_default_per_owner
      on private.mail_connections (owner_id)
      where is_default
    """,
    """
    create unique index mail_connections_one_legacy_google_per_owner
      on private.mail_connections (owner_id)
      where provider = 'google'
        and provider_metadata ->> 'oauth_client' = 'legacy_google'
    """,
    """
    create index mail_connections_owner_provider_idx
      on private.mail_connections (owner_id, provider)
    """,
    """
    create table private.mail_connection_credentials (
      connection_id uuid primary key
        references private.mail_connections(id) on delete cascade,
      encrypted_payload bytea not null
        check (octet_length(encrypted_payload) > 0),
      key_id text not null check (btrim(key_id) <> ''),
      credential_version integer not null default 1
        check (credential_version > 0),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create table private.mail_oauth_states (
      state_digest bytea primary key check (octet_length(state_digest) = 32),
      owner_id uuid not null references auth.users(id) on delete cascade,
      provider text not null check (btrim(provider) <> ''),
      target_connection_id uuid
        references private.mail_connections(id) on delete cascade,
      encrypted_code_verifier bytea not null
        check (octet_length(encrypted_code_verifier) > 0),
      key_id text not null check (btrim(key_id) <> ''),
      return_to text not null check (btrim(return_to) <> ''),
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      check (expires_at > created_at)
    )
    """,
    """
    create index mail_oauth_states_owner_idx
      on private.mail_oauth_states (owner_id)
    """,
    """
    create index mail_oauth_states_expiry_idx
      on private.mail_oauth_states (expires_at)
    """,
    "alter table private.mail_connections enable row level security",
    "alter table private.mail_connection_credentials enable row level security",
    "alter table private.mail_oauth_states enable row level security",
    """
    revoke all privileges on private.mail_connections
      from public, anon, authenticated
    """,
    """
    revoke all privileges on private.mail_connection_credentials
      from public, anon, authenticated
    """,
    """
    revoke all privileges on private.mail_oauth_states
      from public, anon, authenticated
    """,
)

DOWNGRADE_STATEMENTS = (
    "drop table if exists private.mail_oauth_states",
    "drop table if exists private.mail_connection_credentials",
    "drop table if exists private.mail_connections",
)


def _execute_all(bind: Connection, statements: Sequence[str]) -> None:
    for statement in statements:
        bind.execute(text(statement))


def upgrade() -> None:
    # Resolve and validate the key ring before the first database mutation.
    vault = credential_vault_from_environment()
    bind = op.get_bind()
    _execute_all(bind, UPGRADE_STATEMENTS)
    sync_legacy_google_sessions(bind, vault)
    assert_legacy_owner_coverage(bind)


def downgrade() -> None:
    bind = op.get_bind()
    assert_legacy_tables_exist(bind)
    _execute_all(bind, DOWNGRADE_STATEMENTS)
