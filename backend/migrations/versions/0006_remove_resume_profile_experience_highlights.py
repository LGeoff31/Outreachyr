"""remove resume profile experience highlights

Revision ID: 0006_remove_resume_profile_experience_highlights
Revises: 0005_resume_profiles
Create Date: 2026-06-21 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0006_remove_resume_profile_experience_highlights"
down_revision: str | None = "0005_resume_profiles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        'drop policy if exists "Users manage own resume_profile_experience_highlights" '
        "on public.resume_profile_experience_highlights"
    )
    op.execute(
        "drop index if exists public.resume_profile_experience_highlights_parent_idx"
    )
    op.execute("drop table if exists public.resume_profile_experience_highlights")


def downgrade() -> None:
    # 0005 no longer creates this table for fresh databases.
    return None
