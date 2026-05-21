"""Persist Gmail OAuth refresh tokens keyed by opaque session ids."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

from sqlalchemy import text

_lock = Lock()
_PATH = Path(__file__).resolve().parent / "data" / "sessions.json"
_engine = None


def _db_engine():
    global _engine
    if _engine is not None:
        return _engine
    try:
        from database import make_engine

        _engine = make_engine()
        return _engine
    except Exception:
        return None


def _use_database() -> bool:
    return _db_engine() is not None


def _read_all_file() -> dict[str, dict]:
    if not _PATH.is_file():
        return {}
    try:
        raw = _PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_all_file(data: dict[str, dict]) -> None:
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(_PATH)


def _row_from_db(session_id: str) -> dict | None:
    engine = _db_engine()
    if engine is None:
        return None
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                    select refresh_token, email, owner_id::text as supabase_user_id
                    from public.gmail_send_sessions
                    where session_id = :session_id
                    """
                ),
                {"session_id": session_id},
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    return dict(row)


def _row_from_db_by_owner(owner_id: str) -> dict | None:
    engine = _db_engine()
    if engine is None:
        return None
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                    select refresh_token, email, owner_id::text as supabase_user_id
                    from public.gmail_send_sessions
                    where owner_id = :owner_id
                    order by created_at desc
                    limit 1
                    """
                ),
                {"owner_id": owner_id},
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    return dict(row)


def _upsert_db(session_id: str, record: dict) -> None:
    engine = _db_engine()
    if engine is None:
        raise RuntimeError("DATABASE_URL is not configured")
    owner_id = record.get("supabase_user_id")
    if not owner_id:
        raise ValueError("supabase_user_id is required for database sessions")
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into public.gmail_send_sessions
                  (session_id, owner_id, refresh_token, email)
                values
                  (:session_id, :owner_id, :refresh_token, :email)
                on conflict (session_id) do update set
                  owner_id = excluded.owner_id,
                  refresh_token = excluded.refresh_token,
                  email = excluded.email
                """
            ),
            {
                "session_id": session_id,
                "owner_id": owner_id,
                "refresh_token": record["refresh_token"],
                "email": record["email"],
            },
        )


def _delete_db(session_id: str) -> None:
    engine = _db_engine()
    if engine is None:
        return
    with engine.begin() as conn:
        conn.execute(
            text("delete from public.gmail_send_sessions where session_id = :session_id"),
            {"session_id": session_id},
        )


def get(session_id: str) -> dict | None:
    if not session_id:
        return None
    with _lock:
        if _use_database():
            row = _row_from_db(session_id)
            if row is not None:
                return row
        return _read_all_file().get(session_id)


def get_by_owner_id(owner_id: str) -> dict | None:
    if not owner_id:
        return None
    with _lock:
        if _use_database():
            row = _row_from_db_by_owner(owner_id)
            if row is not None:
                return row
        for record in _read_all_file().values():
            if record.get("supabase_user_id") == owner_id:
                return record
        return None


def upsert(session_id: str, record: dict) -> None:
    with _lock:
        if _use_database():
            _upsert_db(session_id, record)
            return
        data = _read_all_file()
        data[session_id] = record
        _write_all_file(data)


def delete(session_id: str) -> None:
    if not session_id:
        return
    with _lock:
        if _use_database():
            _delete_db(session_id)
        data = _read_all_file()
        data.pop(session_id, None)
        if not _use_database():
            _write_all_file(data)
