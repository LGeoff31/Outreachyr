from __future__ import annotations

import logging
import secrets
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
    subject: str,
    body_text: str,
    resume_bytes: bytes | None,
    resume_filename: str,
):
    company = company.strip()
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
    subject: str = Field("")
    body_text: str = Field("")


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
    if not google_oauth_configured():
        return JSONResponse(
            status_code=503,
            content={"error": "Google OAuth is not configured on this server."},
        )
    try:
        url, state = google_auth.authorization_url()
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Could not start Google login: {e}"},
        )
    response = RedirectResponse(url=url, status_code=302)
    response.set_cookie(
        key="oauth_csrf",
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@app.get("/api/auth/google/callback")
def auth_google_callback(request: Request):
    base = frontend_base_url()
    if not google_oauth_configured():
        return RedirectResponse(url=f"{base}/login?error=oauth_disabled", status_code=302)

    err = request.query_params.get("error")
    if err:
        return RedirectResponse(url=f"{base}/login?error={err}", status_code=302)

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    cookie = request.cookies.get("oauth_csrf")
    if not code or not state or not cookie or state != cookie:
        return RedirectResponse(url=f"{base}/login?error=invalid_state", status_code=302)

    try:
        creds, email = google_auth.exchange_code(code, state)
    except Exception:
        logging.exception("OAuth token exchange failed")
        return RedirectResponse(url=f"{base}/login?error=exchange", status_code=302)

    session_id = secrets.token_urlsafe(32)
    session_store.upsert(
        session_id,
        {"refresh_token": creds.refresh_token, "email": email},
    )

    response = RedirectResponse(url=f"{base}/dashboard", status_code=302)
    response.delete_cookie("oauth_csrf", path="/")
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
    company: str = Form(...),
    dry_run: str = Form("true"),
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
