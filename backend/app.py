from __future__ import annotations

import smtplib
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import send as outreach
from config import load_dotenv
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_bool(v: str) -> bool:
    return str(v).lower() in ("true", "1", "on", "yes")


def _run_send(
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
                "error": f'Company "{company}" is not in mapping.py — add COMPANY_EMAIL_HOST entry.',
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
                "error": "No addresses inferred from search (SerpAPI returned nothing usable).",
            },
        )

    recipients = [{"email": e, "greeting_name": n} for e, n in people]

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "count": len(people),
            "recipients": recipients,
        }

    subj = subject.strip() or None
    body_opt = body_text if body_text.strip() else None
    try:
        outreach.send(
            people,
            company,
            subject=subj,
            body_text=body_opt,
            resume_bytes=resume_bytes,
            resume_filename=resume_filename or "resume.pdf",
        )
    except (OSError, smtplib.SMTPException) as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": f"Send failed: {e}"},
        )

    return {"ok": True, "dry_run": False, "sent": len(people)}


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
    from mapping import COMPANY_EMAIL_HOST

    return {"companies": sorted(COMPANY_EMAIL_HOST.keys())}


@app.post("/api/send")
async def api_send_multipart(
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
        company=company,
        dry_run=_parse_bool(dry_run),
        subject=subject,
        body_text=body_text,
        resume_bytes=rbytes,
        resume_filename=rname,
    )


@app.post("/api/send/json")
def api_send_json(body: SendJsonRequest):
    return _run_send(
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
