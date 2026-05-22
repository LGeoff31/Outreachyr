"""profile campaign unlock for billing

Revision ID: 0004_profile_campaign_unlock
Revises: 0003_gmail_send_sessions
Create Date: 2026-05-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0004_profile_campaign_unlock"
down_revision: str | None = "0003_gmail_send_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    """
    alter table public.profiles
      add column if not exists campaigns_unlocked boolean not null default false
    """,
    """
    alter table public.profiles
      add column if not exists unlocked_at timestamptz
    """,
    """
    alter table public.profiles
      add column if not exists stripe_customer_id text
    """,
]

DOWNGRADE_STATEMENTS = [
    "alter table public.profiles drop column if exists stripe_customer_id",
    "alter table public.profiles drop column if exists unlocked_at",
    "alter table public.profiles drop column if exists campaigns_unlocked",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
