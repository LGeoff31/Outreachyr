"""Cut over from legacy Gmail sessions to provider-neutral mail connections.

Revision ID: 0010_remove_legacy_mail_sessions
Revises: 0009_mail_connections
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text
from sqlalchemy.engine import Connection

from mail_connection_migration import (
    assert_legacy_owner_coverage,
    assert_no_pending_send_jobs,
    credential_vault_from_environment,
    reconstruct_legacy_gmail_sessions,
    sync_legacy_google_sessions,
)

revision: str = "0010_remove_legacy_mail_sessions"
down_revision: str | None = "0009_mail_connections"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DROP_STATEMENTS = (
    "drop table public.campaign_send_jobs",
    "drop table public.gmail_send_sessions",
)

DOWNGRADE_STATEMENTS = (
    """
    create table public.gmail_send_sessions (
      session_id text primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      refresh_token text not null,
      email text not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create index gmail_send_sessions_owner_id_idx
      on public.gmail_send_sessions (owner_id)
    """,
    """
    create table public.campaign_send_jobs (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users(id) on delete cascade,
      session_id text not null,
      sender_email text not null,
      messages_json jsonb not null,
      next_index integer not null default 0,
      chunk_sent_count integer not null default 0,
      chunk_target integer,
      status text not null default 'pending',
      next_send_after timestamptz,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create index campaign_send_jobs_status_next_send_after_idx
      on public.campaign_send_jobs (status, next_send_after)
    """,
    "alter table public.gmail_send_sessions enable row level security",
    "alter table public.campaign_send_jobs enable row level security",
    """
    revoke all privileges on public.gmail_send_sessions
      from public, anon, authenticated
    """,
    """
    revoke all privileges on public.campaign_send_jobs
      from public, anon, authenticated
    """,
)


def _execute_all(bind: Connection, statements: Sequence[str]) -> None:
    for statement in statements:
        bind.execute(text(statement))


def upgrade() -> None:
    # Validate configuration before the first database operation.
    vault = credential_vault_from_environment()
    bind = op.get_bind()
    # Lock both legacy writers before checking the queue. Otherwise an old app
    # instance could enqueue between the guard and the destructive cutover.
    bind.execute(
        text(
            """
            lock table public.campaign_send_jobs,
              public.gmail_send_sessions
              in share row exclusive mode
            """
        )
    )
    assert_no_pending_send_jobs(bind)
    sync_legacy_google_sessions(bind, vault)
    assert_legacy_owner_coverage(bind)
    _execute_all(bind, DROP_STATEMENTS)


def downgrade() -> None:
    # Downgrade reconstruction also requires decryption, so validate the key
    # ring before recreating either legacy table.
    vault = credential_vault_from_environment()
    bind = op.get_bind()
    _execute_all(bind, DOWNGRADE_STATEMENTS)
    reconstruct_legacy_gmail_sessions(bind, vault)
