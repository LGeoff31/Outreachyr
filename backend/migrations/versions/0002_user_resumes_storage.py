"""user resumes table and storage bucket

Revision ID: 0002_user_resumes_storage
Revises: 0001_initial_mvp_schema
Create Date: 2026-05-13 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002_user_resumes_storage"
down_revision: str | None = "0001_initial_mvp_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    """
    create table if not exists public.user_resumes (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users(id) on delete cascade,
      resume_storage_path text not null,
      display_name text not null,
      file_type text not null default 'PDF',
      byte_size bigint,
      focus text not null default 'Unassigned',
      used_in_campaigns integer not null default 0,
      is_default boolean not null default false,
      status text not null default 'Ready',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create or replace function public.touch_user_resumes_updated_at()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at := now();
      return new;
    end;
    $$
    """,
    "drop trigger if exists user_resumes_touch_updated on public.user_resumes",
    """
    create trigger user_resumes_touch_updated
    before update on public.user_resumes
    for each row execute function public.touch_user_resumes_updated_at()
    """,
    "create index if not exists user_resumes_owner_id_idx on public.user_resumes(owner_id)",
    "alter table public.user_resumes enable row level security",
    "grant select, insert, update, delete on public.user_resumes to authenticated",
    'drop policy if exists "Users manage own resumes library" on public.user_resumes',
    """
    create policy "Users manage own resumes library"
    on public.user_resumes
    for all
    to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id)
    """,
    """
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'resumes',
      'resumes',
      false,
      10485760,
      array['application/pdf']::text[]
    )
    on conflict (id) do update set
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types
    """,
    'drop policy if exists "Resume files select own" on storage.objects',
    'drop policy if exists "Resume files insert own" on storage.objects',
    'drop policy if exists "Resume files update own" on storage.objects',
    'drop policy if exists "Resume files delete own" on storage.objects',
    """
    create policy "Resume files select own"
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'resumes'
      and split_part(name, '/', 1) = (select auth.uid()::text)
    )
    """,
    """
    create policy "Resume files insert own"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'resumes'
      and split_part(name, '/', 1) = (select auth.uid()::text)
    )
    """,
    """
    create policy "Resume files update own"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'resumes'
      and split_part(name, '/', 1) = (select auth.uid()::text)
    )
    with check (
      bucket_id = 'resumes'
      and split_part(name, '/', 1) = (select auth.uid()::text)
    )
    """,
    """
    create policy "Resume files delete own"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'resumes'
      and split_part(name, '/', 1) = (select auth.uid()::text)
    )
    """,
]

DOWNGRADE_STATEMENTS = [
    'drop policy if exists "Resume files delete own" on storage.objects',
    'drop policy if exists "Resume files update own" on storage.objects',
    'drop policy if exists "Resume files insert own" on storage.objects',
    'drop policy if exists "Resume files select own" on storage.objects',
    "delete from storage.buckets where id = 'resumes'",
    'drop policy if exists "Users manage own resumes library" on public.user_resumes',
    "drop trigger if exists user_resumes_touch_updated on public.user_resumes",
    "drop function if exists public.touch_user_resumes_updated_at()",
    "drop table if exists public.user_resumes",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
