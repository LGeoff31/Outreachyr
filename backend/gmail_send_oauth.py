"""Send outreach mail via Gmail API using OAuth2 credentials (gmail.send scope)."""

from __future__ import annotations

import base64
from email.message import EmailMessage

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def ensure_fresh_access_token(creds: Credentials) -> Credentials:
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def send_single_message(creds: Credentials, msg: EmailMessage) -> None:
    creds = ensure_fresh_access_token(creds)
    service = build(
        "gmail", "v1", credentials=creds, cache_discovery=False
    )
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


def send_messages_oauth(
    creds: Credentials,
    messages: list[EmailMessage],
    *,
    start_index: int = 0,
) -> int:
    if not messages or start_index >= len(messages):
        return 0

    sent_count = 0
    for index, msg in enumerate(messages):
        if index < start_index:
            continue
        send_single_message(creds, msg)
        sent_count += 1

    return sent_count
