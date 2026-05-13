"""Email outreach templates (Postgres + Supabase JWT)."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import make_session_factory
from models import Template
from supabase_jwt import verify_supabase_access_token

router = APIRouter(prefix="/api", tags=["email-templates"])

_sm = None


def _session_factory():
    global _sm
    if _sm is None:
        _sm = make_session_factory()
    return _sm


def get_db_session():
    try:
        session = _session_factory()()
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Database not configured: {e}",
        ) from e
    try:
        yield session
    finally:
        session.close()


def require_supabase_user(request: Request) -> dict:
    auth = request.headers.get("authorization") or request.headers.get(
        "Authorization", ""
    )
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.removeprefix("Bearer ").strip()
    try:
        user = verify_supabase_access_token(token)
    except RuntimeError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    return user


def _row_json(r: Template) -> dict[str, Any]:
    return {
        "id": str(r.id),
        "owner_id": str(r.owner_id),
        "name": r.name,
        "subject": r.subject,
        "body_text": r.body_text,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


class TemplateCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    subject: str = Field(..., min_length=1, max_length=500)
    body_text: str = Field(..., min_length=1, max_length=50_000)


class TemplateUpdateBody(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=500)
    subject: str | None = Field(None, min_length=1, max_length=500)
    body_text: str | None = Field(None, min_length=1, max_length=50_000)


@router.get("/templates")
def list_templates(
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    rows = (
        session.execute(
            select(Template)
            .where(Template.owner_id == uid)
            .order_by(Template.updated_at.desc())
        )
        .scalars()
        .all()
    )
    return {"rows": [_row_json(r) for r in rows]}


@router.post("/templates")
def create_template(
    body: TemplateCreateBody,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    row = Template(
        owner_id=uid,
        name=body.name.strip(),
        subject=body.subject.strip(),
        body_text=body.body_text,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return {"row": _row_json(row)}


@router.patch("/templates/{template_id}")
def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdateBody,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    if body.name is None and body.subject is None and body.body_text is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    uid = uuid.UUID(user["id"])
    row = session.execute(
        select(Template).where(Template.id == template_id, Template.owner_id == uid)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if body.name is not None:
        row.name = body.name.strip()
    if body.subject is not None:
        row.subject = body.subject.strip()
    if body.body_text is not None:
        row.body_text = body.body_text

    session.commit()
    session.refresh(row)
    return {"row": _row_json(row)}


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: uuid.UUID,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    row = session.execute(
        select(Template).where(Template.id == template_id, Template.owner_id == uid)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    session.delete(row)
    session.commit()
    return {"ok": True}
