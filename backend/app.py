from __future__ import annotations

import secrets
import uuid
from contextlib import asynccontextmanager

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
from supabase_jwt import verify_supabase_access_token as _verify_supabase_user
from campaign_api import persist_sent_campaign, router as campaign_router
from billing_api import router as billing_router
from email_template_api import router as email_template_router
from user_resume_api import router as user_resume_router

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

app.include_router(user_resume_router)
app.include_router(email_template_router)
app.include_router(campaign_router)
app.include_router(billing_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_bool(v: str) -> bool:
    return str(v).lower() in ("true", "1", "on", "yes")


def _supabase_user_from_request(request: Request) -> dict | None:
    auth = request.headers.get("authorization") or request.headers.get(
        "Authorization", ""
    )
    if auth.startswith("Bearer "):
        try:
            return _verify_supabase_user(auth.removeprefix("Bearer ").strip())
        except RuntimeError:
            pass
    return None


def _supabase_user_id_from_request(request: Request) -> uuid.UUID | None:
    user = _supabase_user_from_request(request)
    if user:
        try:
            return uuid.UUID(str(user["id"]))
        except ValueError:
            pass
    return None


def _gmail_session_row(request: Request) -> dict | None:
    sid = request.cookies.get("outreach_session")
    if sid:
        row = session_store.get(sid)
        if row:
            return row

    owner_id = _supabase_user_id_from_request(request)
    if owner_id:
        return session_store.get_by_owner_id(str(owner_id))
    return None


def _owner_id_for_send(request: Request, row: dict | None) -> uuid.UUID | None:
    if row:
        raw = row.get("supabase_user_id")
        if raw:
            try:
                return uuid.UUID(str(raw))
            except ValueError:
                pass
    return _supabase_user_id_from_request(request)


def _billing_block_response(request: Request) -> JSONResponse | None:
    from billing import billing_enabled, require_can_send
    from database import make_session_factory

    if not billing_enabled():
        return None

    owner_id = _owner_id_for_send(request, _gmail_session_row(request))
    if owner_id is None:
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "code": "auth_required",
                "error": "Sign in is required before sending a campaign.",
                "auth_required": True,
            },
        )

    try:
        session_factory = make_session_factory()
    except RuntimeError:
        return None

    user = _supabase_user_from_request(request)
    with session_factory() as db:
        blocked = require_can_send(
            db,
            owner_id,
            email=user.get("email") if user else None,
        )
        if blocked is None:
            return None
        return JSONResponse(
            status_code=402,
            content={
                "ok": False,
                "code": "campaign_limit",
                "error": (
                    "Your 3 free campaigns have been used. Pay $5 once to unlock "
                    "unlimited campaigns."
                ),
                "billing": blocked,
            },
        )


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
    resume_storage_path: str | None = None,
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
        row = _gmail_session_row(request)
        if not row:
            sid = request.cookies.get("outreach_session")
            if not sid:
                return JSONResponse(
                    status_code=401,
                    content={
                        "ok": False,
                        "code": "gmail_session_missing",
                        "error": (
                            "Gmail send session cookie is missing. "
                            "Sign out and sign in again to reconnect Gmail."
                        ),
                        "detail": "No outreach_session cookie was sent with the request.",
                        "auth_required": True,
                    },
                )
            return JSONResponse(
                status_code=401,
                content={
                    "ok": False,
                    "code": "gmail_session_not_found",
                    "error": (
                        "Gmail send session expired or was not found on the server."
                    ),
                    "detail": (
                        "The outreach_session cookie was present but the backend "
                        "could not load it. On production this usually means "
                        "sessions are not persisted between deploys."
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
            err_text = str(e)
            detail = "Reconnect Gmail by signing out and signing in again."
            if "invalid_scope" in err_text:
                detail = (
                    "Gmail permissions on your Google account do not match what "
                    "Outreachyr expects. Sign out, revoke Outreachyr at "
                    "myaccount.google.com/permissions, then sign in again."
                )
            elif "invalid_grant" in err_text:
                detail = (
                    "Google rejected the stored login. Sign out and sign in again. "
                    "If this keeps happening, confirm Vercel GOOGLE_CLIENT_ID matches "
                    "the Google OAuth client configured in Supabase Auth."
                )
            return JSONResponse(
                status_code=401,
                content={
                    "ok": False,
                    "code": "google_refresh_revoked",
                    "error": f"Google login expired or revoked: {e}",
                    "detail": detail,
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
        owner_id = _owner_id_for_send(request, row)
        subj_final = subject if subject is not None else ""
        body_final = body_opt if body_opt is not None else ""
        path_clean = (resume_storage_path or "").strip() or None
        if owner_id:
            persist_sent_campaign(
                owner_id,
                company=company,
                subject=subj_final,
                body_text=body_final,
                people=people,
                resume_storage_path=path_clean,
            )
        return {"ok": True, "dry_run": False, "sent": len(people)}

    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "code": "google_backend_config",
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
    resume_storage_path: str | None = None,
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

    if not dry_run and not test_mode:
        blocked = _billing_block_response(request)
        if blocked is not None:
            return blocked

    return _send_campaign(
        request,
        people=people,
        company=company,
        dry_run=dry_run,
        subject=subj,
        body_opt=body_opt,
        resume_bytes=resume_bytes,
        resume_filename=resume_filename or "resume.pdf",
        resume_storage_path=(
            resume_storage_path.strip() if resume_storage_path else None
        ),
    )


class SendJsonRequest(BaseModel):
    company: str = Field("", description="Mapping key")
    dry_run: bool = Field(True)
    test_mode: bool = Field(False)
    subject: str = Field("")
    body_text: str = Field("")
    resume_storage_path: str = Field("")


class GoogleSessionRequest(BaseModel):
    access_token: str = Field(..., min_length=1)
    provider_refresh_token: str = Field(..., min_length=1)


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
    refresh_token = body.provider_refresh_token.strip()
    try:
        google_auth.verify_provider_refresh_token(refresh_token)
    except RefreshError as e:
        err_text = str(e)
        detail = (
            "Could not refresh Gmail access with the stored Google login. "
            "Sign out, revoke Outreachyr at myaccount.google.com/permissions, "
            "then sign in again."
        )
        if "invalid_grant" in err_text:
            detail = (
                "Google rejected the login token. Confirm Vercel GOOGLE_CLIENT_ID "
                "matches the OAuth client in Supabase Auth → Google, then sign in again."
            )
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "code": "google_refresh_failed",
                "error": f"Google token refresh failed: {e}",
                "detail": detail,
            },
        )
    try:
        session_store.upsert(
            session_id,
            {
                "refresh_token": refresh_token,
                "email": user["email"],
                "supabase_user_id": user["id"],
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "gmail_session_store_failed",
                "error": f"Could not store Gmail session: {e}",
                "detail": (
                    "The backend could not persist your Gmail credentials. "
                    "Check DATABASE_URL and run migrations on production."
                ),
            },
        )

    response = JSONResponse({"ok": True, "session_id": session_id})
    response.set_cookie(
        key="outreach_session",
        value=session_id,
        max_age=60 * 60 * 24 * 60,
        httponly=True,
        samesite="lax",
        secure=frontend_base_url().startswith("https://"),
        path="/",
    )
    return response


@app.get("/api/auth/me")
def auth_me(request: Request):
    if not google_oauth_configured():
        return {"authenticated": False, "oauth_required": False, "email": None}
    row = _gmail_session_row(request)
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
    resume_storage_path: str = Form(""),
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
        resume_storage_path=resume_storage_path.strip() or None,
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
        resume_storage_path=body.resume_storage_path.strip() or None,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=5050, reload=True)
