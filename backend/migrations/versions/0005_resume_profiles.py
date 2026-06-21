"""resume profiles for parsed resume facts

Revision ID: 0005_resume_profiles
Revises: 0004_profile_campaign_unlock
Create Date: 2026-06-21 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0005_resume_profiles"
down_revision: str | None = "0004_profile_campaign_unlock"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    """
    create table if not exists public.resume_profiles (
      resume_id uuid primary key references public.user_resumes(id) on delete cascade,
      raw_text text,
      raw_text_hash text,
      parse_status text not null default 'pending',
      parser_version text not null,
      parse_error text,
      primary_school_name text,
      primary_school_normalized text,
      primary_major text,
      grad_year integer,
      skills jsonb not null default '[]'::jsonb,
      education_json jsonb not null default '[]'::jsonb,
      experience_json jsonb not null default '[]'::jsonb,
      projects_json jsonb not null default '[]'::jsonb,
      links_json jsonb not null default '[]'::jsonb,
      parsed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create or replace function public.touch_resume_profiles_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at := now();
      return new;
    end;
    $$
    """,
    "drop trigger if exists resume_profiles_touch_updated on public.resume_profiles",
    """
    create trigger resume_profiles_touch_updated
    before update on public.resume_profiles
    for each row execute function public.touch_resume_profiles_updated_at()
    """,
    "create index if not exists resume_profiles_school_idx on public.resume_profiles(primary_school_normalized)",
    "create index if not exists resume_profiles_grad_year_idx on public.resume_profiles(grad_year)",
    "alter table public.resume_profiles enable row level security",
    "grant select, insert, update, delete on public.resume_profiles to authenticated",
    'drop policy if exists "Users manage own resume profiles" on public.resume_profiles',
    """
    create policy "Users manage own resume profiles"
    on public.resume_profiles
    for all
    to authenticated
    using (
      resume_id in (
        select id from public.user_resumes where owner_id = (select auth.uid())
      )
    )
    with check (
      resume_id in (
        select id from public.user_resumes where owner_id = (select auth.uid())
      )
    )
    """,
]

DOWNGRADE_STATEMENTS = [
    'drop policy if exists "Users manage own resume profiles" on public.resume_profiles',
    "drop trigger if exists resume_profiles_touch_updated on public.resume_profiles",
    "drop function if exists public.touch_resume_profiles_updated_at()",
    "drop table if exists public.resume_profiles",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
