import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

GMAIL = "geoffrey31415@gmail.com"
# Each entry: email string, or (email, "First name") to override the guess.
TO = [
    "linh.nguyen@career.nvidia.com",
    "cori.cook@career.nvidia.com",
    "katherine.rettberg@career.nvidia.com",
    "rikki.nakashoji@career.nvidia.com",
    "lauren.salustro@career.nvidia.com",
    "sophia.vanegas@career.nvidia.com",
]

# In file `body`, put __FIRST_NAME__ where the greeting should go (see _first_name_from_email).
PLACEHOLDER = "__FIRST_NAME__"


def _first_name_from_email(addr: str) -> str:
    """Guess 'Linh' from 'linh.nguyen@nvidia.com' (first dot-separated part of local address)."""
    local = addr.split("@", 1)[0].strip()
    if not local:
        return "there"
    first = local.split(".", 1)[0].split("_", 1)[0]
    return first[:1].upper() + first[1:].lower() if first else "there"


def _normalize_recipients() -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for item in TO:
        if isinstance(item, tuple):
            email, name = item[0].strip(), item[1].strip()
            out.append((email, name))
        else:
            email = item.strip()
            out.append((email, _first_name_from_email(email)))
    return out


RESUME: Path | None = Path(__file__).resolve().parent / "resume.pdf"


def _app_password() -> str:
    f = Path(__file__).resolve().parent / ".mail_password"
    raw = f.read_text(encoding="utf-8")
    first = raw.strip().splitlines()[0] if raw.strip() else ""
    return "".join(first.split())


def _body() -> str:
    f = Path(__file__).resolve().parent / "body"
    return f.read_text(encoding="utf-8")


def send_email() -> None:
    password = _app_password()
    template = _body()

    for email, first_name in _normalize_recipients():
        body = template.replace(PLACEHOLDER, first_name)
        msg = EmailMessage()
        msg["Subject"] = "Placeholder"
        msg["From"] = GMAIL
        msg["To"] = email
        msg.set_content(body)

        if RESUME is not None and RESUME.is_file():
            data = RESUME.read_bytes()
            subtype = RESUME.suffix.lower().lstrip(".") or "octet-stream"
            if subtype == "pdf":
                main, sub = "application", "pdf"
            else:
                main, sub = "application", subtype
            msg.add_attachment(data, maintype=main,
                               subtype=sub, filename=RESUME.name)

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(GMAIL, password)
            smtp.send_message(msg)

    print("Sent.")


if __name__ == "__main__":
    send_email()
