from __future__ import annotations

import json
import re
from typing import Any

SelectedPeople = list[tuple[str, str]]

MAX_SELECTED_RECIPIENTS = 100
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_selected_recipients(value: Any) -> tuple[SelectedPeople | None, str | None]:
    if value is None:
        return None, None
    if not isinstance(value, list):
        return None, "Selected recipients must be a list."
    if len(value) > MAX_SELECTED_RECIPIENTS:
        return None, f"Select no more than {MAX_SELECTED_RECIPIENTS} recipients."

    people: SelectedPeople = []
    seen_emails: set[str] = set()
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            return None, f"Recipient {index} must be an object."
        email = str(item.get("email") or "").strip().lower()
        greeting_name = str(item.get("greeting_name") or "").strip()
        if not email:
            return None, f"Recipient {index} is missing an email address."
        if not EMAIL_RE.fullmatch(email):
            return None, f"Recipient {index} has an invalid email address."
        if email in seen_emails:
            continue
        seen_emails.add(email)
        people.append((email, greeting_name))

    return people, None


def parse_selected_recipients_json(raw: str | None) -> tuple[SelectedPeople | None, str | None]:
    if not raw or not raw.strip():
        return None, None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None, "Selected recipients payload is invalid JSON."
    return normalize_selected_recipients(payload)
