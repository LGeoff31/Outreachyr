import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

# config


def load_dotenv() -> None:
    """Load env vars from the repo-root `.env` file for direct backend commands."""
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent

    def ingest(env_file: Path) -> None:
        if not env_file.is_file():
            return
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip()
            if k and k not in os.environ:
                os.environ[k] = v

    ingest(repo_root / ".env")


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def normalize_postgres_url_for_psycopg(url: str) -> str:
    """SQLAlchemy defaults plain postgresql:// to psycopg2; this app uses psycopg3."""
    url = url.strip()
    if "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    if scheme in ("postgresql", "postgres") and "+psycopg" not in scheme:
        return f"postgresql+psycopg://{rest}"
    return url


def serpapi_api_key() -> str:
    return required_env("SERPAPI_API_KEY")


def supabase_url() -> str:
    return required_env("SUPABASE_URL")


def supabase_publishable_key() -> str:
    return required_env("SUPABASE_PUBLISHABLE_KEY")


def frontend_base_url() -> str:
    configured_url = os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_APP_URL")
    if configured_url:
        return configured_url.rstrip("/")
    return f"http://localhost:{required_env('FRONTEND_PORT')}"


def google_mail_client_id() -> str:
    return os.environ.get("GOOGLE_MAIL_CLIENT_ID", "").strip() or required_env(
        "GOOGLE_CLIENT_ID"
    )


def google_mail_client_secret() -> str:
    return os.environ.get("GOOGLE_MAIL_CLIENT_SECRET", "").strip() or required_env(
        "GOOGLE_CLIENT_SECRET"
    )


def google_mail_redirect_uri() -> str:
    return os.environ.get(
        "GOOGLE_MAIL_REDIRECT_URI",
        f"{frontend_base_url()}/api/mail-connections/google/callback",
    )


def mailbox_credential_keys() -> str:
    return required_env("MAILBOX_CREDENTIAL_KEYS")


@dataclass(frozen=True)
class MicrosoftMailConfig:
    client_id: str
    client_secret: str
    redirect_uri: str
    tenant: str


def microsoft_mail_configured() -> bool:
    """Return whether Microsoft mail credentials were intentionally configured."""
    return bool(
        os.environ.get("MICROSOFT_MAIL_CLIENT_ID", "").strip()
        or os.environ.get("MICROSOFT_MAIL_CLIENT_SECRET", "").strip()
    )


def microsoft_mail_config() -> MicrosoftMailConfig:
    names = ("MICROSOFT_MAIL_CLIENT_ID", "MICROSOFT_MAIL_CLIENT_SECRET")
    values = {name: os.environ.get(name, "").strip() for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing required environment variable: " + ", ".join(missing)
        )
    tenant = os.environ.get("MICROSOFT_MAIL_TENANT", "common").strip() or "common"
    if any(ch.isspace() or ch in "/?#:&" for ch in tenant):
        raise RuntimeError("Invalid MICROSOFT_MAIL_TENANT")
    redirect = os.environ.get("MICROSOFT_MAIL_REDIRECT_URI", "").strip() or (
        f"{frontend_base_url()}/api/mail-connections/microsoft/callback"
    )
    parsed_redirect = urlsplit(redirect)
    is_https = parsed_redirect.scheme == "https" and bool(parsed_redirect.netloc)
    is_localhost = (
        parsed_redirect.scheme == "http" and parsed_redirect.hostname == "localhost"
    )
    if not is_https and not is_localhost:
        raise RuntimeError("MICROSOFT_MAIL_REDIRECT_URI must use HTTPS or localhost")
    return MicrosoftMailConfig(
        client_id=values["MICROSOFT_MAIL_CLIENT_ID"],
        client_secret=values["MICROSOFT_MAIL_CLIENT_SECRET"],
        redirect_uri=redirect,
        tenant=tenant,
    )


def frontend_origins() -> list[str]:
    raw = os.environ.get("FRONTEND_ORIGIN", frontend_base_url())
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
