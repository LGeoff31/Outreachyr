from __future__ import annotations

import os
from functools import lru_cache

from fastapi import Depends
from sqlalchemy.orm import Session

from config import (
    google_mail_client_id,
    google_mail_client_secret,
    google_mail_redirect_uri,
    load_dotenv,
    mailbox_credential_keys,
    microsoft_mail_config,
    microsoft_mail_configured,
)
from user_resume_api import get_db_session

from .crypto import CredentialVault
from .delivery import MailDeliveryService
from .providers.google import GOOGLE_PROVIDER, GoogleMailboxAdapter
from .providers.microsoft import MICROSOFT_PROVIDER, MicrosoftGraphAdapter
from .registry import ProviderDefinition, ProviderRegistry
from .repository import MailConnectionRepository
from .service import MailConnectionService
from .types import MailCapability


def build_provider_registry() -> ProviderRegistry:
    load_dotenv()
    google = GoogleMailboxAdapter(
        client_id=google_mail_client_id(),
        client_secret=google_mail_client_secret(),
        redirect_uri=google_mail_redirect_uri(),
        legacy_client_id=os.environ.get("GOOGLE_CLIENT_ID", "").strip() or None,
        legacy_client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", "").strip() or None,
    )
    registry = ProviderRegistry()
    registry.register(
        ProviderDefinition(
            provider=GOOGLE_PROVIDER,
            sender=google,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            oauth_connector=google,
            credential_refresher=google,
            credential_revoker=google,
        )
    )
    if microsoft_mail_configured():
        microsoft_config = microsoft_mail_config()
        microsoft = MicrosoftGraphAdapter(
            client_id=microsoft_config.client_id,
            client_secret=microsoft_config.client_secret,
            redirect_uri=microsoft_config.redirect_uri,
            tenant=microsoft_config.tenant,
        )
        registry.register(
            ProviderDefinition(
                provider=MICROSOFT_PROVIDER,
                sender=microsoft,
                capabilities=frozenset({MailCapability.SEND_MAIL}),
                oauth_connector=microsoft,
                credential_refresher=microsoft,
                credential_revoker=microsoft,
            )
        )
    return registry


@lru_cache(maxsize=1)
def get_provider_registry() -> ProviderRegistry:
    # Kept behind a request dependency so importing the application never
    # requires provider environment variables.
    return build_provider_registry()


@lru_cache(maxsize=1)
def get_credential_vault() -> CredentialVault:
    return CredentialVault.from_config(mailbox_credential_keys())


def get_mail_connection_repository(
    session: Session = Depends(get_db_session),
    vault: CredentialVault = Depends(get_credential_vault),
) -> MailConnectionRepository:
    return MailConnectionRepository(session, vault)


def get_mail_connection_service(
    repository: MailConnectionRepository = Depends(get_mail_connection_repository),
    registry: ProviderRegistry = Depends(get_provider_registry),
) -> MailConnectionService:
    return MailConnectionService(repository, registry)


def get_mail_delivery_service(
    repository: MailConnectionRepository = Depends(get_mail_connection_repository),
    registry: ProviderRegistry = Depends(get_provider_registry),
) -> MailDeliveryService:
    return MailDeliveryService(repository, registry)
