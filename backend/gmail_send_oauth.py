"""Send outreach mail via Gmail API using OAuth2 credentials (gmail.send scope)."""

from __future__ import annotations

import base64
import os
import random
import time
from email.message import EmailMessage

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def ensure_fresh_access_token(creds: Credentials) -> Credentials:
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def _delay_range(
    env_name: str, default_min: float, default_max: float
) -> tuple[float, float]:
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        return default_min, default_max
    parts = [p.strip() for p in raw.split(",", 1)]
    if len(parts) == 2:
        return float(parts[0]), float(parts[1])
    value = float(parts[0])
    return value, value


def _sleep_random(min_sec: float, max_sec: float) -> None:
    lo, hi = min(min_sec, max_sec), max(min_sec, max_sec)
    if hi <= 0:
        return
    time.sleep(random.uniform(lo, hi))


def send_messages_oauth(creds: Credentials, messages: list[EmailMessage]) -> None:
    if not messages:
        return

    creds = ensure_fresh_access_token(creds)
    service = build(
        "gmail", "v1", credentials=creds, cache_discovery=False
    )

    initial_min, initial_max = _delay_range("GMAIL_SEND_INITIAL_DELAY_SEC", 5.0, 12.0)
    spacing_min, spacing_max = _delay_range("GMAIL_SEND_SPACING_SEC", 22.0, 48.0)
    chunk_pause_min, chunk_pause_max = _delay_range(
        "GMAIL_SEND_CHUNK_PAUSE_SEC", 50.0, 100.0
    )

    _sleep_random(initial_min, initial_max)

    chunk_target = random.randint(2, 4)
    sent_in_chunk = 0

    for index, msg in enumerate(messages):
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        sent_in_chunk += 1

        if index >= len(messages) - 1:
            break

        _sleep_random(spacing_min, spacing_max)

        if sent_in_chunk >= chunk_target:
            _sleep_random(chunk_pause_min, chunk_pause_max)
            sent_in_chunk = 0
            chunk_target = random.randint(2, 4)
