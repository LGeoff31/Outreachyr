from __future__ import annotations

import smtplib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import send as outreach
from utils import _load_dotenv, domain_for_company

_app_init_done = False


def ensure_env() -> None:
    global _app_init_done
    if not _app_init_done:
        _load_dotenv()
        _app_init_done = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_env()
    yield


app = FastAPI(title="Outreach API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SendRequest(BaseModel):
    company: str = Field("", description="Mapping key, e.g. palantir")
    dry_run: bool = Field(
        True, description="If true, only return inferred addresses")


@app.get("/api/companies")
def api_companies():
    """Known company keys from mapping (for UI hints)."""
    from mapping import COMPANY_EMAIL_HOST

    return {"companies": sorted(COMPANY_EMAIL_HOST.keys())}


@app.post("/api/send")
def api_send(body: SendRequest):
    company = body.company.strip()

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

    if body.dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "count": len(people),
            "recipients": recipients,
        }

    try:
        outreach.send(people, company)
    except (OSError, smtplib.SMTPException) as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": f"Send failed: {e}"},
        )

    return {"ok": True, "dry_run": False, "sent": len(people)}


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="127.0.0.1", port=5050, reload=True)
