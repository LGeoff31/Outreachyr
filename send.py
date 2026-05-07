import argparse
import json
import smtplib
from email.message import EmailMessage
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen
from config import gmail_credentials, load_dotenv, serpapi_api_key
from utils import _letters, _first_from_email, domain_for_company

PLACEHOLDER = "__FIRST_NAME__"
TO = []  # (optional) insert specific recruiter emails here


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
            raise SystemExit(f"SerpAPI HTTP {e.code}: {detail}") from e

        err = data.get("error")
        if err:
            raise SystemExit(f"SerpAPI: {err}")
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


def discover(company: str) -> list[tuple[str, str]]:
    domain = domain_for_company(company)
    if domain is None:
        print("COMPANY DOMAIN NOT FOUND")
        return
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


def send(people: list[tuple[str, str]], company: str | None) -> None:
    gmail, pw = gmail_credentials()
    body = (Path(__file__).resolve().parent /
            "body").read_text(encoding="utf-8")
    company_name = company[0].upper() + company[1:].lower() if company else ""

    for email, hi in people:
        msg = EmailMessage()
        msg["Subject"] = f"{company_name} Fall 2026 Co-op"
        msg["From"], msg["To"] = gmail, email
        msg.set_content(body.replace(PLACEHOLDER, hi))
        if RESUME.is_file():
            data = RESUME.read_bytes()
            msg.add_attachment(data, maintype="application",
                               subtype="pdf", filename=RESUME.name)
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
            s.login(gmail, pw)
            s.send_message(msg)
    print("Sent.")


def main() -> None:
    load_dotenv()
    p = argparse.ArgumentParser()
    p.add_argument("--company", help="Company name i.e Nvidia")
    p.add_argument("--dry-run", action="store_true",
                   help="Print addresses only, do not send")
    a = p.parse_args()

    if a.company:
        people = discover(a.company)
        if not people:
            raise SystemExit(
                "No addresses found. Try another company spelling or check API limits.")
    else:
        people = recipients()

    if a.dry_run:
        for e, n in people:
            print(f"{e}  ({n})")
        return  # DO NOT SEND EMAILS when dry run flag is set

    send(people, a.company.strip() if a.company else None)


if __name__ == "__main__":
    main()
