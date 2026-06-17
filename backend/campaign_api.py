"""Campaign list + persist sent outreach (Postgres + Supabase JWT)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import make_session_factory
from models import Campaign, CampaignRecipient
from user_resume_api import get_db_session, require_supabase_user, storage_download_object

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["campaigns"])

_sm = None


def _session_factory():
    global _sm
    if _sm is None:
        _sm = make_session_factory()
    return _sm


def persist_sent_campaign(
    owner_id: uuid.UUID,
    *,
    company: str,
    subject: str,
    body_text: str,
    people: list[tuple[str, str]],
    resume_storage_path: str | None = None,
) -> None:
    """Insert a sent campaign and recipients. Swallows DB errors (send already succeeded)."""
    try:
        factory = _session_factory()
    except RuntimeError as e:
        logger.warning("Campaign not saved (database): %s", e)
        return

    now = datetime.now(timezone.utc)
    session = factory()
    try:
        camp = Campaign(
            owner_id=owner_id,
            template_id=None,
            company=company,
            subject=subject,
            body_text=body_text,
            status="sent",
            resume_storage_path=resume_storage_path,
            sent_at=now,
        )
        session.add(camp)
        session.flush()
        for email, greeting_name in people:
            session.add(
                CampaignRecipient(
                    campaign_id=camp.id,
                    email=email,
                    greeting_name=greeting_name or None,
                    status="sent",
                    sent_at=now,
                )
            )
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to persist sent campaign for owner %s", owner_id)
    finally:
        session.close()


def _campaign_row_json(session: Session, camp: Campaign) -> dict[str, Any]:
    rc = session.scalar(
        select(func.count())
        .select_from(CampaignRecipient)
        .where(CampaignRecipient.campaign_id == camp.id)
    )
    return {
        "id": str(camp.id),
        "company": camp.company,
        "subject": camp.subject,
        "body_preview": (camp.body_text or "")[:240],
        "status": camp.status,
        "recipient_count": int(rc or 0),
        "resume_attached": bool(camp.resume_storage_path),
        "created_at": camp.created_at.isoformat() if camp.created_at else None,
        "updated_at": camp.updated_at.isoformat() if camp.updated_at else None,
        "sent_at": camp.sent_at.isoformat() if camp.sent_at else None,
    }


@router.get("/campaigns")
def list_campaigns(
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    rows = (
        session.execute(
            select(Campaign)
            .where(Campaign.owner_id == uid)
            .order_by(Campaign.updated_at.desc())
        )
        .scalars()
        .all()
    )
    return {"rows": [_campaign_row_json(session, r) for r in rows]}


def _campaign_detail_json(session: Session, camp: Campaign) -> dict[str, Any]:
    recipients = (
        session.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.campaign_id == camp.id)
            .order_by(CampaignRecipient.created_at.asc())
        )
        .scalars()
        .all()
    )
    return {
        "id": str(camp.id),
        "company": camp.company,
        "subject": camp.subject,
        "body_text": camp.body_text or "",
        "status": camp.status,
        "resume_storage_path": camp.resume_storage_path,
        "recipients": [
            {
                "email": r.email,
                "greeting_name": r.greeting_name or "",
            }
            for r in recipients
        ],
    }


@router.get("/campaigns/{campaign_id}")
def get_campaign(
    campaign_id: uuid.UUID,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    camp = session.scalar(
        select(Campaign).where(
            Campaign.id == campaign_id,
            Campaign.owner_id == uid,
        )
    )
    if camp is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _campaign_detail_json(session, camp)


@router.get("/campaigns/{campaign_id}/resume")
def get_campaign_resume_file(
    campaign_id: uuid.UUID,
    request: Request,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    camp = session.scalar(
        select(Campaign).where(
            Campaign.id == campaign_id,
            Campaign.owner_id == uid,
        )
    )
    if camp is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    path = (camp.resume_storage_path or "").strip()
    if not path:
        raise HTTPException(status_code=404, detail="No resume attached to this campaign")

    uid_str = str(uid)
    if not path.startswith(f"{uid_str}/"):
        raise HTTPException(status_code=403, detail="Invalid storage path")

    token = request.state.supabase_access_token
    data = storage_download_object(token, path)
    company = (camp.company or "resume").strip().replace('"', "").replace("/", "-")
    safe_name = f"{company}-resume"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.pdf"',
            "Cache-Control": "private, max-age=0, no-store",
        },
    )
