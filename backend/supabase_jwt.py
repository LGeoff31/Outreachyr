"""Verify Supabase access tokens via the Auth REST API."""

from __future__ import annotations

import hashlib
import json
import os
import time
from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from config import supabase_publishable_key, supabase_url

DEFAULT_AUTH_CACHE_TTL_SECONDS = 60.0
DEFAULT_AUTH_CACHE_MAX_ENTRIES = 1024


@dataclass(frozen=True)
class _CachedUser:
    expires_at: float
    user: dict[str, str]


_cache_lock = RLock()
_user_cache: OrderedDict[str, _CachedUser] = OrderedDict()


def clear_supabase_access_token_cache() -> None:
    """Clear cached Supabase Auth lookups.

    This is primarily useful for tests and emergency operational resets. Failed
    verifications are never cached.
    """
    with _cache_lock:
        _user_cache.clear()


def _positive_float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return max(0.0, value)


def _positive_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(1, value)


def _auth_cache_ttl_seconds() -> float:
    return _positive_float_env(
        "SUPABASE_AUTH_CACHE_TTL_SECONDS",
        DEFAULT_AUTH_CACHE_TTL_SECONDS,
    )


def _auth_cache_max_entries() -> int:
    return _positive_int_env(
        "SUPABASE_AUTH_CACHE_MAX_ENTRIES",
        DEFAULT_AUTH_CACHE_MAX_ENTRIES,
    )


def _cache_key(access_token: str) -> str:
    return hashlib.sha256(access_token.encode()).hexdigest()


def _cached_user(access_token: str, now: float) -> dict[str, str] | None:
    key = _cache_key(access_token)
    with _cache_lock:
        cached = _user_cache.get(key)
        if cached is None:
            return None
        if cached.expires_at <= now:
            _user_cache.pop(key, None)
            return None
        _user_cache.move_to_end(key)
        return dict(cached.user)


def _remember_user(
    access_token: str,
    user: dict[str, str],
    *,
    now: float,
    ttl_seconds: float,
) -> None:
    if ttl_seconds <= 0:
        return
    key = _cache_key(access_token)
    with _cache_lock:
        _user_cache[key] = _CachedUser(
            expires_at=now + ttl_seconds,
            user=dict(user),
        )
        _user_cache.move_to_end(key)
        max_entries = _auth_cache_max_entries()
        while len(_user_cache) > max_entries:
            _user_cache.popitem(last=False)


def _fetch_supabase_access_token_user(access_token: str) -> dict[str, str]:
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


def verify_supabase_access_token(access_token: str) -> dict[str, str]:
    token = access_token.strip()
    if not token:
        raise RuntimeError("Missing Supabase access token.")

    ttl_seconds = _auth_cache_ttl_seconds()
    now = time.monotonic()
    if ttl_seconds > 0:
        cached = _cached_user(token, now)
        if cached is not None:
            return cached

    user = _fetch_supabase_access_token_user(token)
    _remember_user(token, user, now=now, ttl_seconds=ttl_seconds)
    return dict(user)
