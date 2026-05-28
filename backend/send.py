import argparse
import json
from email.message import EmailMessage
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen
from config import load_dotenv, serpapi_api_key
from utils import _letters, _first_from_email, domain_for_company

PLACEHOLDER = "__FIRST_NAME__"
TO = []  # (optional) insert specific recruiter emails here


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


def _ingest_search_items(items: list[dict], domain: str) -> list[tuple[str, str]]:
    out, seen = [], set()
    for it in items:
        title = (it.get("title") or "").replace("–", "-")
        snippet = it.get("snippet") or it.get("description") or ""
        link = (it.get("link") or it.get("url") or "").lower()
        text = f"{title} {snippet}".lower()
        linked_in = "linkedin.com/in" in link or "linkedin" in title.lower()
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
        out.append((addr, first[:1].upper() + first[1:].lower()))
    return out


def _discover_serpapi(q: str, domain: str, api_key: str) -> list[tuple[str, str]]:
    combined: list[tuple[str, str]] = []
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
    deduped: list[tuple[str, str]] = []
    for e, n in combined:
        if e in seen:
            continue
        seen.add(e)
        deduped.append((e, n))
    return deduped


def test_recipients() -> list[tuple[str, str]]:
    """Fixed address for end-to-end send checks (no SerpAPI, no domain mapping)."""
    return [("geoffrey.lee@test.com", "Casey"), ("electricochy1@gmail.com", "electricochy"), ("lgeoff31@gmail.com", "geoff")]


def discover(company: str) -> list[tuple[str, str]]:
    domain = domain_for_company(company)
    if domain is None:
        return []
    api_key = serpapi_api_key()
    domain = domain.lstrip("@").strip()
    q = f'"{company}" campus recruiter site:linkedin.com/in'
    return _discover_serpapi(q, domain, api_key)


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
