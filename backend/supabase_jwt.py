"""Verify Supabase access tokens via the Auth REST API."""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from config import supabase_publishable_key, supabase_url


def verify_supabase_access_token(access_token: str) -> dict:
    req = UrlRequest(
        f"{supabase_url().rstrip('/')}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": supabase_publishable_key(),
        },
    )
    try:
        with urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
    except HTTPError as e:
        raise RuntimeError(
            f"Supabase Auth rejected the session: HTTP {e.code}"
        ) from e
    except (OSError, URLError) as e:
        raise RuntimeError(f"Could not reach Supabase Auth: {e}") from e

    email = (data.get("email") or "").strip()
    user_id = (data.get("id") or "").strip()
    if not email or not user_id:
        raise RuntimeError("Supabase Auth did not return a usable user.")
    return {"email": email, "id": user_id}
