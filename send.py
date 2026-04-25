import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

GMAIL = "geoffrey31415@gmail.com"
TO = ["lgeoff31@gmail.com"]

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
    body = _body()

    for email in TO:
        msg = EmailMessage()
        msg["Subject"] = "Hi friend"
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
