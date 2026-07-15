"""provider-neutral encrypted mail connections

Revision ID: 0009_mail_connections
Revises: 0008_campaign_send_jobs
"""

from __future__ import annotations

from collections.abc import Sequence
from alembic import op

revision: str = "0009_mail_connections"
down_revision: str | None = "0008_campaign_send_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("create schema if not exists private")
    op.execute("""create table private.mail_connections (
      id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
      provider text not null, provider_account_id text, email text not null, display_name text,
      status text not null default 'connected' check (status in ('connected','reconnect_required','error')),
      capabilities text[] not null default array[]::text[], granted_scopes text[] not null default array[]::text[],
      provider_metadata jsonb not null default '{}'::jsonb, is_default boolean not null default false,
      last_verified_at timestamptz, last_error_code text, last_error_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now())""")
    op.execute("""create unique index mail_connections_provider_account_key on private.mail_connections
      (owner_id, provider, provider_account_id) where provider_account_id is not null""")
    op.execute(
        "create unique index mail_connections_one_default_per_owner on private.mail_connections(owner_id) where is_default"
    )
    op.execute(
        "create index mail_connections_owner_idx on private.mail_connections(owner_id)"
    )
    op.execute("""create table private.mail_connection_credentials (
      connection_id uuid primary key references private.mail_connections(id) on delete cascade,
      encrypted_payload bytea not null, key_id text not null, credential_version integer not null default 1,
      updated_at timestamptz not null default now())""")
    op.execute("""create table private.mail_oauth_states (
      state_digest bytea primary key, owner_id uuid not null references auth.users(id) on delete cascade,
      provider text not null, target_connection_id uuid references private.mail_connections(id) on delete cascade,
      encrypted_code_verifier bytea not null, key_id text not null, return_to text not null,
      expires_at timestamptz not null, created_at timestamptz not null default now())""")
    op.execute(
        "create index mail_oauth_states_expiry_idx on private.mail_oauth_states(expires_at)"
    )
    for table in (
        "mail_connections",
        "mail_connection_credentials",
        "mail_oauth_states",
    ):
        op.execute(f"alter table private.{table} enable row level security")
        op.execute(f"revoke all on private.{table} from public, anon, authenticated")
    op.execute("revoke all on schema private from public, anon, authenticated")


def downgrade() -> None:
    op.execute("drop table if exists private.mail_oauth_states")
    op.execute("drop table if exists private.mail_connection_credentials")
    op.execute("drop table if exists private.mail_connections")
