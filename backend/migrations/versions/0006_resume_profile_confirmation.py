"""resume profile user confirmation timestamp

Revision ID: 0006_resume_profile_confirmation
Revises: 0005_resume_profiles
Create Date: 2026-06-21 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_resume_profile_confirmation"
down_revision: str | None = "0005_resume_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    """
    alter table public.resume_profiles
      add column if not exists user_confirmed_at timestamptz
    """,
]

DOWNGRADE_STATEMENTS = [
    "alter table public.resume_profiles drop column if exists user_confirmed_at",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
