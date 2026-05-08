"""Persist OAuth refresh tokens keyed by opaque session ids (local dev file store)."""

from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

_lock = Lock()
_PATH = Path(__file__).resolve().parent / "data" / "sessions.json"


def _read_all() -> dict[str, dict]:
    if not _PATH.is_file():
        return {}
    try:
        raw = _PATH.read_text(encoding="utf-8")
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _write_all(data: dict[str, dict]) -> None:
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = _PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(_PATH)


def get(session_id: str) -> dict | None:
    if not session_id:
        return None
    with _lock:
        return _read_all().get(session_id)


def upsert(session_id: str, record: dict) -> None:
    with _lock:
        data = _read_all()
        data[session_id] = record
        _write_all(data)


def delete(session_id: str) -> None:
    if not session_id:
        return
    with _lock:
        data = _read_all()
        data.pop(session_id, None)
        _write_all(data)
