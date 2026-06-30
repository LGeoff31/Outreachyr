import argparse
import hashlib
import json
import random
from email.message import EmailMessage
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen
from config import load_dotenv, serpapi_api_key
from utils import _letters, _first_from_email, domain_for_company

PLACEHOLDER = "__FIRST_NAME__"
TO = []  # (optional) insert specific recruiter emails here
RecruiterCandidate = dict[str, str]
PREVIEW_RECRUITER_LIMIT = 5
_preview_discovery_cache: dict[str, list[RecruiterCandidate]] = {}


def clear_preview_discovery_cache() -> None:
    _preview_discovery_cache.clear()


def _preview_discovery_cache_key(
    company: str,
    *,
    school_name: str | None,
    school_normalized: str | None,
) -> str:
    company_key = company.strip().lower()
    school = (school_name or school_normalized or "").strip().lower()
    return f"{company_key}|{school}"


def _recruiter_preview_rank(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


def select_preview_recipients(
    candidates: list[RecruiterCandidate],
    *,
    limit: int = PREVIEW_RECRUITER_LIMIT,
) -> list[RecruiterCandidate]:
    """Pick a stable pseudo-random subset for preview (same emails => same picks)."""
    if limit <= 0 or len(candidates) <= limit:
        return list(candidates)
    ranked = sorted(candidates, key=lambda c: _recruiter_preview_rank(c["email"]))
    return ranked[:limit]


def shuffle_preview_order(
    candidates: list[RecruiterCandidate],
) -> list[RecruiterCandidate]:
    """Randomize display order while keeping the same people."""
    out = list(candidates)
    random.shuffle(out)
    return out


def apply_merge_fields(
    text: str,
    *,
    greeting_name: str,
    company: str | None,
) -> str:
    """Match dashboard placeholders: {{first_name}}, {{company}}, {{role}}, legacy __FIRST_NAME__."""
    name = (greeting_name or "").strip() or "there"
    company_display = (company or "").strip() or "the company"
    out = text
    out = out.replace("{{first_name}}", name)
    out = out.replace(PLACEHOLDER, name)
    out = out.replace("{{company}}", company_display)
    out = out.replace("{{role}}", "recruiting")
    return out


def _validated_linkedin_profile_url(raw_url: str) -> str | None:
    url = raw_url.strip()
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if host != "linkedin.com" and not host.endswith(".linkedin.com"):
        return None
    if not parsed.path.lower().startswith("/in/"):
        return None
    return url


def _ingest_search_items(items: list[dict], domain: str) -> list[RecruiterCandidate]:
    out, seen = [], set()
    for it in items:
        title = (it.get("title") or "").replace("–", "-")
        snippet = it.get("snippet") or it.get("description") or ""
        raw_link = str(it.get("link") or it.get("url") or "").strip()
        linkedin_url = _validated_linkedin_profile_url(raw_link)
        text = f"{title} {snippet}".lower()
        linked_in = linkedin_url is not None or "linkedin" in title.lower()
        if not linked_in or "recruit" not in text:
            continue
        head = title.split("|", 1)[0].strip().split(" - ", 1)[0].strip()
        parts = head.split()
        if len(parts) < 2:
            continue
        first, last = parts[0], parts[-1]
        lf, ll = _letters(first), _letters(last)
        if len(lf) < 2 or len(ll) < 2:  # If it's J.Cole, obviously not full name so ignore
            continue
        addr = f"{lf}.{ll}@{domain}"  # <-- POTENTIALLY MODIFY
        if addr in seen:
            continue
        seen.add(addr)
        candidate = {
            "email": addr,
            "greeting_name": first[:1].upper() + first[1:].lower(),
        }
        if linkedin_url:
            candidate["linkedin_url"] = linkedin_url
        out.append(candidate)
    return out


def _is_serpapi_no_results_error(message: str) -> bool:
    lower = message.lower()
    return (
        "hasn't returned any results" in lower
        or "has not returned any results" in lower
    )


def _discover_serpapi(q: str, domain: str, api_key: str) -> list[RecruiterCandidate]:
    combined: list[RecruiterCandidate] = []
    for start in (0, 10):
        url = "https://serpapi.com/search.json?" + urlencode(
            {
                "engine": "google",
                "q": q,
                "api_key": api_key,
                "num": 10,
                "start": start,  # offset / paginatino
            }
        )
        try:
            with urlopen(url, timeout=45) as r:
                data = json.loads(r.read().decode())
        except HTTPError as e:
            try:
                detail = e.read().decode(errors="replace")
            except OSError:
                detail = str(e)
            raise RuntimeError(f"SerpAPI HTTP {e.code}: {detail}") from e

        err = data.get("error")
        if err:
            if _is_serpapi_no_results_error(str(err)):
                break
            raise RuntimeError(f"SerpAPI: {err}")
        organic = data.get("organic_results") or []
        if not organic:
            break
        items = [
            {
                "title": o.get("title"),
                "snippet": o.get("snippet"),
                "link": o.get("link"),
            }
            for o in organic
        ]
        combined.extend(_ingest_search_items(items, domain))

    seen: set[str] = set()
    deduped: list[RecruiterCandidate] = []
    for candidate in combined:
        email = candidate["email"].strip().lower()
        if email in seen:
            continue
        seen.add(email)
        candidate["email"] = email
        deduped.append(candidate)
    return deduped


def test_recipients() -> list[tuple[str, str]]:
    """Fixed address for end-to-end send checks (no SerpAPI, no domain mapping)."""
    return [("geoffrey.lee@test.com", "Casey"), ("electricochy1@gmail.com", "electricochy"), ("lgeoff31@gmail.com", "geoff"), ("geoffrey.lee@cloudkitchens.com", "geoff")]


def discover_candidates(
    company: str,
    *,
    school_name: str | None = None,
    school_normalized: str | None = None,
) -> list[RecruiterCandidate]:
    domain = domain_for_company(company)
    if domain is None:
        return []
    api_key = serpapi_api_key()
    domain = domain.lstrip("@").strip()
    combined: list[RecruiterCandidate] = []
    for q in _recruiter_search_queries(
        company,
        school_name=school_name,
        school_normalized=school_normalized,
    ):
        try:
            combined.extend(_discover_serpapi(q, domain, api_key))
        except RuntimeError as exc:
            if not _is_serpapi_no_results_error(str(exc)):
                raise

    seen: set[str] = set()
    deduped: list[RecruiterCandidate] = []
    for candidate in combined:
        key = candidate["email"].lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def discover_preview_candidates(
    company: str,
    *,
    school_name: str | None = None,
    school_normalized: str | None = None,
) -> list[RecruiterCandidate]:
    """Cached preview fetch: first call hits SerpAPI, repeats reuse the same five."""
    key = _preview_discovery_cache_key(
        company,
        school_name=school_name,
        school_normalized=school_normalized,
    )
    cached = _preview_discovery_cache.get(key)
    if cached is not None:
        return shuffle_preview_order(select_preview_recipients(cached))

    full = discover_candidates(
        company,
        school_name=school_name,
        school_normalized=school_normalized,
    )
    _preview_discovery_cache[key] = full
    return shuffle_preview_order(select_preview_recipients(full))


def discover(
    company: str,
    *,
    school_name: str | None = None,
    school_normalized: str | None = None,
) -> list[tuple[str, str]]:
    return [
        (candidate["email"], candidate.get("greeting_name", ""))
        for candidate in discover_candidates(
            company,
            school_name=school_name,
            school_normalized=school_normalized,
        )
    ]


def _recruiter_search_queries(
    company: str,
    *,
    school_name: str | None = None,
    school_normalized: str | None = None,
) -> list[str]:
    company_clean = company.strip()
    school = (school_name or school_normalized or "").strip()
    queries: list[str] = []
    if school:
        queries.append(f'"{company_clean}" "{school}" recruiter site:linkedin.com/in')
    queries.extend(
        [
            f'"{company_clean}" campus recruiter site:linkedin.com/in',
            f'"{company_clean}" university recruiter site:linkedin.com/in',
        ]
    )
    out: list[str] = []
    seen: set[str] = set()
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        out.append(q)
    return out


def recipients() -> list[tuple[str, str]]:
    out = []
    for x in TO:
        if isinstance(x, tuple):
            out.append((x[0].strip(), x[1].strip()))
        else:
            e = x.strip()
            out.append((e, _first_from_email(e)))
    return out


RESUME = Path(__file__).resolve().parent / "resume.pdf"


def build_outreach_messages(
    people: list[tuple[str, str]],
    company: str | None,
    *,
    sender_email: str,
    subject: str | None = None,
    body_text: str | None = None,
    resume_bytes: bytes | None = None,
    resume_filename: str = "resume.pdf",
) -> list[EmailMessage]:
    root = Path(__file__).resolve().parent

    if body_text is None:
        body_text = (root / "body").read_text(encoding="utf-8")

    if subject and subject.strip():
        subject_template = subject.strip()
    else:
        c = (company or "").strip()
        if c:
            name = (
                c[0].upper() + c[1:].lower()
                if len(c) > 1 else c.upper()
            )
            subject_template = f"{name} Fall 2026 Co-op"
        else:
            subject_template = "Outreach"

    messages: list[EmailMessage] = []
    for email, hi in people:
        msg = EmailMessage()
        merged_subject = apply_merge_fields(
            subject_template, greeting_name=hi, company=company
        )
        merged_body = apply_merge_fields(
            body_text, greeting_name=hi, company=company
        )
        msg["Subject"] = merged_subject
        msg["From"], msg["To"] = sender_email, email
        msg.set_content(merged_body)

        if resume_bytes is not None:
            fn = resume_filename or "attachment.pdf"
            sub = Path(fn).suffix.lower().lstrip(".") or "pdf"
            if sub == "pdf":
                main, t = "application", "pdf"
            else:
                main, t = "application", sub
            msg.add_attachment(
                resume_bytes, maintype=main, subtype=t, filename=Path(fn).name
            )
        elif RESUME.is_file():
            data = RESUME.read_bytes()
            msg.add_attachment(
                data, maintype="application", subtype="pdf", filename=RESUME.name
            )
        messages.append(msg)
    return messages


def main() -> None:
    load_dotenv()
    p = argparse.ArgumentParser()
    p.add_argument("--company", help="Company name i.e Nvidia")
    p.add_argument("--dry-run", action="store_true",
                   help="Print addresses only, do not send")
    a = p.parse_args()

    if a.company:
        try:
            people = discover(a.company)
        except RuntimeError as e:
            raise SystemExit(str(e)) from e
        if not people:
            raise SystemExit(
                "No addresses found. Try another company spelling or check API limits.")
    else:
        people = recipients()

    if a.dry_run:
        for e, n in people:
            print(f"{e}  ({n})")
        return

    raise SystemExit(
        "Sending only works through the API after Sign in with Google. "
        "Run `uv run python app.py`, open the Next.js app, sign in, then send from the UI."
    )


if __name__ == "__main__":
    main()
