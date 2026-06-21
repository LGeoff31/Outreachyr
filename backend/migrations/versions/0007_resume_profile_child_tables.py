"""split resume profile sections into child tables

Revision ID: 0007_resume_profile_child_tables
Revises: 0006_resume_profile_confirmation
Create Date: 2026-06-21 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007_resume_profile_child_tables"
down_revision: str | None = "0006_resume_profile_confirmation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


CREATE_TABLE_STATEMENTS = [
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

INDEX_STATEMENTS = [
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

MIGRATE_TO_CHILD_TABLES = [
    """
    insert into public.resume_profile_skills (resume_id, position, name)
    select p.resume_id, (item.ordinality - 1)::integer, item.value
    from public.resume_profiles p
    cross join jsonb_array_elements_text(coalesce(p.skills, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_skills s where s.resume_id = p.resume_id
    )
    """,
    """
    insert into public.resume_profile_education (
      resume_id, position, school, normalized_school, degree, major,
      start_year, end_year, is_current, confidence
    )
    select
      p.resume_id,
      (item.ordinality - 1)::integer,
      item.value ->> 'school',
      item.value ->> 'normalized_school',
      item.value ->> 'degree',
      item.value ->> 'major',
      case when (item.value ->> 'start_year') ~ '^\\d+$'
        then (item.value ->> 'start_year')::integer end,
      case when (item.value ->> 'end_year') ~ '^\\d+$'
        then (item.value ->> 'end_year')::integer end,
      case
        when lower(item.value ->> 'is_current') in ('true', '1', 'yes') then true
        when lower(item.value ->> 'is_current') in ('false', '0', 'no') then false
      end,
      case when (item.value ->> 'confidence') ~ '^\\d+(\\.\\d+)?$'
        then (item.value ->> 'confidence')::double precision end
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.education_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_education e where e.resume_id = p.resume_id
    )
    """,
    """
    insert into public.resume_profile_experience (
      resume_id, position, title, company, location, start_date, end_date,
      is_current, description, confidence
    )
    select
      p.resume_id,
      (item.ordinality - 1)::integer,
      item.value ->> 'title',
      item.value ->> 'company',
      item.value ->> 'location',
      item.value ->> 'start_date',
      item.value ->> 'end_date',
      case
        when lower(item.value ->> 'is_current') in ('true', '1', 'yes') then true
        when lower(item.value ->> 'is_current') in ('false', '0', 'no') then false
      end,
      item.value ->> 'description',
      case when (item.value ->> 'confidence') ~ '^\\d+(\\.\\d+)?$'
        then (item.value ->> 'confidence')::double precision end
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.experience_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_experience e where e.resume_id = p.resume_id
    )
    """,
    """
    insert into public.resume_profile_experience_highlights (
      experience_id, position, text
    )
    select e.id, (highlight.ordinality - 1)::integer, highlight.value
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.experience_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public.resume_profile_experience e
      on e.resume_id = p.resume_id
      and e.position = (item.ordinality - 1)::integer
    cross join jsonb_array_elements_text(coalesce(item.value -> 'highlights', '[]'::jsonb))
      with ordinality as highlight(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_experience_highlights h
      where h.experience_id = e.id
    )
    """,
    """
    insert into public.resume_profile_experience_skills (
      experience_id, position, name
    )
    select e.id, (skill.ordinality - 1)::integer, skill.value
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.experience_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public.resume_profile_experience e
      on e.resume_id = p.resume_id
      and e.position = (item.ordinality - 1)::integer
    cross join jsonb_array_elements_text(coalesce(item.value -> 'skills', '[]'::jsonb))
      with ordinality as skill(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_experience_skills s
      where s.experience_id = e.id
    )
    """,
    """
    insert into public.resume_profile_projects (
      resume_id, position, name, description, start_date, end_date, confidence
    )
    select
      p.resume_id,
      (item.ordinality - 1)::integer,
      item.value ->> 'name',
      item.value ->> 'description',
      item.value ->> 'start_date',
      item.value ->> 'end_date',
      case when (item.value ->> 'confidence') ~ '^\\d+(\\.\\d+)?$'
        then (item.value ->> 'confidence')::double precision end
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.projects_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_projects pr where pr.resume_id = p.resume_id
    )
    """,
    """
    insert into public.resume_profile_project_skills (project_id, position, name)
    select pr.id, (skill.ordinality - 1)::integer, skill.value
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.projects_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public.resume_profile_projects pr
      on pr.resume_id = p.resume_id
      and pr.position = (item.ordinality - 1)::integer
    cross join jsonb_array_elements_text(coalesce(item.value -> 'skills', '[]'::jsonb))
      with ordinality as skill(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_project_skills s where s.project_id = pr.id
    )
    """,
    """
    insert into public.resume_profile_project_links (project_id, position, url)
    select pr.id, (link.ordinality - 1)::integer, link.value
    from public.resume_profiles p
    cross join jsonb_array_elements(coalesce(p.projects_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public.resume_profile_projects pr
      on pr.resume_id = p.resume_id
      and pr.position = (item.ordinality - 1)::integer
    cross join jsonb_array_elements_text(coalesce(item.value -> 'links', '[]'::jsonb))
      with ordinality as link(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_project_links l where l.project_id = pr.id
    )
    """,
    """
    insert into public.resume_profile_links (resume_id, position, url)
    select p.resume_id, (item.ordinality - 1)::integer, item.value
    from public.resume_profiles p
    cross join jsonb_array_elements_text(coalesce(p.links_json, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    where not exists (
      select 1 from public.resume_profile_links l where l.resume_id = p.resume_id
    )
    """,
]

DROP_JSON_COLUMNS = """
alter table public.resume_profiles
  drop column if exists skills,
  drop column if exists education_json,
  drop column if exists experience_json,
  drop column if exists projects_json,
  drop column if exists links_json
"""

ADD_JSON_COLUMNS = """
alter table public.resume_profiles
  add column if not exists skills jsonb not null default '[]'::jsonb,
  add column if not exists education_json jsonb not null default '[]'::jsonb,
  add column if not exists experience_json jsonb not null default '[]'::jsonb,
  add column if not exists projects_json jsonb not null default '[]'::jsonb,
  add column if not exists links_json jsonb not null default '[]'::jsonb
"""

RESTORE_JSON_COLUMNS = [
    """
    update public.resume_profiles p
    set skills = coalesce((
      select jsonb_agg(s.name order by s.position)
      from public.resume_profile_skills s
      where s.resume_id = p.resume_id
    ), '[]'::jsonb)
    """,
    """
    update public.resume_profiles p
    set education_json = coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'school', e.school,
          'normalized_school', e.normalized_school,
          'degree', e.degree,
          'major', e.major,
          'start_year', e.start_year,
          'end_year', e.end_year,
          'is_current', e.is_current,
          'confidence', e.confidence
        ))
        order by e.position
      )
      from public.resume_profile_education e
      where e.resume_id = p.resume_id
    ), '[]'::jsonb)
    """,
    """
    update public.resume_profiles p
    set experience_json = coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'title', e.title,
          'company', e.company,
          'location', e.location,
          'start_date', e.start_date,
          'end_date', e.end_date,
          'is_current', e.is_current,
          'description', e.description,
          'highlights', coalesce((
            select jsonb_agg(h.text order by h.position)
            from public.resume_profile_experience_highlights h
            where h.experience_id = e.id
          ), '[]'::jsonb),
          'skills', coalesce((
            select jsonb_agg(s.name order by s.position)
            from public.resume_profile_experience_skills s
            where s.experience_id = e.id
          ), '[]'::jsonb),
          'confidence', e.confidence
        ))
        order by e.position
      )
      from public.resume_profile_experience e
      where e.resume_id = p.resume_id
    ), '[]'::jsonb)
    """,
    """
    update public.resume_profiles p
    set projects_json = coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'name', pr.name,
          'description', pr.description,
          'start_date', pr.start_date,
          'end_date', pr.end_date,
          'skills', coalesce((
            select jsonb_agg(s.name order by s.position)
            from public.resume_profile_project_skills s
            where s.project_id = pr.id
          ), '[]'::jsonb),
          'links', coalesce((
            select jsonb_agg(l.url order by l.position)
            from public.resume_profile_project_links l
            where l.project_id = pr.id
          ), '[]'::jsonb),
          'confidence', pr.confidence
        ))
        order by pr.position
      )
      from public.resume_profile_projects pr
      where pr.resume_id = p.resume_id
    ), '[]'::jsonb)
    """,
    """
    update public.resume_profiles p
    set links_json = coalesce((
      select jsonb_agg(l.url order by l.position)
      from public.resume_profile_links l
      where l.resume_id = p.resume_id
    ), '[]'::jsonb)
    """,
]

DIRECT_TABLES = (
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
ALL_TABLES = DIRECT_TABLES + EXPERIENCE_CHILD_TABLES + PROJECT_CHILD_TABLES


def _enable_rls() -> None:
    for table in DIRECT_TABLES:
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

    for table in EXPERIENCE_CHILD_TABLES:
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

    for table in PROJECT_CHILD_TABLES:
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


def upgrade() -> None:
    for statement in CREATE_TABLE_STATEMENTS:
        op.execute(statement)
    for statement in INDEX_STATEMENTS:
        op.execute(statement)
    _enable_rls()
    for statement in MIGRATE_TO_CHILD_TABLES:
        op.execute(statement)
    op.execute(DROP_JSON_COLUMNS)


def downgrade() -> None:
    op.execute(ADD_JSON_COLUMNS)
    for statement in RESTORE_JSON_COLUMNS:
        op.execute(statement)
    for table in reversed(ALL_TABLES):
        op.execute(f'drop policy if exists "Users manage own {table}" on public.{table}')
        op.execute(f"drop table if exists public.{table}")
