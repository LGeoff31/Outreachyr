"""initial mvp schema

Revision ID: 0001_initial_mvp_schema
Revises:
Create Date: 2026-05-08 17:45:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001_initial_mvp_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPGRADE_STATEMENTS = [
    "create extension if not exists pgcrypto",
    """
    create table if not exists public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      email text,
      full_name text,
      created_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.templates (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users(id) on delete cascade,
      name text not null,
      subject text not null,
      body_text text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
    """,
    """
    create table if not exists public.campaigns (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users(id) on delete cascade,
      template_id uuid references public.templates(id) on delete set null,
      company text not null,
      subject text not null,
      body_text text not null,
      status text not null default 'draft',
      resume_storage_path text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      sent_at timestamptz
    )
    """,
    """
    create table if not exists public.campaign_recipients (
      id uuid primary key default gen_random_uuid(),
      campaign_id uuid not null references public.campaigns(id) on delete cascade,
      email text not null,
      greeting_name text,
      status text not null default 'discovered',
      error text,
      created_at timestamptz not null default now(),
      sent_at timestamptz,
      constraint campaign_recipients_campaign_id_email_key unique (campaign_id, email)
    )
    """,
    "create index if not exists templates_owner_id_idx on public.templates(owner_id)",
    "create index if not exists campaigns_owner_id_idx on public.campaigns(owner_id)",
    "create index if not exists campaigns_template_id_idx on public.campaigns(template_id)",
    "create index if not exists campaign_recipients_campaign_id_idx on public.campaign_recipients(campaign_id)",
    "alter table public.profiles enable row level security",
    "alter table public.templates enable row level security",
    "alter table public.campaigns enable row level security",
    "alter table public.campaign_recipients enable row level security",
    "grant usage on schema public to authenticated",
    "grant select, insert, update, delete on public.profiles to authenticated",
    "grant select, insert, update, delete on public.templates to authenticated",
    "grant select, insert, update, delete on public.campaigns to authenticated",
    "grant select, insert, update, delete on public.campaign_recipients to authenticated",
    'drop policy if exists "Users manage own profile" on public.profiles',
    """
    create policy "Users manage own profile"
    on public.profiles
    for all
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id)
    """,
    'drop policy if exists "Users manage own templates" on public.templates',
    """
    create policy "Users manage own templates"
    on public.templates
    for all
    to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id)
    """,
    'drop policy if exists "Users manage own campaigns" on public.campaigns',
    """
    create policy "Users manage own campaigns"
    on public.campaigns
    for all
    to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id)
    """,
    'drop policy if exists "Users manage own campaign recipients" on public.campaign_recipients',
    """
    create policy "Users manage own campaign recipients"
    on public.campaign_recipients
    for all
    to authenticated
    using (
      campaign_id in (
        select id from public.campaigns where owner_id = (select auth.uid())
      )
    )
    with check (
      campaign_id in (
        select id from public.campaigns where owner_id = (select auth.uid())
      )
    )
    """,
]

DOWNGRADE_STATEMENTS = [
    'drop policy if exists "Users manage own campaign recipients" on public.campaign_recipients',
    'drop policy if exists "Users manage own campaigns" on public.campaigns',
    'drop policy if exists "Users manage own templates" on public.templates',
    'drop policy if exists "Users manage own profile" on public.profiles',
    "drop table if exists public.campaign_recipients",
    "drop table if exists public.campaigns",
    "drop table if exists public.templates",
    "drop table if exists public.profiles",
]


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
