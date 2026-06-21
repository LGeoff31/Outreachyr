"""User resume library via Postgres + Supabase Storage REST (bypasses PostgREST)."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from config import supabase_publishable_key, supabase_url
from database import make_session_factory
from models import (
    ResumeProfile,
    ResumeProfileEducation,
    ResumeProfileExperience,
    ResumeProfileExperienceHighlight,
    ResumeProfileExperienceSkill,
    ResumeProfileLink,
    ResumeProfileProject,
    ResumeProfileProjectLink,
    ResumeProfileProjectSkill,
    ResumeProfileSkill,
    UserResume,
)
from resume_profile_parser import (
    PARSER_VERSION,
    normalize_school_name,
    parse_resume_pdf,
)
from supabase_jwt import verify_supabase_access_token

router = APIRouter(prefix="/api", tags=["user-resumes"])
logger = logging.getLogger(__name__)

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
    request.state.supabase_access_token = token
    return user


def _storage_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "apikey": supabase_publishable_key(),
    }


def _encode_object_path(object_path: str) -> str:
    return "/".join(quote(part, safe="") for part in object_path.split("/") if part)


def storage_upload_object(access_token: str, object_path: str, data: bytes) -> None:
    base = supabase_url().rstrip("/")
    enc = _encode_object_path(object_path)
    url = f"{base}/storage/v1/object/resumes/{enc}"
    req = UrlRequest(
        url,
        data=data,
        method="POST",
        headers={
            **_storage_headers(access_token),
            "Content-Type": "application/pdf",
        },
    )
    try:
        with urlopen(req, timeout=120) as r:
            if r.status not in (200, 201):
                raise HTTPException(
                    status_code=502,
                    detail=f"Storage upload failed: HTTP {r.status}",
                )
    except HTTPError as e:
        err_body = e.read().decode(errors="replace") if e.fp else ""
        raise HTTPException(
            status_code=502,
            detail=f"Storage upload rejected: HTTP {e.code} {err_body}",
        ) from e
    except (OSError, URLError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Storage upload failed: {e}",
        ) from e


def storage_remove_object(access_token: str, object_path: str) -> None:
    base = supabase_url().rstrip("/")
    enc = _encode_object_path(object_path)
    url = f"{base}/storage/v1/object/resumes/{enc}"
    req = UrlRequest(url, method="DELETE", headers=_storage_headers(access_token))
    try:
        with urlopen(req, timeout=60) as r:
            r.read()
    except (HTTPError, OSError, URLError):
        pass


def storage_download_object(access_token: str, object_path: str) -> bytes:
    """Private bucket objects: try ``authenticated`` URL first, then standard object URL."""
    base = supabase_url().rstrip("/")
    enc = _encode_object_path(object_path)
    urls = (
        f"{base}/storage/v1/object/authenticated/resumes/{enc}",
        f"{base}/storage/v1/object/resumes/{enc}",
    )
    last: HTTPError | None = None
    for url in urls:
        req = UrlRequest(url, headers=_storage_headers(access_token), method="GET")
        try:
            with urlopen(req, timeout=120) as r:
                return r.read()
        except HTTPError as e:
            last = e
            if e.code != 400 and e.code != 404:
                err_body = e.read().decode(errors="replace") if e.fp else ""
                raise HTTPException(
                    status_code=502,
                    detail=f"Storage download failed: HTTP {e.code} {err_body}",
                ) from e
            continue
        except (OSError, URLError) as e:
            raise HTTPException(
                status_code=502,
                detail=f"Storage download failed: {e}",
            ) from e
    err_body = last.read().decode(errors="replace") if last and last.fp else ""
    code = last.code if last else "?"
    raise HTTPException(
        status_code=502,
        detail=f"Storage download failed: HTTP {code} {err_body}",
    )


def storage_create_signed_url(access_token: str, object_path: str) -> str:
    base = supabase_url().rstrip("/")
    enc = _encode_object_path(object_path)
    url = f"{base}/storage/v1/object/sign/resumes/{enc}"
    payload = json.dumps({"expiresIn": 3600}).encode()
    req = UrlRequest(
        url,
        data=payload,
        method="POST",
        headers={
            **_storage_headers(access_token),
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(req, timeout=30) as r:
            raw = json.loads(r.read().decode())
    except HTTPError as e:
        err_body = e.read().decode(errors="replace") if e.fp else ""
        raise HTTPException(
            status_code=502,
            detail=f"Signed URL failed: HTTP {e.code} {err_body}",
        ) from e
    except (OSError, URLError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Signed URL failed: {e}",
        ) from e

    signed = raw.get("signedURL") or raw.get("signedUrl")
    if not signed:
        raise HTTPException(
            status_code=502,
            detail="Storage did not return a signed URL",
        )
    if str(signed).startswith("/"):
        return f"{base}/storage/v1{signed}"
    return str(signed)


def _ordered(rows):
    return sorted(rows or [], key=lambda row: getattr(row, "position", 0) or 0)


def _assign_present(payload: dict[str, Any], key: str, value: Any) -> None:
    if value is None:
        return
    if isinstance(value, str) and not value.strip():
        return
    payload[key] = value


def _string_values(rows, attr: str) -> list[str]:
    out: list[str] = []
    for row in _ordered(rows):
        value = getattr(row, attr, None)
        if isinstance(value, str) and value.strip():
            out.append(value)
    return out


def _education_json(rows) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in _ordered(rows):
        item: dict[str, Any] = {}
        _assign_present(item, "school", getattr(row, "school", None))
        _assign_present(
            item,
            "normalized_school",
            getattr(row, "normalized_school", None),
        )
        _assign_present(item, "degree", getattr(row, "degree", None))
        _assign_present(item, "major", getattr(row, "major", None))
        _assign_present(item, "start_year", getattr(row, "start_year", None))
        _assign_present(item, "end_year", getattr(row, "end_year", None))
        _assign_present(item, "is_current", getattr(row, "is_current", None))
        _assign_present(item, "confidence", getattr(row, "confidence", None))
        if item:
            out.append(item)
    return out


def _experience_json(rows) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in _ordered(rows):
        item: dict[str, Any] = {}
        _assign_present(item, "title", getattr(row, "title", None))
        _assign_present(item, "company", getattr(row, "company", None))
        _assign_present(item, "location", getattr(row, "location", None))
        _assign_present(item, "start_date", getattr(row, "start_date", None))
        _assign_present(item, "end_date", getattr(row, "end_date", None))
        _assign_present(item, "is_current", getattr(row, "is_current", None))
        _assign_present(item, "description", getattr(row, "description", None))
        highlights = _string_values(getattr(row, "highlights", []), "text")
        skills = _string_values(getattr(row, "skills", []), "name")
        if highlights:
            item["highlights"] = highlights
        if skills:
            item["skills"] = skills
        _assign_present(item, "confidence", getattr(row, "confidence", None))
        if item:
            out.append(item)
    return out


def _project_json(rows) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in _ordered(rows):
        item: dict[str, Any] = {}
        _assign_present(item, "name", getattr(row, "name", None))
        _assign_present(item, "description", getattr(row, "description", None))
        _assign_present(item, "start_date", getattr(row, "start_date", None))
        _assign_present(item, "end_date", getattr(row, "end_date", None))
        skills = _string_values(getattr(row, "skills", []), "name")
        links = _string_values(getattr(row, "links", []), "url")
        if skills:
            item["skills"] = skills
        if links:
            item["links"] = links
        _assign_present(item, "confidence", getattr(row, "confidence", None))
        if item:
            out.append(item)
    return out


def _profile_json(profile: ResumeProfile) -> dict[str, Any]:
    return {
        "parse_status": profile.parse_status,
        "parse_error": getattr(profile, "parse_error", None),
        "primary_school_name": profile.primary_school_name,
        "primary_school_normalized": profile.primary_school_normalized,
        "primary_major": profile.primary_major,
        "grad_year": profile.grad_year,
        "skills": _string_values(getattr(profile, "skills", []), "name"),
        "education": _education_json(getattr(profile, "education", [])),
        "experience": _experience_json(getattr(profile, "experience", [])),
        "projects": _project_json(getattr(profile, "projects", [])),
        "links": _string_values(getattr(profile, "links", []), "url"),
        "user_confirmed_at": (
            profile.user_confirmed_at.isoformat()
            if getattr(profile, "user_confirmed_at", None)
            else None
        ),
    }


def _row_json(r: UserResume) -> dict[str, Any]:
    payload = {
        "id": str(r.id),
        "owner_id": str(r.owner_id),
        "resume_storage_path": r.resume_storage_path,
        "display_name": r.display_name,
        "file_type": r.file_type,
        "byte_size": r.byte_size,
        "focus": r.focus,
        "used_in_campaigns": r.used_in_campaigns,
        "is_default": r.is_default,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
    profile = getattr(r, "profile", None)
    if profile is not None:
        payload["profile"] = _profile_json(profile)
    return payload


def _resume_profile_load_options():
    profile_load = selectinload(UserResume.profile)
    return (
        profile_load.selectinload(ResumeProfile.skills),
        profile_load.selectinload(ResumeProfile.education),
        profile_load.selectinload(ResumeProfile.experience).selectinload(
            ResumeProfileExperience.highlights
        ),
        profile_load.selectinload(ResumeProfile.experience).selectinload(
            ResumeProfileExperience.skills
        ),
        profile_load.selectinload(ResumeProfile.projects).selectinload(
            ResumeProfileProject.skills
        ),
        profile_load.selectinload(ResumeProfile.projects).selectinload(
            ResumeProfileProject.links
        ),
        profile_load.selectinload(ResumeProfile.links),
    )


def _pending_resume_profile_row(resume_id: uuid.UUID) -> ResumeProfile:
    return ResumeProfile(
        resume_id=resume_id,
        raw_text=None,
        raw_text_hash=None,
        parse_status="pending",
        parser_version=PARSER_VERSION,
        skills=[],
        education=[],
        experience=[],
        projects=[],
        links=[],
    )


def _record_text(record: dict[str, Any], key: str) -> str | None:
    value = record.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _record_int(record: dict[str, Any], key: str) -> int | None:
    value = record.get(key)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _record_float(record: dict[str, Any], key: str) -> float | None:
    value = record.get(key)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _record_bool(record: dict[str, Any], key: str) -> bool | None:
    value = record.get(key)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        clean = value.strip().lower()
        if clean in {"true", "1", "yes"}:
            return True
        if clean in {"false", "0", "no"}:
            return False
    return None


def _record_string_list(record: dict[str, Any], key: str) -> list[str]:
    value = record.get(key)
    if isinstance(value, list):
        return _clean_string_list([str(part) for part in value])
    if isinstance(value, str):
        return _clean_string_list([value])
    return []


def _skill_rows(values: list[str]) -> list[ResumeProfileSkill]:
    return [
        ResumeProfileSkill(position=position, name=value)
        for position, value in enumerate(_clean_string_list(values))
    ]


def _link_rows(values: list[str]) -> list[ResumeProfileLink]:
    return [
        ResumeProfileLink(position=position, url=value)
        for position, value in enumerate(_clean_string_list(values))
    ]


def _education_rows(values: list[dict[str, Any]]) -> list[ResumeProfileEducation]:
    rows: list[ResumeProfileEducation] = []
    for position, record in enumerate(_clean_dict_list(values)):
        school = _record_text(record, "school")
        normalized_school = _record_text(record, "normalized_school")
        if school and not normalized_school:
            normalized_school = normalize_school_name(school)
        rows.append(
            ResumeProfileEducation(
                position=position,
                school=school,
                normalized_school=normalized_school,
                degree=_record_text(record, "degree"),
                major=_record_text(record, "major"),
                start_year=_record_int(record, "start_year"),
                end_year=_record_int(record, "end_year"),
                is_current=_record_bool(record, "is_current"),
                confidence=_record_float(record, "confidence"),
            )
        )
    return rows


def _experience_rows(values: list[dict[str, Any]]) -> list[ResumeProfileExperience]:
    rows: list[ResumeProfileExperience] = []
    for position, record in enumerate(_clean_dict_list(values)):
        rows.append(
            ResumeProfileExperience(
                position=position,
                title=_record_text(record, "title"),
                company=_record_text(record, "company"),
                location=_record_text(record, "location"),
                start_date=_record_text(record, "start_date"),
                end_date=_record_text(record, "end_date"),
                is_current=_record_bool(record, "is_current"),
                description=_record_text(record, "description"),
                confidence=_record_float(record, "confidence"),
                highlights=[
                    ResumeProfileExperienceHighlight(position=index, text=value)
                    for index, value in enumerate(
                        _record_string_list(record, "highlights")
                    )
                ],
                skills=[
                    ResumeProfileExperienceSkill(position=index, name=value)
                    for index, value in enumerate(
                        _record_string_list(record, "skills")
                    )
                ],
            )
        )
    return rows


def _project_rows(values: list[dict[str, Any]]) -> list[ResumeProfileProject]:
    rows: list[ResumeProfileProject] = []
    for position, record in enumerate(_clean_dict_list(values)):
        rows.append(
            ResumeProfileProject(
                position=position,
                name=_record_text(record, "name"),
                description=_record_text(record, "description"),
                start_date=_record_text(record, "start_date"),
                end_date=_record_text(record, "end_date"),
                confidence=_record_float(record, "confidence"),
                skills=[
                    ResumeProfileProjectSkill(position=index, name=value)
                    for index, value in enumerate(
                        _record_string_list(record, "skills")
                    )
                ],
                links=[
                    ResumeProfileProjectLink(position=index, url=value)
                    for index, value in enumerate(_record_string_list(record, "links"))
                ],
            )
        )
    return rows


def _apply_parsed_resume_profile(
    profile: ResumeProfile,
    parsed,
) -> None:
    if parsed.parse_status == "failed":
        logger.warning("Resume profile parsing failed for resume %s", profile.resume_id)
    profile.raw_text = parsed.raw_text
    profile.raw_text_hash = parsed.raw_text_hash
    profile.parse_status = parsed.parse_status
    profile.parser_version = parsed.parser_version
    profile.parse_error = parsed.parse_error
    profile.primary_school_name = parsed.primary_school_name
    profile.primary_school_normalized = parsed.primary_school_normalized
    profile.primary_major = parsed.primary_major
    profile.grad_year = parsed.grad_year
    profile.skills = _skill_rows(parsed.skills)
    profile.education = _education_rows(parsed.education)
    profile.experience = _experience_rows(parsed.experience)
    profile.projects = _project_rows(parsed.projects)
    profile.links = _link_rows(parsed.links)
    profile.parsed_at = datetime.now(timezone.utc)


def _reset_resume_profile_for_retry(profile: ResumeProfile) -> None:
    profile.raw_text = None
    profile.raw_text_hash = None
    profile.parse_status = "pending"
    profile.parser_version = PARSER_VERSION
    profile.parse_error = None
    profile.primary_school_name = None
    profile.primary_school_normalized = None
    profile.primary_major = None
    profile.grad_year = None
    profile.skills = []
    profile.education = []
    profile.experience = []
    profile.projects = []
    profile.links = []
    profile.parsed_at = None


def _build_resume_profile_row(resume_id: uuid.UUID, data: bytes) -> ResumeProfile:
    parsed = parse_resume_pdf(data)
    profile = _pending_resume_profile_row(resume_id)
    _apply_parsed_resume_profile(profile, parsed)
    return profile


def _parse_resume_profile_background(resume_id: uuid.UUID, data: bytes) -> None:
    parsed = parse_resume_pdf(data)
    try:
        factory = _session_factory()
    except RuntimeError as e:
        logger.warning("Resume profile parse not saved (database): %s", e)
        return

    session = factory()
    try:
        profile = session.get(ResumeProfile, resume_id)
        if profile is None:
            logger.warning(
                "Resume profile parse skipped; resume profile %s was not found",
                resume_id,
            )
            return
        if getattr(profile, "user_confirmed_at", None):
            logger.info(
                "Resume profile parse skipped; resume profile %s is already confirmed",
                resume_id,
            )
            return
        _apply_parsed_resume_profile(profile, parsed)
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to save parsed resume profile for resume %s", resume_id)
    finally:
        session.close()


@router.get("/user-resumes")
def list_user_resumes(
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    rows = (
        session.execute(
            select(UserResume)
            .options(*_resume_profile_load_options())
            .where(UserResume.owner_id == uid)
            .order_by(UserResume.updated_at.desc())
        )
        .scalars()
        .all()
    )
    return {"rows": [_row_json(r) for r in rows]}


@router.post("/user-resumes")
async def upload_user_resume(
    request: Request,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF file required")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    uid = user["id"]
    rid = str(uuid.uuid4())
    object_path = f"{uid}/{rid}.pdf"
    access_token = request.state.supabase_access_token

    storage_upload_object(access_token, object_path, data)

    display_name = (
        file.filename.rsplit(".", 1)[0] if "." in file.filename else file.filename
    )
    row = UserResume(
        id=uuid.UUID(rid),
        owner_id=uuid.UUID(uid),
        resume_storage_path=object_path,
        display_name=display_name,
        file_type="PDF",
        byte_size=len(data),
        focus="Unassigned",
        used_in_campaigns=0,
        is_default=False,
        status="Ready",
    )
    row.profile = _pending_resume_profile_row(row.id)
    session.add(row)
    try:
        session.commit()
        session.refresh(row)
    except Exception:
        session.rollback()
        storage_remove_object(access_token, object_path)
        raise

    background_tasks.add_task(_parse_resume_profile_background, row.id, data)
    return {"row": _row_json(row)}


class SetDefaultBody(BaseModel):
    resume_id: str = Field(..., min_length=1)


@router.post("/user-resumes/set-default")
def set_default_resume(
    body: SetDefaultBody,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    rid = uuid.UUID(body.resume_id)
    found = session.execute(
        select(UserResume).where(UserResume.id == rid, UserResume.owner_id == uid)
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=404, detail="Resume not found")

    session.execute(
        update(UserResume).where(UserResume.owner_id == uid).values(is_default=False)
    )
    found.is_default = True
    session.commit()
    return {"ok": True}


class PatchResumeBody(BaseModel):
    focus: str | None = Field(None, max_length=200)
    profile: "ProfilePatchBody | None" = None


class ProfilePatchBody(BaseModel):
    primary_school_name: str | None = Field(None, max_length=300)
    primary_major: str | None = Field(None, max_length=300)
    grad_year: int | None = Field(None, ge=1900, le=2200)
    skills: list[str] = Field(default_factory=list, max_length=100)
    education: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    experience: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    projects: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    links: list[str] = Field(default_factory=list, max_length=50)


def _clean_text(value: str | None) -> str | None:
    clean = (value or "").strip()
    return clean or None


def _clean_string_list(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = value.strip()
        key = clean.lower()
        if not clean or key in seen:
            continue
        seen.add(key)
        out.append(clean)
    return out


def _clean_dict_list(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for value in values:
        clean: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                continue
            key_clean = key.strip()
            if not key_clean:
                continue
            if isinstance(item, str):
                item_clean = item.strip()
                if item_clean:
                    clean[key_clean] = item_clean
            elif isinstance(item, list):
                strings = [part for part in item if isinstance(part, str)]
                clean_list = _clean_string_list(strings)
                if clean_list:
                    clean[key_clean] = clean_list
            elif item is not None:
                clean[key_clean] = item
        if clean:
            out.append(clean)
    return out


def _apply_profile_patch(
    profile: ResumeProfile,
    body: ProfilePatchBody,
    *,
    confirmed_at: datetime | None = None,
) -> None:
    school = _clean_text(body.primary_school_name)
    profile.parse_status = "ready"
    profile.parse_error = None
    profile.primary_school_name = school
    profile.primary_school_normalized = (
        normalize_school_name(school) if school else None
    )
    profile.primary_major = _clean_text(body.primary_major)
    profile.grad_year = body.grad_year
    profile.skills = _skill_rows(body.skills)
    profile.education = _education_rows(body.education)
    profile.experience = _experience_rows(body.experience)
    profile.projects = _project_rows(body.projects)
    profile.links = _link_rows(body.links)
    profile.user_confirmed_at = confirmed_at or datetime.now(timezone.utc)


@router.patch("/user-resumes/{resume_id}")
def patch_user_resume(
    resume_id: uuid.UUID,
    body: PatchResumeBody,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    row = session.execute(
        select(UserResume)
        .options(*_resume_profile_load_options())
        .where(UserResume.id == resume_id, UserResume.owner_id == uid)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    if body.focus is not None:
        focus = body.focus.strip()
        if not focus:
            focus = "Unassigned"
        row.focus = focus
    if body.profile is not None:
        if row.profile is None:
            row.profile = ResumeProfile(
                resume_id=row.id,
                raw_text=None,
                raw_text_hash=None,
                parse_status="ready",
                parser_version=PARSER_VERSION,
                skills=[],
                education=[],
                experience=[],
                projects=[],
                links=[],
            )
        _apply_profile_patch(row.profile, body.profile)
    session.commit()
    session.refresh(row)
    return {"row": _row_json(row)}


@router.post("/user-resumes/{resume_id}/profile/retry")
def retry_user_resume_profile_parse(
    resume_id: uuid.UUID,
    request: Request,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
):
    uid = uuid.UUID(user["id"])
    row = session.execute(
        select(UserResume)
        .options(*_resume_profile_load_options())
        .where(UserResume.id == resume_id, UserResume.owner_id == uid)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    if row.profile is None:
        row.profile = _pending_resume_profile_row(row.id)
    if getattr(row.profile, "user_confirmed_at", None):
        raise HTTPException(status_code=409, detail="Profile already confirmed")

    access_token = request.state.supabase_access_token
    data = storage_download_object(access_token, row.resume_storage_path)
    _reset_resume_profile_for_retry(row.profile)
    session.commit()
    session.refresh(row)

    background_tasks.add_task(_parse_resume_profile_background, row.id, data)
    return {"row": _row_json(row)}


@router.delete("/user-resumes/{resume_id}")
def delete_user_resume(
    resume_id: uuid.UUID,
    request: Request,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    row = session.execute(
        select(UserResume).where(UserResume.id == resume_id, UserResume.owner_id == uid)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    path = row.resume_storage_path
    session.delete(row)
    session.commit()
    access_token = request.state.supabase_access_token
    storage_remove_object(access_token, path)
    return {"ok": True}


class SignedUrlBody(BaseModel):
    storage_path: str = Field(..., min_length=1)


@router.post("/user-resumes/signed-url")
def post_signed_url(
    body: SignedUrlBody,
    user: Annotated[dict, Depends(require_supabase_user)],
    request: Request,
):
    uid = user["id"]
    path = body.storage_path.strip()
    if not path.startswith(f"{uid}/"):
        raise HTTPException(status_code=403, detail="Invalid storage path")
    access_token = request.state.supabase_access_token
    signed = storage_create_signed_url(access_token, path)
    return {"signed_url": signed}


@router.get("/user-resumes/{resume_id}/file")
def get_resume_pdf_file(
    resume_id: uuid.UUID,
    request: Request,
    user: Annotated[dict, Depends(require_supabase_user)],
    session: Annotated[Session, Depends(get_db_session)],
):
    uid = uuid.UUID(user["id"])
    row = session.execute(
        select(UserResume).where(UserResume.id == resume_id, UserResume.owner_id == uid)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    token = request.state.supabase_access_token
    data = storage_download_object(token, row.resume_storage_path)
    safe_name = (row.display_name or "resume").replace('"', "")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{safe_name}.pdf"',
            "Cache-Control": "private, max-age=0, no-store",
        },
    )
