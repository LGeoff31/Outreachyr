import os
from pathlib import Path


def load_dotenv() -> None:
    """Load env vars from `backend/.env` first, then repo-root `.env` for missing keys."""
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

    ingest(backend_dir / ".env")
    ingest(repo_root / ".env")


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def serpapi_api_key() -> str:
    return required_env("SERPAPI_API_KEY")


def google_oauth_configured() -> bool:
    cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    csec = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    return bool(cid and csec)


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
