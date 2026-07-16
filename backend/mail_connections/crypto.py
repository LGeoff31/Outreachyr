from __future__ import annotations

import json
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken

from .types import ProviderCredentialPayload


@dataclass(frozen=True, repr=False)
class EncryptedPayload:
    key_id: str
    ciphertext: bytes

    def __repr__(self) -> str:
        return f"EncryptedPayload(key_id={self.key_id!r}, ciphertext=<redacted>)"


class CredentialVault:
    def __init__(self, keys: list[tuple[str, Fernet]]):
        if not keys:
            raise ValueError("At least one mailbox credential key is required")
        self._keys = dict(keys)
        self._active_id = keys[0][0]

    @classmethod
    def from_config(cls, value: str) -> "CredentialVault":
        pairs: list[tuple[str, Fernet]] = []
        for item in value.split(","):
            key_id, separator, key = item.strip().partition(":")
            if not separator or not key_id or key_id in {x[0] for x in pairs}:
                raise ValueError("Invalid MAILBOX_CREDENTIAL_KEYS")
            try:
                pairs.append((key_id, Fernet(key.encode())))
            except Exception as exc:
                raise ValueError("Invalid MAILBOX_CREDENTIAL_KEYS") from exc
        return cls(pairs)

    def encrypt(
        self, payload: ProviderCredentialPayload, *, context: str
    ) -> EncryptedPayload:
        envelope = json.dumps(
            {"version": 1, "context": context, "payload": payload},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return EncryptedPayload(
            self._active_id, self._keys[self._active_id].encrypt(envelope)
        )

    def decrypt(
        self, encrypted: EncryptedPayload, *, context: str
    ) -> ProviderCredentialPayload:
        cipher = self._keys.get(encrypted.key_id)
        if cipher is None:
            raise ValueError("Unknown mailbox credential key")
        try:
            envelope = json.loads(cipher.decrypt(encrypted.ciphertext))
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Invalid encrypted credential") from exc
        if (
            envelope.get("version") != 1
            or envelope.get("context") != context
            or not isinstance(envelope.get("payload"), dict)
        ):
            raise ValueError("Invalid encrypted credential envelope")
        return envelope["payload"]
