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


CREATE_TABLE_STATEMENTS = [
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
      parsed_at timestamptz,
      user_confirmed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_skills (
      id uuid primary key default gen_random_uuid(),
      resume_id uuid not null references public.resume_profiles(resume_id) on delete cascade,
      position integer not null,
      name text not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_education (
      id uuid primary key default gen_random_uuid(),
      resume_id uuid not null references public.resume_profiles(resume_id) on delete cascade,
      position integer not null,
      school text,
      normalized_school text,
      degree text,
      major text,
      start_year integer,
      end_year integer,
      is_current boolean,
      confidence double precision,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_experience (
      id uuid primary key default gen_random_uuid(),
      resume_id uuid not null references public.resume_profiles(resume_id) on delete cascade,
      position integer not null,
      title text,
      company text,
      location text,
      start_date text,
      end_date text,
      is_current boolean,
      description text,
      confidence double precision,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_experience_highlights (
      id uuid primary key default gen_random_uuid(),
      experience_id uuid not null references public.resume_profile_experience(id) on delete cascade,
      position integer not null,
      text text not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_experience_skills (
      id uuid primary key default gen_random_uuid(),
      experience_id uuid not null references public.resume_profile_experience(id) on delete cascade,
      position integer not null,
      name text not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_projects (
      id uuid primary key default gen_random_uuid(),
      resume_id uuid not null references public.resume_profiles(resume_id) on delete cascade,
      position integer not null,
      name text,
      description text,
      start_date text,
      end_date text,
      confidence double precision,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_project_skills (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.resume_profile_projects(id) on delete cascade,
      position integer not null,
      name text not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_project_links (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.resume_profile_projects(id) on delete cascade,
      position integer not null,
      url text not null,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.resume_profile_links (
      id uuid primary key default gen_random_uuid(),
      resume_id uuid not null references public.resume_profiles(resume_id) on delete cascade,
      position integer not null,
      url text not null,
      created_at timestamptz not null default now()
    )
    """,
]

TRIGGER_STATEMENTS = [
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
]

INDEX_STATEMENTS = [
    "create index if not exists resume_profiles_school_idx on public.resume_profiles(primary_school_normalized)",
    "create index if not exists resume_profiles_grad_year_idx on public.resume_profiles(grad_year)",
    "create index if not exists resume_profile_skills_resume_idx on public.resume_profile_skills(resume_id, position)",
    "create index if not exists resume_profile_education_resume_idx on public.resume_profile_education(resume_id, position)",
    "create index if not exists resume_profile_education_school_idx on public.resume_profile_education(normalized_school)",
    "create index if not exists resume_profile_experience_resume_idx on public.resume_profile_experience(resume_id, position)",
    "create index if not exists resume_profile_experience_highlights_parent_idx on public.resume_profile_experience_highlights(experience_id, position)",
    "create index if not exists resume_profile_experience_skills_parent_idx on public.resume_profile_experience_skills(experience_id, position)",
    "create index if not exists resume_profile_projects_resume_idx on public.resume_profile_projects(resume_id, position)",
    "create index if not exists resume_profile_project_skills_parent_idx on public.resume_profile_project_skills(project_id, position)",
    "create index if not exists resume_profile_project_links_parent_idx on public.resume_profile_project_links(project_id, position)",
    "create index if not exists resume_profile_links_resume_idx on public.resume_profile_links(resume_id, position)",
]

DIRECT_CHILD_TABLES = (
    "resume_profile_skills",
    "resume_profile_education",
    "resume_profile_experience",
    "resume_profile_projects",
    "resume_profile_links",
)
EXPERIENCE_CHILD_TABLES = (
    "resume_profile_experience_highlights",
    "resume_profile_experience_skills",
)
PROJECT_CHILD_TABLES = (
    "resume_profile_project_skills",
    "resume_profile_project_links",
)
ALL_CHILD_TABLES = DIRECT_CHILD_TABLES + EXPERIENCE_CHILD_TABLES + PROJECT_CHILD_TABLES


def _enable_resume_profile_rls() -> None:
    op.execute("alter table public.resume_profiles enable row level security")
    op.execute("grant select, insert, update, delete on public.resume_profiles to authenticated")
    op.execute('drop policy if exists "Users manage own resume profiles" on public.resume_profiles')
    op.execute(
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
        """
    )


def _enable_direct_child_rls(table: str) -> None:
    op.execute(f"alter table public.{table} enable row level security")
    op.execute(f"grant select, insert, update, delete on public.{table} to authenticated")
    op.execute(f'drop policy if exists "Users manage own {table}" on public.{table}')
    op.execute(
        f"""
        create policy "Users manage own {table}"
        on public.{table}
        for all
        to authenticated
        using (
          resume_id in (
            select id from public.user_resumes
            where owner_id = (select auth.uid())
          )
        )
        with check (
          resume_id in (
            select id from public.user_resumes
            where owner_id = (select auth.uid())
          )
        )
        """
    )


def _enable_experience_child_rls(table: str) -> None:
    op.execute(f"alter table public.{table} enable row level security")
    op.execute(f"grant select, insert, update, delete on public.{table} to authenticated")
    op.execute(f'drop policy if exists "Users manage own {table}" on public.{table}')
    op.execute(
        f"""
        create policy "Users manage own {table}"
        on public.{table}
        for all
        to authenticated
        using (
          experience_id in (
            select e.id
            from public.resume_profile_experience e
            join public.user_resumes r on r.id = e.resume_id
            where r.owner_id = (select auth.uid())
          )
        )
        with check (
          experience_id in (
            select e.id
            from public.resume_profile_experience e
            join public.user_resumes r on r.id = e.resume_id
            where r.owner_id = (select auth.uid())
          )
        )
        """
    )


def _enable_project_child_rls(table: str) -> None:
    op.execute(f"alter table public.{table} enable row level security")
    op.execute(f"grant select, insert, update, delete on public.{table} to authenticated")
    op.execute(f'drop policy if exists "Users manage own {table}" on public.{table}')
    op.execute(
        f"""
        create policy "Users manage own {table}"
        on public.{table}
        for all
        to authenticated
        using (
          project_id in (
            select pr.id
            from public.resume_profile_projects pr
            join public.user_resumes r on r.id = pr.resume_id
            where r.owner_id = (select auth.uid())
          )
        )
        with check (
          project_id in (
            select pr.id
            from public.resume_profile_projects pr
            join public.user_resumes r on r.id = pr.resume_id
            where r.owner_id = (select auth.uid())
          )
        )
        """
    )


def _enable_child_table_rls() -> None:
    for table in DIRECT_CHILD_TABLES:
        _enable_direct_child_rls(table)
    for table in EXPERIENCE_CHILD_TABLES:
        _enable_experience_child_rls(table)
    for table in PROJECT_CHILD_TABLES:
        _enable_project_child_rls(table)


def upgrade() -> None:
    for statement in CREATE_TABLE_STATEMENTS:
        op.execute(statement)
    for statement in TRIGGER_STATEMENTS:
        op.execute(statement)
    for statement in INDEX_STATEMENTS:
        op.execute(statement)
    _enable_resume_profile_rls()
    _enable_child_table_rls()


def downgrade() -> None:
    for table in reversed(ALL_CHILD_TABLES):
        op.execute(f'drop policy if exists "Users manage own {table}" on public.{table}')
        op.execute(f"drop table if exists public.{table}")
    op.execute('drop policy if exists "Users manage own resume profiles" on public.resume_profiles')
    op.execute("drop trigger if exists resume_profiles_touch_updated on public.resume_profiles")
    op.execute("drop function if exists public.touch_resume_profiles_updated_at()")
    op.execute("drop table if exists public.resume_profiles")
