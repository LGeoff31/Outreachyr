import os
import re
import unicodedata
from pathlib import Path
from mapping import COMPANY_EMAIL_HOST


def _load_dotenv():
    env = Path(__file__).resolve().parent / ".env"

    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip()
        if k and k not in os.environ:
            os.environ[k] = v


def _letters(s: str) -> str:
    # Effectively cleaning names into lowercase ASCII i.e  José -> Jose
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if c.isascii() and c.isalpha()).lower()


def _first_from_email(addr: str) -> str:
    # linh.nguyen@career.nvidia.com -> Linh
    local = addr.split("@")[0]
    part = re.split(r"[._]", local, maxsplit=1)[0]
    return part[:1].upper() + part[1:].lower() if part else "there"


def domain_for_company(name: str) -> str | None:
    key = name.strip().lower()
    return COMPANY_EMAIL_HOST.get(key)
