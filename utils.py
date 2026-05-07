import re
import unicodedata
from mapping import COMPANY_EMAIL_HOST


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
