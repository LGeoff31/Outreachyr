import os
from pathlib import Path


def load_dotenv() -> None:
    """Load env vars from backend, repo-root, and frontend `.env` files."""
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

    frontend_dir = repo_root / "frontend"

    ingest(backend_dir / ".env")
    ingest(repo_root / ".env")
    ingest(frontend_dir / ".env")


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


def google_oauth_configured() -> bool:
    cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    csec = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    return bool(cid and csec)


def supabase_url() -> str:
    return (
        os.environ.get("SUPABASE_URL", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
        or required_env("SUPABASE_URL")
    )


def supabase_publishable_key() -> str:
    return (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("SUPABASE_ANON_KEY", "").strip()
        or required_env("SUPABASE_PUBLISHABLE_KEY")
    )


def supabase_auth_configured() -> bool:
    try:
        return bool(supabase_url() and supabase_publishable_key())
    except RuntimeError:
        return False


def frontend_base_url() -> str:
    return os.environ.get(
        "FRONTEND_URL",
        os.environ.get("PUBLIC_APP_URL", "http://localhost:3000"),
    ).rstrip("/")


def google_redirect_uri() -> str:
    return os.environ.get(
        "GOOGLE_REDIRECT_URI",
        f"{frontend_base_url()}/api/auth/google/callback",
    )


def frontend_origins() -> list[str]:
    raw = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
