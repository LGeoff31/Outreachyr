"""campaign send jobs for serverless background delivery

Revision ID: 0008_campaign_send_jobs
Revises: 0007_resume_profile_child_tables
Create Date: 2026-07-04 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0008_campaign_send_jobs"
down_revision: str | None = "0007_resume_profile_child_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    """
    create table if not exists public.campaign_send_jobs (
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
    create index if not exists campaign_send_jobs_status_next_send_after_idx
      on public.campaign_send_jobs (status, next_send_after)
    """,
]

DOWNGRADE_STATEMENTS = [
    "drop table if exists public.campaign_send_jobs",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
