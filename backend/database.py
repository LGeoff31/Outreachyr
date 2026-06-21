from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from config import load_dotenv, normalize_postgres_url_for_psycopg, required_env


def database_url() -> str:
    load_dotenv()
    return normalize_postgres_url_for_psycopg(required_env("DATABASE_URL"))


def _uses_supabase_pooler(url: str) -> bool:
    return "pooler.supabase.com" in url


def make_engine(url: str | None = None) -> Engine:
    resolved_url = url or database_url()
    # Supabase pooler (especially on Vercel serverless) needs short-lived
    # connections and no prepared statements.
    use_null_pool = bool(os.environ.get("VERCEL")) or _uses_supabase_pooler(
        resolved_url
    )
    return create_engine(
        resolved_url,
        pool_pre_ping=True,
        poolclass=NullPool if use_null_pool else None,
        connect_args={"prepare_threshold": None}
        if _uses_supabase_pooler(resolved_url)
        else {},
    )


def make_session_factory(url: str | None = None) -> sessionmaker[Session]:
    return sessionmaker(bind=make_engine(url), autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    session_factory = make_session_factory()
    with session_factory() as session:
        yield session
