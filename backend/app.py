from __future__ import annotations

import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Cookie, FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, SQLAlchemyError

import google_oauth as google_auth
import send as outreach
import send_queue
import session_store
from config import (
    frontend_base_url,
    frontend_origins,
    google_oauth_configured,
    load_dotenv,
    supabase_auth_configured,
)
from database import make_engine
from gmail_send_oauth import ensure_fresh_access_token, send_messages_oauth
from mapping import COMPANY_EMAIL_HOST
from recipient_selection import (
    normalize_selected_recipients,
    parse_selected_recipients_json,
)
from supabase_jwt import verify_supabase_access_token as _verify_supabase_user
from campaign_api import persist_sent_campaign, router as campaign_router
from billing_api import router as billing_router
from email_template_api import router as email_template_router
from user_resume_api import router as user_resume_router, storage_download_object, storage_upload_object

_app_init_done = False
logger = logging.getLogger(__name__)


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


@app.exception_handler(OperationalError)
async def db_operational_error_handler(_request: Request, exc: OperationalError):
    logger.exception("Database connection failed")
    detail = str(getattr(exc, "orig", exc))
    return JSONResponse(
        status_code=503,
        content={
            "detail": f"Database connection failed: {detail}",
            "code": "database_unavailable",
        },
    )


@app.exception_handler(SQLAlchemyError)
async def db_sqlalchemy_error_handler(_request: Request, exc: SQLAlchemyError):
    logger.exception("Database query failed")
    return JSONResponse(
        status_code=503,
        content={
            "detail": f"Database error: {exc}",
            "code": "database_error",
        },
    )


def _parse_bool(v: str) -> bool:
    return str(v).lower() in ("true", "1", "on", "yes")


def _supabase_access_token_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get(
        "Authorization", ""
    )
    if auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
        return token or None
    return None


def _resolve_resume_attachment_for_send(
    request: Request,
    *,
    resume_bytes: bytes | None,
    resume_filename: str,
    resume_storage_path: str | None,
) -> tuple[bytes | None, str]:
    if resume_bytes:
        return resume_bytes, resume_filename or "resume.pdf"

    path = (resume_storage_path or "").strip()
    if not path:
        return None, resume_filename or "resume.pdf"

    token = _supabase_access_token_from_request(request)
    if not token:
        logger.warning("Resume storage path provided but no Supabase token for download")
        return None, resume_filename or "resume.pdf"

    try:
        data = storage_download_object(token, path)
    except Exception:
        logger.exception("Failed to load resume from storage for send: %s", path)
        return None, resume_filename or "resume.pdf"

    if not data:
        return None, resume_filename or "resume.pdf"

    name = Path(path).name or resume_filename or "resume.pdf"
    return data, name


def _resolve_campaign_resume_path(
    request: Request,
    owner_id: uuid.UUID | None,
    resume_storage_path: str | None,
    resume_bytes: bytes | None,
) -> str | None:
    path_clean = (resume_storage_path or "").strip() or None
    if path_clean:
        return path_clean
    if owner_id is None or not resume_bytes:
        return None

    token = _supabase_access_token_from_request(request)
    if not token:
        return None

    object_path = f"{owner_id}/campaigns/{uuid.uuid4()}.pdf"
    try:
        storage_upload_object(token, object_path, resume_bytes)
        return object_path
    except Exception:
        logger.exception(
            "Failed to store campaign resume snapshot for owner %s", owner_id
        )
        return None


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


def _billing_status_for_owner(
    request: Request, owner_id: uuid.UUID | None
) -> dict | None:
    from billing import billing_enabled, billing_status_for_user
    from database import make_session_factory

    if owner_id is None or not billing_enabled():
        return None
    try:
        session_factory = make_session_factory()
    except RuntimeError:
        return None

    user = _supabase_user_from_request(request)
    with session_factory() as db:
        return billing_status_for_user(
            db,
            owner_id,
            email=user.get("email") if user else None,
        )


GMAIL_SEND_SCOPE_ERROR = (
    "Gmail send permission was not granted. Sign out, then sign in again and "
    "check the box allowing Outreachyr to send email on your behalf."
)
GMAIL_SEND_SCOPE_DETAIL = (
    "If you previously skipped that permission, revoke Outreachyr at "
    "myaccount.google.com/permissions first, then sign in again."
)


def _gmail_api_error_response(exc: HttpError) -> JSONResponse:
    detail = ""
    try:
        detail = exc.content.decode(errors="replace") if exc.content else str(exc)
    except Exception:
        detail = str(exc)

    detail_lower = detail.lower()
    if exc.resp.status == 403 and (
        "insufficient authentication scopes" in detail_lower
        or "insufficientpermission" in detail_lower
        or "insufficient permission" in detail_lower
    ):
        return JSONResponse(
            status_code=401,
            content={
                "ok": False,
                "code": "gmail_send_scope_missing",
                "error": GMAIL_SEND_SCOPE_ERROR,
                "detail": GMAIL_SEND_SCOPE_DETAIL,
                "auth_required": True,
            },
        )

    return JSONResponse(
        status_code=502,
        content={"ok": False, "error": f"Gmail API error: {detail}"},
    )


def _send_campaign(
    request: Request,
    *,
    people: list[tuple[str, str]],
    recipient_details: list[dict[str, str]] | None = None,
    company: str,
    dry_run: bool,
    test_mode: bool = False,
    subject: str | None,
    body_opt: str | None,
    resume_bytes: bytes | None,
    resume_filename: str,
    resume_storage_path: str | None = None,
):
    recipients = (
        recipient_details
        if recipient_details is not None
        else [{"email": e, "greeting_name": n} for e, n in people]
    )

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
        queued = False
        try:
            attachment_bytes, attachment_name = _resolve_resume_attachment_for_send(
                request,
                resume_bytes=resume_bytes,
                resume_filename=resume_filename or "resume.pdf",
                resume_storage_path=resume_storage_path,
            )
            messages = outreach.build_outreach_messages(
                people,
                company,
                sender_email=sender,
                subject=subject,
                body_text=body_opt,
                resume_bytes=attachment_bytes,
                resume_filename=attachment_name,
            )
            ensure_fresh_access_token(creds)
            logger.info(
                "Sending campaign for %s (%d recipient(s), test_mode=%s)",
                sender,
                len(people),
                test_mode,
            )
            send_messages_oauth(creds, messages)
            logger.info(
                "Campaign send finished for %s (%d recipient(s))",
                sender,
                len(people),
            )
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
            return _gmail_api_error_response(e)
        except OSError as e:
            return JSONResponse(
                status_code=500,
                content={"ok": False, "error": f"Send failed: {e}"},
            )
        except Exception as e:
            logger.exception("Campaign send failed for %s", sender)
            return JSONResponse(
                status_code=502,
                content={"ok": False, "error": f"Send failed: {e}"},
            )
        owner_id = _owner_id_for_send(request, row)
        subj_final = subject if subject is not None else ""
        body_final = body_opt if body_opt is not None else ""
        path_clean = _resolve_campaign_resume_path(
            request,
            owner_id,
            resume_storage_path,
            resume_bytes,
        )

        billing_status = None
        if owner_id and not test_mode:
            persist_sent_campaign(
                owner_id,
                company=company,
                subject=subj_final,
                body_text=body_final,
                people=people,
                resume_storage_path=path_clean,
            )
            try:
                billing_status = _billing_status_for_owner(request, owner_id)
            except (OperationalError, SQLAlchemyError):
                logger.exception(
                    "Could not load billing status after send for owner %s",
                    owner_id,
                )

        response: dict = {
            "ok": True,
            "dry_run": False,
            "queued": queued,
            "sent": len(people),
            "count": len(people),
        }
        if billing_status is not None:
            response["billing"] = billing_status
        return response

    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "code": "google_backend_config",
            "error": (
                "Server is not configured for Google sign-in. "
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the root .env."
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
    selected_people: list[tuple[str, str]] | None = None,
    resume_profile_school: str | None = None,
    resume_profile_school_normalized: str | None = None,
):
    company = company.strip()
    recipient_details: list[dict[str, str]] | None = None
    if not dry_run and selected_people is not None:
        if not selected_people:
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error": "Select at least one recipient before sending.",
                },
            )
        if test_mode:
            company = company or "Sample Company (test mode)"
        elif not company:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "Enter a company name."},
            )
        people = selected_people
    elif test_mode:
        company = company or "Sample Company (test mode)"
        people = outreach.test_recipients()
    else:
        if not company:
            return JSONResponse(
                status_code=400,
                content={"ok": False, "error": "Enter a company name."},
            )

        try:
            if dry_run:
                recipient_details = outreach.discover_preview_candidates(
                    company,
                    school_name=resume_profile_school,
                    school_normalized=resume_profile_school_normalized,
                )
                people = [
                    (r["email"], r.get("greeting_name", ""))
                    for r in recipient_details
                ]
            else:
                people = outreach.discover(
                    company,
                    school_name=resume_profile_school,
                    school_normalized=resume_profile_school_normalized,
                )
        except RuntimeError as e:
            if dry_run:
                return {
                    "ok": True,
                    "dry_run": True,
                    "count": 0,
                    "recipients": [],
                }
            return JSONResponse(
                status_code=502,
                content={"ok": False, "error": str(e)},
            )

        if not people:
            if dry_run:
                return {
                    "ok": True,
                    "dry_run": True,
                    "count": 0,
                    "recipients": [],
                }
            return JSONResponse(
                status_code=404,
                content={
                    "ok": False,
                    "code": "no_recruiters_found",
                    "error": (
                        "No addresses inferred from search "
                        "(SerpAPI returned nothing usable)."
                    ),
                },
            )

    subj = subject.strip() or None
    body_opt = body_text if body_text.strip() else None

    if not test_mode:
        blocked = _billing_block_response(request)
        if blocked is not None:
            return blocked

    return _send_campaign(
        request,
        people=people,
        recipient_details=recipient_details,
        company=company,
        dry_run=dry_run,
        test_mode=test_mode,
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
    selected_recipients: list[dict[str, str]] | None = Field(default=None)
    resume_profile_school: str = Field("")
    resume_profile_school_normalized: str = Field("")


class GoogleSessionRequest(BaseModel):
    access_token: str = Field(..., min_length=1)
    provider_refresh_token: str = Field(..., min_length=1)


@app.get("/")
def root():
    """FastAPI is API-only; run the Next.js app from `frontend/`."""
    frontend_url = frontend_base_url()
    return {
        "service": "Outreach API",
        "docs": "/docs",
        "health": "/health",
        "frontend": f"cd ../frontend && npm run dev -> {frontend_url}",
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
    selected_recipients: str = Form(""),
    resume_profile_school: str = Form(""),
    resume_profile_school_normalized: str = Form(""),
):
    selected_people, selected_error = parse_selected_recipients_json(
        selected_recipients
    )
    if selected_error:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": selected_error},
        )

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
        selected_people=selected_people,
        resume_profile_school=resume_profile_school.strip() or None,
        resume_profile_school_normalized=(
            resume_profile_school_normalized.strip() or None
        ),
    )


@app.post("/api/send/json")
def api_send_json(request: Request, body: SendJsonRequest):
    selected_people, selected_error = normalize_selected_recipients(
        body.selected_recipients
    )
    if selected_error:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": selected_error},
        )

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
        selected_people=selected_people,
        resume_profile_school=body.resume_profile_school.strip() or None,
        resume_profile_school_normalized=(
            body.resume_profile_school_normalized.strip() or None
        ),
    )


@app.get("/api/internal/process-send-queue")
def process_send_queue_endpoint(request: Request):
    secret = os.environ.get("CRON_SECRET", "").strip()
    if secret:
        auth = request.headers.get("authorization", "")
        if auth != f"Bearer {secret}":
            return JSONResponse(status_code=401, content={"ok": False, "error": "Unauthorized"})
    try:
        result = send_queue.process_send_queue(max_seconds=280.0)
    except RuntimeError as exc:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "error": str(exc)},
        )
    return {"ok": True, **result}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db():
    import os

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "database_not_configured",
                "detail": "DATABASE_URL is not set on the backend.",
            },
        )

    host_hint = "unknown"
    if "@" in database_url:
        host_hint = database_url.split("@", 1)[1].split("/", 1)[0]

    try:
        with make_engine().connect() as connection:
            templates = connection.execute(
                text("select count(*) from templates")
            ).scalar_one()
        return {
            "ok": True,
            "database_host": host_hint,
            "templates_count": templates,
        }
    except Exception as exc:
        logger.exception("Health DB check failed")
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "code": "database_unavailable",
                "database_host": host_hint,
                "detail": str(exc),
            },
        )


if __name__ == "__main__":
    import os

    import uvicorn

    # Hot reload kills in-flight background sends. Opt in with UVICORN_RELOAD=1.
    reload = os.environ.get("UVICORN_RELOAD", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    uvicorn.run("app:app", host="127.0.0.1", port=5050, reload=reload)
