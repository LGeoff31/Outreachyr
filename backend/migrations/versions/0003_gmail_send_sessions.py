"""gmail send sessions for serverless backend

Revision ID: 0003_gmail_send_sessions
Revises: 0002_user_resumes_storage
Create Date: 2026-05-21 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0003_gmail_send_sessions"
down_revision: str | None = "0002_user_resumes_storage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    """
    create table if not exists public.gmail_send_sessions (
      session_id text primary key,
      owner_id uuid not null references auth.users(id) on delete cascade,
      refresh_token text not null,
      email text not null,
      created_at timestamptz not null default now()
    )
    """,
    "create index if not exists gmail_send_sessions_owner_id_idx on public.gmail_send_sessions(owner_id)",
]

DOWNGRADE_STATEMENTS = [
    "drop table if exists public.gmail_send_sessions",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
