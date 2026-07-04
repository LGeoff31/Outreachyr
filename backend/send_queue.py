"""Persist and process multi-recipient Gmail sends on serverless hosts."""

from __future__ import annotations

import base64
import json
import logging
import random
import time
import uuid
from datetime import UTC, datetime, timedelta
from email import message_from_bytes
from email.message import EmailMessage

from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from sqlalchemy import text

import google_oauth as google_auth
import session_store
from database import make_engine
from gmail_send_oauth import delay_ranges, send_single_message

logger = logging.getLogger(__name__)


def _serialize_messages(messages: list[EmailMessage]) -> list[dict[str, str]]:
    return [
        {"raw": base64.b64encode(msg.as_bytes()).decode("ascii")}
        for msg in messages
    ]


def _deserialize_messages(payload: list[dict[str, str]]) -> list[EmailMessage]:
    out: list[EmailMessage] = []
    for item in payload:
        raw = item.get("raw", "")
        out.append(message_from_bytes(base64.b64decode(raw)))
    return out


def _random_delay(min_sec: float, max_sec: float) -> float:
    lo, hi = min(min_sec, max_sec), max(min_sec, max_sec)
    if hi <= 0:
        return 0.0
    return random.uniform(lo, hi)


def _compute_next_send_after(
    *,
    sent_in_chunk: int,
    chunk_target: int | None,
) -> datetime:
    spacing_min, spacing_max = delay_ranges()["spacing"]
    delay = _random_delay(spacing_min, spacing_max)
    if chunk_target and sent_in_chunk >= chunk_target:
        chunk_min, chunk_max = delay_ranges()["chunk_pause"]
        delay += _random_delay(chunk_min, chunk_max)
    return datetime.now(UTC) + timedelta(seconds=delay)


def create_send_job(
    *,
    owner_id: uuid.UUID,
    session_id: str,
    sender_email: str,
    messages: list[EmailMessage],
) -> uuid.UUID:
    engine = make_engine()
    job_id = uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into public.campaign_send_jobs (
                  id, owner_id, session_id, sender_email, messages_json,
                  next_index, chunk_sent_count, chunk_target, status
                ) values (
                  :id, :owner_id, :session_id, :sender_email, :messages_json,
                  0, 0, :chunk_target, 'pending'
                )
                """
            ),
            {
                "id": job_id,
                "owner_id": owner_id,
                "session_id": session_id,
                "sender_email": sender_email,
                "messages_json": json.dumps(_serialize_messages(messages)),
                "chunk_target": random.randint(2, 4),
            },
        )
    return job_id


def _read_job(conn, job_id: uuid.UUID, *, for_update: bool = False) -> dict | None:
    lock = " for update" if for_update else ""
    row = (
        conn.execute(
            text(
                f"""
                select
                  id, owner_id, session_id, sender_email, messages_json,
                  next_index, chunk_sent_count, chunk_target, status,
                  next_send_after, last_error
                from public.campaign_send_jobs
                where id = :job_id
                {lock}
                """
            ),
            {"job_id": job_id},
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def _load_job(conn, job_id: uuid.UUID) -> dict | None:
    return _read_job(conn, job_id, for_update=True)


def _pick_ready_job(conn) -> dict | None:
    row = (
        conn.execute(
            text(
                """
                select
                  id, owner_id, session_id, sender_email, messages_json,
                  next_index, chunk_sent_count, chunk_target, status,
                  next_send_after, last_error
                from public.campaign_send_jobs
                where status = 'pending'
                  and (
                    next_send_after is null
                    or next_send_after <= now()
                  )
                order by coalesce(next_send_after, created_at) asc
                limit 1
                for update skip locked
                """
            )
        )
        .mappings()
        .first()
    )
    return dict(row) if row else None


def _mark_job(
    conn,
    job_id: uuid.UUID,
    *,
    next_index: int,
    chunk_sent_count: int,
    chunk_target: int | None,
    status: str,
    next_send_after: datetime | None,
    last_error: str | None = None,
) -> None:
    conn.execute(
        text(
            """
            update public.campaign_send_jobs
            set
              next_index = :next_index,
              chunk_sent_count = :chunk_sent_count,
              chunk_target = :chunk_target,
              status = :status,
              next_send_after = :next_send_after,
              last_error = :last_error,
              updated_at = now()
            where id = :job_id
            """
        ),
        {
            "job_id": job_id,
            "next_index": next_index,
            "chunk_sent_count": chunk_sent_count,
            "chunk_target": chunk_target,
            "status": status,
            "next_send_after": next_send_after,
            "last_error": last_error,
        },
    )


def _messages_from_job_payload(raw) -> list[EmailMessage]:
    payload = json.loads(raw) if isinstance(raw, str) else raw
    return _deserialize_messages(payload)


def _advance_job(conn, job: dict) -> tuple[str, bool]:
    """Send the next queued message for a job. Returns (status, has_more)."""
    messages = _messages_from_job_payload(job["messages_json"])
    index = int(job["next_index"])
    if index >= len(messages):
        _mark_job(
            conn,
            job["id"],
            next_index=index,
            chunk_sent_count=int(job["chunk_sent_count"]),
            chunk_target=job["chunk_target"],
            status="completed",
            next_send_after=None,
        )
        return "completed", False

    row = session_store.get(job["session_id"])
    if not row:
        row = session_store.get_by_owner_id(str(job["owner_id"]))
    if not row:
        _mark_job(
            conn,
            job["id"],
            next_index=index,
            chunk_sent_count=int(job["chunk_sent_count"]),
            chunk_target=job["chunk_target"],
            status="failed",
            next_send_after=None,
            last_error="Gmail session expired before the campaign finished sending.",
        )
        return "failed", False

    creds = google_auth.credentials_from_refresh(row["refresh_token"])
    send_single_message(creds, messages[index])

    next_index = index + 1
    chunk_sent = int(job["chunk_sent_count"]) + 1
    chunk_target = job["chunk_target"]
    if chunk_target and chunk_sent >= int(chunk_target):
        chunk_sent = 0
        chunk_target = random.randint(2, 4)

    if next_index >= len(messages):
        _mark_job(
            conn,
            job["id"],
            next_index=next_index,
            chunk_sent_count=chunk_sent,
            chunk_target=chunk_target,
            status="completed",
            next_send_after=None,
        )
        return "completed", False

    _mark_job(
        conn,
        job["id"],
        next_index=next_index,
        chunk_sent_count=chunk_sent,
        chunk_target=chunk_target,
        status="pending",
        next_send_after=_compute_next_send_after(
            sent_in_chunk=chunk_sent,
            chunk_target=int(chunk_target) if chunk_target else None,
        ),
    )
    return "pending", True


def process_send_queue(
    *,
    max_seconds: float = 280.0,
    preferred_job_id: uuid.UUID | None = None,
) -> dict:
    """Drain ready send jobs until idle or the wall-clock budget expires."""
    engine = make_engine()
    deadline = time.monotonic() + max_seconds
    processed = 0
    completed = 0
    failed = 0
    resume_job_id = preferred_job_id

    while time.monotonic() < deadline:
        with engine.begin() as conn:
            job = None
            if resume_job_id is not None:
                candidate = _read_job(conn, resume_job_id)
                if candidate and candidate["status"] == "pending":
                    next_send_after = candidate.get("next_send_after")
                    if next_send_after is None:
                        job = _load_job(conn, resume_job_id)
                    else:
                        if next_send_after.tzinfo is None:
                            next_send_after = next_send_after.replace(tzinfo=UTC)
                        if next_send_after <= datetime.now(UTC):
                            job = _load_job(conn, resume_job_id)
            if job is None:
                job = _pick_ready_job(conn)
            if job is None:
                if resume_job_id is not None:
                    with engine.connect() as conn:
                        waiting = _read_job(conn, resume_job_id)
                    if (
                        waiting
                        and waiting["status"] == "pending"
                        and waiting.get("next_send_after") is not None
                    ):
                        next_send_after = waiting["next_send_after"]
                        if next_send_after.tzinfo is None:
                            next_send_after = next_send_after.replace(tzinfo=UTC)
                        wait_seconds = (
                            next_send_after - datetime.now(UTC)
                        ).total_seconds()
                        if wait_seconds > 0:
                            remaining = deadline - time.monotonic()
                            if wait_seconds > remaining:
                                break
                            time.sleep(wait_seconds)
                            continue
                break

            try:
                status, has_more = _advance_job(conn, job)
            except (RefreshError, HttpError, OSError) as exc:
                logger.exception(
                    "Send job %s failed at index %s",
                    job["id"],
                    job["next_index"],
                )
                _mark_job(
                    conn,
                    job["id"],
                    next_index=int(job["next_index"]),
                    chunk_sent_count=int(job["chunk_sent_count"]),
                    chunk_target=job["chunk_target"],
                    status="failed",
                    next_send_after=None,
                    last_error=str(exc),
                )
                failed += 1
                resume_job_id = None
                continue

        processed += 1
        if status == "completed":
            completed += 1
            resume_job_id = None
        elif status == "failed":
            failed += 1
            resume_job_id = None
        elif has_more:
            resume_job_id = job["id"]
        else:
            resume_job_id = None

    return {
        "processed": processed,
        "completed": completed,
        "failed": failed,
    }


def kickoff_send_job(job_id: uuid.UUID) -> dict:
    """Send the first queued message and leave the rest for async processing."""
    engine = make_engine()
    with engine.begin() as conn:
        job = _load_job(conn, job_id)
        if job is None:
            raise RuntimeError(f"Send job {job_id} was not found.")
        status, has_more = _advance_job(conn, job)

    with engine.connect() as conn:
        final = _read_job(conn, job_id)
    final_status = final["status"] if final else status
    pending = final_status == "pending"
    return {"job_id": str(job_id), "status": final_status, "has_more": pending}
