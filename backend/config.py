import os
from pathlib import Path


def load_dotenv() -> None:
    env = Path(__file__).resolve().parent / ".env"
    if not env.is_file():
        return

    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        if k and k not in os.environ:
            os.environ[k] = v


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def serpapi_api_key() -> str:
    return required_env("SERPAPI_API_KEY")


def gmail_credentials() -> tuple[str, str]:
    return (
        required_env("GMAIL_ADDRESS"),
        required_env("GMAIL_APP_PASSWORD"),
    )
