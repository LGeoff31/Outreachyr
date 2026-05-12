from __future__ import annotations

import json
import secrets
from contextlib import asynccontextmanager
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import Cookie, FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field

import google_oauth as google_auth
import send as outreach
import session_store
from config import (
    frontend_base_url,
    frontend_origins,
    google_oauth_configured,
    load_dotenv,
    supabase_auth_configured,
    supabase_publishable_key,
    supabase_url,
)
from gmail_send_oauth import send_messages_oauth
from mapping import COMPANY_EMAIL_HOST
from utils import domain_for_company

_app_init_done = False


def ensure_env() -> None:
    global _app_init_done
    if not _app_init_done:
        load_dotenv()
        _app_init_done = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_env()
    yield


app = FastAPI(title="Outreach API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_bool(v: str) -> bool:
    return str(v).lower() in ("true", "1", "on", "yes")


def _send_campaign(
    request: Request,
    *,
    people: list[tuple[str, str]],
    company: str,
    dry_run: bool,
    subject: str | None,
    body_opt: str | None,
    resume_bytes: bytes | None,
    resume_filename: str,
):
    recipients = [{"email": e, "greeting_name": n} for e, n in people]

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "count": len(people),
            "recipients": recipients,
        }

    if google_oauth_configured():
        sid = request.cookies.get("outreach_session")
        row = session_store.get(sid) if sid else None
        if not row:
            return JSONResponse(
                status_code=401,
                content={
                    "ok": False,
                    "error": (
                        "Sign in with Google so Outreachyr can send mail from "
                        "your Gmail account."
                    ),
                    "auth_required": True,
                },
            )
        creds = google_auth.credentials_from_refresh(row["refresh_token"])
        sender = row["email"]
        try:
            messages = outreach.build_outreach_messages(
                people,
                company,
                sender_email=sender,
                subject=subject,
                body_text=body_opt,
                resume_bytes=resume_bytes,
                resume_filename=resume_filename or "resume.pdf",
            )
            send_messages_oauth(creds, messages)
        except RefreshError as e:
            return JSONResponse(
                status_code=401,
                content={
                    "ok": False,
                    "error": f"Google login expired or revoked: {e}",
                    "auth_required": True,
                },
            )
        except HttpError as e:
            detail = ""
            try:
                detail = e.content.decode(errors="replace") if e.content else str(e)
            except Exception:
                detail = str(e)
            return JSONResponse(
                status_code=502,
                content={"ok": False, "error": f"Gmail API error: {detail}"},
            )
        except OSError as e:
            return JSONResponse(
                status_code=500,
                content={"ok": False, "error": f"Send failed: {e}"},
            )
        return {"ok": True, "dry_run": False, "sent": len(people)}

    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "error": (
                "Server is not configured for Google sign-in. "
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend .env."
            ),
        },
    )


def _run_send(
    request: Request,
    *,
    company: str,
    dry_run: bool,
    test_mode: bool,
    subject: str,
    body_text: str,
    resume_bytes: bytes | None,
    resume_filename: str,
):
    company = company.strip()
    if test_mode:
        company = company or "Sample Company (test mode)"
        people = outreach.test_recipients()
    else:
        if not company:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "Enter a company name."},
            )

        if domain_for_company(company) is None:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": (
                        f'Company "{company}" is not in mapping.py — '
                        "add COMPANY_EMAIL_HOST entry."
                    ),
                },
            )

        try:
            people = outreach.discover(company)
        except RuntimeError as e:
            return JSONResponse(
                status_code=502,
                content={"ok": False, "error": str(e)},
            )

        if not people:
            return JSONResponse(
                status_code=404,
                content={
                    "ok": False,
                    "error": (
                        "No addresses inferred from search "
                        "(SerpAPI returned nothing usable)."
                    ),
                },
            )

    subj = subject.strip() or None
    body_opt = body_text if body_text.strip() else None

    return _send_campaign(
        request,
        people=people,
        company=company,
        dry_run=dry_run,
        subject=subj,
        body_opt=body_opt,
        resume_bytes=resume_bytes,
        resume_filename=resume_filename or "resume.pdf",
    )


class SendJsonRequest(BaseModel):
    company: str = Field("", description="Mapping key")
    dry_run: bool = Field(True)
    test_mode: bool = Field(False)
    subject: str = Field("")
    body_text: str = Field("")


class GoogleSessionRequest(BaseModel):
    access_token: str = Field(..., min_length=1)
    provider_refresh_token: str = Field(..., min_length=1)


def _verify_supabase_user(access_token: str) -> dict:
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
        raise RuntimeError(f"Supabase Auth rejected the session: HTTP {e.code}") from e
    except (OSError, URLError) as e:
        raise RuntimeError(f"Could not reach Supabase Auth: {e}") from e

    email = (data.get("email") or "").strip()
    user_id = (data.get("id") or "").strip()
    if not email or not user_id:
        raise RuntimeError("Supabase Auth did not return a usable user.")
    return {"email": email, "id": user_id}


@app.get("/")
def root():
    """FastAPI is API-only; run the Next.js app from `frontend/`."""
    return {
        "service": "Outreach API",
        "docs": "/docs",
        "health": "/health",
        "frontend": "cd ../frontend && npm run dev -> http://localhost:3000",
    }


@app.get("/api/companies")
def api_companies():
    return {"companies": sorted(COMPANY_EMAIL_HOST.keys())}


@app.get("/api/auth/google/start")
def auth_google_start():
    return JSONResponse(
        status_code=410,
        content={"error": "Google sign-in is handled by Supabase Auth."},
    )


@app.get("/api/auth/google/callback")
def auth_google_callback():
    base = frontend_base_url()
    return RedirectResponse(
        url=f"{base}/login?error=supabase_auth_required",
        status_code=302,
    )


@app.post("/api/auth/google/session")
def auth_google_session(body: GoogleSessionRequest):
    if not google_oauth_configured():
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "google_backend_config",
                "error": "Google OAuth is not configured.",
            },
        )
    if not supabase_auth_configured():
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "supabase_backend_config",
                "error": "Supabase Auth is not configured.",
            },
        )

    try:
        user = _verify_supabase_user(body.access_token.strip())
    except RuntimeError as e:
        return JSONResponse(
            status_code=401,
            content={"ok": False, "code": "supabase_session", "error": str(e)},
        )

    session_id = secrets.token_urlsafe(32)
    session_store.upsert(
        session_id,
        {
            "refresh_token": body.provider_refresh_token.strip(),
            "email": user["email"],
            "supabase_user_id": user["id"],
        },
    )

    response = JSONResponse({"ok": True})
    response.set_cookie(
        key="outreach_session",
        value=session_id,
        max_age=60 * 60 * 24 * 60,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@app.get("/api/auth/me")
def auth_me(outreach_session: str | None = Cookie(default=None)):
    if not google_oauth_configured():
        return {"authenticated": False, "oauth_required": False, "email": None}
    if not outreach_session:
        return {"authenticated": False, "oauth_required": True, "email": None}
    row = session_store.get(outreach_session)
    if not row:
        return {"authenticated": False, "oauth_required": True, "email": None}
    return {
        "authenticated": True,
        "oauth_required": True,
        "email": row.get("email"),
    }


@app.post("/api/auth/logout")
def auth_logout(outreach_session: str | None = Cookie(default=None)):
    if outreach_session:
        session_store.delete(outreach_session)
    response = JSONResponse({"ok": True})
    response.delete_cookie("outreach_session", path="/")
    return response


@app.post("/api/send")
async def api_send_multipart(
    request: Request,
    company: str = Form(""),
    dry_run: str = Form("true"),
    test_mode: str = Form("false"),
    subject: str = Form(""),
    body_text: str = Form(""),
    resume: UploadFile | None = File(None),
):
    rbytes: bytes | None = None
    rname = "resume.pdf"
    if resume is not None and resume.filename:
        rbytes = await resume.read()
        rname = resume.filename
    return _run_send(
        request,
        company=company,
        dry_run=_parse_bool(dry_run),
        test_mode=_parse_bool(test_mode),
        subject=subject,
        body_text=body_text,
        resume_bytes=rbytes,
        resume_filename=rname,
    )


@app.post("/api/send/json")
def api_send_json(request: Request, body: SendJsonRequest):
    return _run_send(
        request,
        company=body.company,
        dry_run=body.dry_run,
        test_mode=body.test_mode,
        subject=body.subject,
        body_text=body.body_text,
        resume_bytes=None,
        resume_filename="resume.pdf",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=5050, reload=True)
