"""split resume profile sections into child tables (legacy no-op)

Revision ID: 0007_resume_profile_child_tables
Revises: 0006_remove_resume_profile_experience_highlights
Create Date: 2026-06-21 00:00:00.000000

This migration was consolidated into 0005 for fresh databases. The revision
is kept as a no-op so databases already stamped at 0007 can continue upgrading.
"""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "0007_resume_profile_child_tables"
down_revision: str | None = "0006_remove_resume_profile_experience_highlights"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
