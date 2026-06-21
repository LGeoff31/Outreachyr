from __future__ import annotations

import hashlib
import io
import re
import string
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

PARSER_VERSION = "deterministic-v1"

_SECTION_ALIASES = {
    "education": "education",
    "experience": "experience",
    "work experience": "experience",
    "professional experience": "experience",
    "employment": "experience",
    "projects": "projects",
    "project experience": "projects",
    "technical projects": "projects",
    "skills": "skills",
    "technical skills": "skills",
    "technologies": "skills",
    "links": "links",
}

_SCHOOL_KEYWORDS = (
    "university",
    "college",
    "institute",
    "polytechnic",
    "school of",
)

_DEGREE_WORDS = (
    "bachelor",
    "master",
    "doctor",
    "phd",
    "b.sc",
    "bsc",
    "bs ",
    "b.a",
    "ba ",
    "basc",
    "degree",
    "computer science",
    "engineering",
)


@dataclass(frozen=True)
class ParsedResumeProfile:
    raw_text: str
    raw_text_hash: str
    parse_status: str
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


def extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n\n".join(page for page in pages if page).strip()


def raw_text_hash(raw_text: str) -> str:
    return hashlib.sha256(raw_text.encode("utf-8")).hexdigest()


def normalize_school_name(value: str) -> str:
    cleaned = value.lower().translate(str.maketrans("", "", string.punctuation))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def parse_resume_pdf(data: bytes) -> ParsedResumeProfile:
    try:
        raw_text = extract_pdf_text(data)
        return parse_resume_text(raw_text)
    except Exception as e:
        return ParsedResumeProfile(
            raw_text="",
            raw_text_hash=raw_text_hash(""),
            parse_status="failed",
            parse_error=str(e)[:500],
        )


def parse_resume_text(raw_text: str) -> ParsedResumeProfile:
    normalized_text = _normalize_lines(raw_text)
    sections = _split_sections(normalized_text)
    links = _extract_links(raw_text)
    education = _parse_education(sections.get("education", []))
    primary = _select_primary_education(education)
    skills = _parse_skills(sections.get("skills", []))
    experience = _parse_experience(sections.get("experience", []))
    projects = _parse_projects(sections.get("projects", []))

    return ParsedResumeProfile(
        raw_text=raw_text.strip(),
        raw_text_hash=raw_text_hash(raw_text.strip()),
        parse_status="ready",
        primary_school_name=primary.get("school") if primary else None,
        primary_school_normalized=(
            primary.get("normalized_school") if primary else None
        ),
        primary_major=primary.get("major") if primary else None,
        grad_year=primary.get("end_year") if primary else None,
        skills=skills,
        education=education,
        experience=experience,
        projects=projects,
        links=links,
    )


def _normalize_lines(raw_text: str) -> list[str]:
    lines = []
    for line in raw_text.replace("\r", "\n").split("\n"):
        without_bullets = line.replace("\u2022", " ")
        stripped = re.sub(r"\s+", " ", without_bullets).strip(" \t-*")
        if stripped:
            lines.append(stripped)
    return lines


def _split_sections(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {"other": []}
    current = "other"
    for line in lines:
        key = _SECTION_ALIASES.get(line.lower().strip(":"))
        if key:
            current = key
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return sections


def _extract_links(raw_text: str) -> list[str]:
    matches = re.findall(r"https?://[^\s,)]+|www\.[^\s,)]+", raw_text)
    out: list[str] = []
    seen: set[str] = set()
    for match in matches:
        clean = match.rstrip(".,;")
        if clean not in seen:
            seen.add(clean)
            out.append(clean)
    return out


def _parse_education(lines: list[str]) -> list[dict[str, Any]]:
    schools: list[tuple[int, str]] = []
    for idx, line in enumerate(lines):
        lower = line.lower()
        if any(keyword in lower for keyword in _SCHOOL_KEYWORDS):
            schools.append((idx, line))

    entries: list[dict[str, Any]] = []
    for position, (idx, school) in enumerate(schools):
        next_idx = schools[position + 1][0] if position + 1 < len(schools) else len(lines)
        block = lines[idx:next_idx]
        years = _years_from_text(" ".join(block))
        degree_line = next(
            (line for line in block[1:] if _looks_like_degree_line(line)),
            None,
        )
        major = _major_from_degree_line(degree_line)
        end_year = max(years) if years else None
        is_current = _is_current_education(" ".join(block), end_year)
        entries.append(
            {
                "school": school,
                "normalized_school": normalize_school_name(school),
                "degree": degree_line,
                "major": major,
                "start_year": min(years) if len(years) > 1 else None,
                "end_year": end_year,
                "is_current": is_current,
                "confidence": 0.85 if degree_line else 0.72,
            }
        )
    return entries


def _looks_like_degree_line(line: str) -> bool:
    lower = f" {line.lower()} "
    return any(word in lower for word in _DEGREE_WORDS)


def _major_from_degree_line(line: str | None) -> str | None:
    if not line:
        return None
    if "," in line:
        major = line.split(",", 1)[1].strip()
        return major or None
    match = re.search(r"\b(?:Bachelor|Master|Doctor)\s+of\s+(.+)$", line, re.I)
    if match:
        return match.group(1).strip()
    return None


def _years_from_text(text: str) -> list[int]:
    years = [int(match) for match in re.findall(r"\b(20\d{2}|19\d{2})\b", text)]
    return sorted(set(years))


def _is_current_education(text: str, end_year: int | None) -> bool:
    lower = text.lower()
    if any(word in lower for word in ("expected", "present", "current")):
        return True
    return end_year is not None and end_year >= datetime.now().year


def _select_primary_education(
    education: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not education:
        return None
    current = [entry for entry in education if entry.get("is_current")]
    candidates = current or education
    return max(
        candidates,
        key=lambda entry: (
            int(entry.get("end_year") or 0),
            education.index(entry),
        ),
    )


def _parse_skills(lines: list[str]) -> list[str]:
    raw = ", ".join(lines)
    parts = re.split(r"[,|;/\u2022]+", raw)
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        clean = part.strip()
        if not clean or clean.lower() in seen:
            continue
        seen.add(clean.lower())
        out.append(clean)
    return out


def _parse_experience(lines: list[str]) -> list[dict[str, Any]]:
    if not lines:
        return []
    first = lines[0]
    title, company = _split_title_company(first)
    return [
        {
            "title": title,
            "company": company,
            "description": " ".join(lines[1:]).strip() or None,
            "confidence": 0.72,
        }
    ]


def _parse_projects(lines: list[str]) -> list[dict[str, Any]]:
    if not lines:
        return []
    first = lines[0]
    name, tech_text = _split_name_detail(first)
    technologies = _parse_skills([tech_text]) if tech_text else []
    return [
        {
            "name": name,
            "description": " ".join(lines[1:]).strip() or None,
            "technologies": technologies,
            "confidence": 0.72,
        }
    ]


def _split_title_company(value: str) -> tuple[str, str | None]:
    if "," in value:
        title, company = value.split(",", 1)
        return title.strip(), company.strip() or None
    if " at " in value.lower():
        before, after = re.split(r"\s+at\s+", value, maxsplit=1, flags=re.I)
        return before.strip(), after.strip() or None
    return value.strip(), None


def _split_name_detail(value: str) -> tuple[str, str | None]:
    for sep in (" - ", " \u2013 ", " \u2014 "):
        if sep in value:
            name, detail = value.split(sep, 1)
            return name.strip(), detail.strip() or None
    return value.strip(), None
