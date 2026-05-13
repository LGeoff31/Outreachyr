from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from config import load_dotenv, normalize_postgres_url_for_psycopg, required_env


def database_url() -> str:
    load_dotenv()
    return normalize_postgres_url_for_psycopg(required_env("DATABASE_URL"))


def make_engine(url: str | None = None) -> Engine:
    return create_engine(url or database_url(), pool_pre_ping=True)


def make_session_factory(url: str | None = None) -> sessionmaker[Session]:
    return sessionmaker(bind=make_engine(url), autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    session_factory = make_session_factory()
    with session_factory() as session:
        yield session
