from __future__ import annotations

from config import (
    google_mail_client_id,
    google_mail_client_secret,
    google_mail_redirect_uri,
    microsoft_mail_config,
)

from .providers.google import GoogleMailboxAdapter
from .providers.microsoft import MicrosoftGraphAdapter
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
    microsoft_config = microsoft_mail_config()
    microsoft = MicrosoftGraphAdapter(
        client_id=microsoft_config.client_id,
        client_secret=microsoft_config.client_secret,
        redirect_uri=microsoft_config.redirect_uri,
        tenant=microsoft_config.tenant,
    )
    registry.register(
        ProviderDefinition(
            provider=MailProvider.MICROSOFT,
            sender=microsoft,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            oauth_connector=microsoft,
            credential_refresher=microsoft,
            credential_revoker=microsoft,
        )
    )
    return registry
