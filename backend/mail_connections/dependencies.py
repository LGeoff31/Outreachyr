from __future__ import annotations

from config import (
    google_mail_client_id,
    google_mail_client_secret,
    google_mail_redirect_uri,
)

from .providers.google import GoogleMailboxAdapter
from .registry import ProviderDefinition, ProviderRegistry
from .types import MailCapability, MailProvider


def build_provider_registry() -> ProviderRegistry:
    google = GoogleMailboxAdapter(
        client_id=google_mail_client_id(),
        client_secret=google_mail_client_secret(),
        redirect_uri=google_mail_redirect_uri(),
    )
    registry = ProviderRegistry()
    registry.register(
        ProviderDefinition(
            provider=MailProvider.GOOGLE,
            sender=google,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            oauth_connector=google,
            credential_refresher=google,
            credential_revoker=google,
        )
    )
    return registry
