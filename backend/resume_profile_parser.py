from __future__ import annotations

import hashlib
import io
import logging
import os
import re
import string
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

AI_PARSER_VERSION = "langchain-groq-strict-json-schema-v7"
PARSER_VERSION = AI_PARSER_VERSION
DEFAULT_AI_MODEL = "openai/gpt-oss-20b"
DEFAULT_AI_MAX_TOKENS = 4096
_ALLOWED_AI_MODELS = {
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
}

logger = logging.getLogger(__name__)

_LOCATION_SUFFIX_RE = re.compile(
    r"\s+[A-Z][A-Za-z .'-]+,\s+"
    r"(?:"
    r"Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|"
    r"Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|"
    r"Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|"
    r"Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|"
    r"New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|"
    r"Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|"
    r"Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|"
    r"Ontario|Quebec|British Columbia|Alberta|Manitoba|Saskatchewan|"
    r"Nova Scotia|New Brunswick|Newfoundland and Labrador|Prince Edward Island|"
    r"Northwest Territories|Yukon|Nunavut|"
    r"[A-Z]{2}"
    r")\s*$"
)
_WEB_LINK_RE = re.compile(r"^(?:https?://|www\.)", re.I)
_PARTIAL_CITY_PREFIXES = {
    "new",
    "san",
    "los",
    "las",
    "north",
    "south",
    "east",
    "west",
    "fort",
    "saint",
    "st",
}

_SCHOOL_KEYWORDS = (
    "university",
    "college",
    "institute",
    "polytechnic",
    "school of",
)


@dataclass(frozen=True)
class ParsedResumeProfile:
    raw_text: str
    raw_text_hash: str
    parse_status: str
    parser_version: str = AI_PARSER_VERSION
    primary_school_name: str | None = None
    primary_school_normalized: str | None = None
    primary_major: str | None = None
    grad_year: int | None = None
    skills: list[str] = field(default_factory=list)
    education: list[dict[str, Any]] = field(default_factory=list)
    experience: list[dict[str, Any]] = field(default_factory=list)
    projects: list[dict[str, Any]] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    parse_error: str | None = None


class _StrictResumeModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AiEducationItem(_StrictResumeModel):
    school: str | None = Field(
        default=None,
        description="Clean school name supported by the resume text."
    )
    degree: str | None = Field(
        default=None,
        description="Clean degree, diploma, certificate, or program supported by the resume text.",
    )
    major: str | None = Field(
        default=None,
        description="Clean major, concentration, or field of study supported by the resume text.",
    )
    start_year: int | None = Field(
        default=None,
        description="Four-digit start year when present.",
    )
    end_year: int | None = Field(
        default=None,
        description="Four-digit graduation or end year when present."
    )
    is_current: bool | None = Field(
        default=None,
        description="True when this appears to be the current or expected school."
    )
    confidence: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description="Confidence score from 0 to 1 for this education item.",
    )


class AiExperienceItem(_StrictResumeModel):
    @model_validator(mode="before")
    @classmethod
    def _accept_legacy_technologies(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        clean = dict(data)
        technologies = clean.pop("technologies", None)
        if "skills" not in clean and technologies is not None:
            clean["skills"] = technologies
        return clean

    title: str | None = Field(default=None, description="Clean role or job title supported by the resume text.")
    company: str | None = Field(default=None, description="Clean company or organization name supported by the resume text.")
    location: str | None = Field(default=None, description="Clean location supported by the resume text.")
    start_date: str | None = Field(
        default=None,
        description="Clean start date for this role, splitting date ranges when present."
    )
    end_date: str | None = Field(
        default=None,
        description="Clean end date for this role, splitting date ranges when present."
    )
    is_current: bool | None = Field(default=None, description="True if this role is current.")
    description: str | None = Field(
        default=None,
        description="Clean concise description supported by the resume text for the role. Use null when unsupported.",
    )
    skills: list[str] = Field(
        default_factory=list,
        description=(
            "Clean skills, tools, frameworks, and languages supported by this role in the resume text."
        ),
    )
    confidence: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description="Confidence score from 0 to 1 for this experience item.",
    )


class AiProjectItem(_StrictResumeModel):
    @model_validator(mode="before")
    @classmethod
    def _accept_legacy_technologies(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        clean = dict(data)
        technologies = clean.pop("technologies", None)
        if "skills" not in clean and technologies is not None:
            clean["skills"] = technologies
        return clean

    name: str | None = Field(default=None, description="Clean project name supported by the resume text; remove PDF icon alt text and tech-stack separators.")
    description: str | None = Field(
        default=None,
        description="Clean concise description supported by the resume text for the project. Use null when unsupported.",
    )
    skills: list[str] = Field(
        default_factory=list,
        description=(
            "Clean skills, tools, frameworks, and languages supported by this project in the resume text."
        ),
    )
    links: list[str] = Field(
        default_factory=list,
        description="Project links supported by the resume text when present.",
    )
    start_date: str | None = Field(
        default=None,
        description="Clean project start date supported by the resume text, splitting date ranges when present.",
    )
    end_date: str | None = Field(
        default=None,
        description="Clean project end date supported by the resume text, splitting date ranges when present.",
    )
    confidence: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description="Confidence score from 0 to 1 for this project item.",
    )


class AiResumeProfile(_StrictResumeModel):
    primary_school_name: str | None = Field(
        default=None,
        description="Best current or most relevant school supported by the resume text for recruiter matching."
    )
    primary_major: str | None = Field(
        default=None,
        description="Best current or most relevant major/field of study supported by the resume text."
    )
    grad_year: int | None = Field(
        default=None,
        description="Best graduation year for the primary school when present."
    )
    skills: list[str] = Field(
        default_factory=list,
        description="Deduplicated clean skills, tools, frameworks, and languages supported by the resume text.",
    )
    education: list[AiEducationItem] = Field(
        default_factory=list,
        description="All education entries found in the resume."
    )
    experience: list[AiExperienceItem] = Field(
        default_factory=list,
        description="All work, internship, research, or volunteer experience entries."
    )
    projects: list[AiProjectItem] = Field(
        default_factory=list,
        description="All project entries found in the resume."
    )
    links: list[str] = Field(
        default_factory=list,
        description="Portfolio, GitHub, LinkedIn, and other URLs supported by the resume text.",
    )


def extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = [_extract_page_text(page) for page in reader.pages]
    text = "\n\n".join(page for page in pages if page).strip()
    links = _extract_pdf_annotation_links(reader)
    if links:
        link_text = "\n".join(links)
        text = f"{text}\n\nLinks\n{link_text}" if text else f"Links\n{link_text}"
    return text.strip()


def _extract_page_text(page: Any) -> str:
    try:
        return (page.extract_text(extraction_mode="layout") or "").strip()
    except TypeError:
        return (page.extract_text() or "").strip()


def _extract_pdf_annotation_links(reader: Any) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    for page in reader.pages:
        for annot_ref in page.get("/Annots") or []:
            annot = annot_ref.get_object()
            action = annot.get("/A") or {}
            if hasattr(action, "get_object"):
                action = action.get_object()
            uri = action.get("/URI") if hasattr(action, "get") else None
            if not uri:
                continue
            clean = str(uri).strip()
            if not _is_web_link(clean) or clean in seen:
                continue
            seen.add(clean)
            links.append(clean)
    return links


def raw_text_hash(raw_text: str) -> str:
    return hashlib.sha256(raw_text.encode("utf-8")).hexdigest()


def normalize_school_name(value: str) -> str:
    cleaned = value.lower().translate(str.maketrans("", "", string.punctuation))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _clean_school_display_name(value: str) -> str:
    clean = re.sub(r"\s+", " ", value).strip()
    match = _LOCATION_SUFFIX_RE.search(clean)
    if not match:
        return clean
    before_region = clean[: clean.rfind(",")].strip()
    words = before_region.split()
    max_city_words = min(3, len(words) - 1)
    for city_word_count in range(1, max_city_words + 1):
        candidate_words = words[:-city_word_count]
        if not candidate_words:
            continue
        trailing_word = candidate_words[-1].strip(".,").lower()
        if trailing_word in _PARTIAL_CITY_PREFIXES:
            continue
        candidate = " ".join(candidate_words).strip(" ,")
        if any(keyword in candidate.lower() for keyword in _SCHOOL_KEYWORDS):
            return candidate
    return clean


def parse_resume_pdf(data: bytes) -> ParsedResumeProfile:
    try:
        raw_text = extract_pdf_text(data)
    except Exception as e:
        return _failed_profile("", e)
    return parse_resume_text(raw_text)


def parse_resume_text(raw_text: str) -> ParsedResumeProfile:
    clean_text = raw_text.strip()
    if not _ai_resume_parsing_enabled():
        return _failed_profile(clean_text, "AI resume parsing is not configured.")
    try:
        ai_profile = _parse_resume_text_with_langchain_groq(clean_text)
        return _profile_from_ai_schema(clean_text, ai_profile)
    except Exception as e:
        logger.warning("AI resume parsing failed: %s", e)
        return _failed_profile(clean_text, e)


def _failed_profile(raw_text: str, error: Any) -> ParsedResumeProfile:
    clean_text = raw_text.strip()
    return ParsedResumeProfile(
        raw_text=clean_text,
        raw_text_hash=raw_text_hash(clean_text),
        parse_status="failed",
        parser_version=AI_PARSER_VERSION,
        parse_error=str(error)[:500],
    )


def _ai_resume_parsing_enabled() -> bool:
    enabled = os.environ.get("RESUME_PROFILE_AI_ENABLED", "true").strip().lower()
    if enabled in {"0", "false", "off", "no"}:
        return False
    return bool(os.environ.get("GROQ_API_KEY", "").strip())


def _parse_resume_text_with_langchain_groq(raw_text: str) -> AiResumeProfile:
    from langchain_groq import ChatGroq

    model = _resume_ai_model()
    timeout_raw = os.environ.get("RESUME_PROFILE_AI_TIMEOUT_SECONDS", "45").strip()
    try:
        timeout = float(timeout_raw)
    except ValueError:
        timeout = 45.0

    llm = ChatGroq(
        model=model or DEFAULT_AI_MODEL,
        temperature=0,
        timeout=timeout,
        max_retries=1,
        max_tokens=_resume_ai_max_tokens(),
    )
    structured_llm = llm.with_structured_output(
        _ai_resume_profile_strict_schema(),
        method="json_schema",
        strict=True,
    )
    try:
        result = structured_llm.invoke(_resume_profile_ai_messages(raw_text))
    except Exception as e:
        if not _is_resume_ai_generation_error(e):
            raise
        logger.warning(
            "AI resume parsing schema generation failed; retrying once: %s",
            e,
        )
        result = structured_llm.invoke(
            _resume_profile_ai_messages(raw_text, retry=True)
        )
    if isinstance(result, AiResumeProfile):
        return result
    return AiResumeProfile.model_validate(result)


def _resume_profile_ai_messages(
    raw_text: str,
    *,
    retry: bool = False,
) -> list[tuple[str, str]]:
    system_message = (
        "Extract a resume profile from the complete resume text. "
        "Use only facts present in the text. Prefer the current or expected "
        "school as primary_school_name when multiple schools appear. Every "
        "object must include every key from the schema. Never omit keys. "
        "Use null for unknown scalar fields. Use empty lists for absent repeated "
        "fields. Extract clean semantic resume fields from messy PDF text. "
        "Use only information present in the resume. Clean PDF artifacts, icon alt text, "
        "layout separators, and broken whitespace. Split date ranges into start_date "
        "and end_date. Split project header lines into project name, skills, and links "
        "when obvious. Do not invent missing facts. "
    )
    if retry:
        system_message += (
            " Previous attempt failed because the generated JSON did not match "
            "the strict schema. Include every key on every object and use null "
            "or [] for unknown values. Keep fields clean and semantic."
        )
    return [
        ("system", system_message),
        (
            "human",
            "Complete resume text:\n\n"
            "<resume_text>\n"
            f"{raw_text}\n"
            "</resume_text>",
        ),
    ]


def _is_resume_ai_generation_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(
        marker in message
        for marker in (
            "generated json does not match",
            "failed_generation",
            "does not validate",
            "failed to parse tool call arguments as json",
            "tool_use_failed",
        )
    )


def _ai_resume_profile_strict_schema() -> dict[str, Any]:
    from langchain_core.utils.function_calling import convert_to_json_schema

    schema = convert_to_json_schema(AiResumeProfile, strict=True)
    _require_all_json_schema_object_properties(schema)
    return schema


def _require_all_json_schema_object_properties(node: Any) -> None:
    if isinstance(node, list):
        for item in node:
            _require_all_json_schema_object_properties(item)
        return
    if not isinstance(node, dict):
        return

    node.pop("default", None)
    properties = node.get("properties")
    if isinstance(properties, dict):
        node["required"] = list(properties)
        node["additionalProperties"] = False

    for value in node.values():
        _require_all_json_schema_object_properties(value)


def _resume_ai_model() -> str:
    configured = os.environ.get("RESUME_PROFILE_AI_MODEL", "").strip()
    if not configured:
        return DEFAULT_AI_MODEL
    if configured in _ALLOWED_AI_MODELS:
        return configured
    logger.warning(
        "RESUME_PROFILE_AI_MODEL=%s is not allowed for resume profile parsing; "
        "using %s",
        configured,
        DEFAULT_AI_MODEL,
    )
    return DEFAULT_AI_MODEL


def _resume_ai_max_tokens() -> int:
    configured = os.environ.get("RESUME_PROFILE_AI_MAX_TOKENS", "").strip()
    if not configured:
        return DEFAULT_AI_MAX_TOKENS
    try:
        max_tokens = int(configured)
    except ValueError:
        logger.warning(
            "RESUME_PROFILE_AI_MAX_TOKENS=%s is invalid; using %s",
            configured,
            DEFAULT_AI_MAX_TOKENS,
        )
        return DEFAULT_AI_MAX_TOKENS
    if max_tokens <= 0:
        logger.warning(
            "RESUME_PROFILE_AI_MAX_TOKENS=%s must be positive; using %s",
            configured,
            DEFAULT_AI_MAX_TOKENS,
        )
        return DEFAULT_AI_MAX_TOKENS
    return max_tokens


def _profile_from_ai_schema(
    raw_text: str,
    ai_profile: AiResumeProfile,
) -> ParsedResumeProfile:
    education = [
        _clean_ai_record(item.model_dump(mode="json"))
        for item in ai_profile.education
    ]
    education = [item for item in education if item]
    for item in education:
        school = _clean_optional_string(item.get("school"))
        if school:
            school = _clean_school_display_name(school)
            item["school"] = school
            item["normalized_school"] = normalize_school_name(school)

    experience = [
        item
        for item in (
            _clean_ai_record(entry.model_dump(mode="json"))
            for entry in ai_profile.experience
        )
        if item
    ]
    projects = [
        item
        for item in (
            _clean_ai_record(project.model_dump(mode="json"))
            for project in ai_profile.projects
        )
        if item
    ]

    primary_school = _clean_optional_string(ai_profile.primary_school_name)
    if primary_school:
        primary_school = _clean_school_display_name(primary_school)
    primary_major = _clean_optional_string(ai_profile.primary_major)
    grad_year = _clean_year(ai_profile.grad_year)

    profile_links: list[str] = []
    profile_links.extend(ai_profile.links)
    for project in projects:
        project_links = project.get("links")
        if isinstance(project_links, list):
            profile_links.extend(str(link) for link in project_links)

    return ParsedResumeProfile(
        raw_text=raw_text.strip(),
        raw_text_hash=raw_text_hash(raw_text.strip()),
        parse_status="ready",
        parser_version=AI_PARSER_VERSION,
        primary_school_name=primary_school,
        primary_school_normalized=(
            normalize_school_name(primary_school) if primary_school else None
        ),
        primary_major=primary_major,
        grad_year=grad_year,
        skills=_dedupe_strings(ai_profile.skills),
        education=education,
        experience=experience,
        projects=projects,
        links=_dedupe_links(profile_links),
    )


def _clean_ai_record(value: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, item in value.items():
        if item is None:
            continue
        if isinstance(item, str):
            text = item.strip()
            if text:
                clean[key] = text
            continue
        if isinstance(item, list):
            strings = [str(part) for part in item if str(part).strip()]
            deduped = _dedupe_strings(strings)
            if deduped:
                clean[key] = deduped
            continue
        if key.endswith("_year"):
            year = _clean_year(item)
            if year is not None:
                clean[key] = year
            continue
        clean[key] = item
    return clean




def _clean_optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_year(value: Any) -> int | None:
    if value is None:
        return None
    try:
        year = int(value)
    except (TypeError, ValueError):
        return None
    return year if 1900 <= year <= 2200 else None


def _dedupe_strings(values: list[str]) -> list[str]:
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


def _dedupe_links(values: list[str]) -> list[str]:
    return [value for value in _dedupe_strings(values) if _is_web_link(value)]


def _is_web_link(value: str) -> bool:
    return bool(_WEB_LINK_RE.match(value.strip()))
