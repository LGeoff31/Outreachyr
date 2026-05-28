"""Google OAuth helpers (authorization code flow)."""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from config import google_redirect_uri

# Must match frontend/lib/auth.ts GOOGLE_OAUTH_SCOPES (Supabase Google provider).
GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
]


def _client_config() -> dict:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    redirect = google_redirect_uri()
    return {
        "web": {
            "client_id": client_id,
            "client_secret": secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect],
        }
    }


def make_flow(state: str | None = None) -> Flow:
    # PKCE is off: we build one Flow for /start and another for /callback. With
    # autogenerate_code_verifier=True the verifier from step 1 would not exist on
    # step 2 and fetch_token fails. Web clients use client_secret here instead.
    flow = Flow.from_client_config(
        _client_config(),
        scopes=GOOGLE_SCOPES,
        state=state,
        autogenerate_code_verifier=False,
    )
    flow.redirect_uri = google_redirect_uri()
    return flow


def authorization_url() -> tuple[str, str]:
    flow = make_flow()
    url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    return url, state


def exchange_code(code: str, state: str) -> tuple[Credentials, str]:
    flow = make_flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        raise RuntimeError(
            "Google did not return a refresh token. "
            "Revoke app access at https://myaccount.google.com/permissions "
            "and sign in again so consent can issue offline access."
        )
    email = fetch_google_email(creds.token)
    return creds, email


def fetch_google_email(access_token: str) -> str:
    req = Request(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    try:
        with urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
    except HTTPError as e:
        raise RuntimeError(f"Could not read Google profile: HTTP {e.code}") from e
    email = (data.get("email") or "").strip()
    if not email:
        raise RuntimeError("Google account did not return an email address.")
    return email


def credentials_from_refresh(refresh_token: str) -> Credentials:
    """Build credentials for token refresh.

    Do not pass scopes here — Supabase issues the refresh token with its own
    scope set. Requesting different scopes on refresh causes invalid_scope.
    """
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_CLIENT_ID"].strip(),
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"].strip(),
    )


def verify_provider_refresh_token(refresh_token: str) -> None:
    """Ensure Supabase's Google refresh token works with our OAuth client."""
    creds = credentials_from_refresh(refresh_token)
    creds.refresh(GoogleAuthRequest())
