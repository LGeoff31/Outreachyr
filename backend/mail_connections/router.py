from __future__ import annotations

import uuid
from dataclasses import asdict
from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel

from user_resume_api import require_supabase_user

from .dependencies import get_mail_connection_service, get_provider_registry
from .errors import (
    MailboxAuthorizationFailed,
    MailboxConnectionError,
    MailboxPermissionDenied,
    MailboxRateLimited,
    MailboxReauthRequired,
    MailConnectionAccountMismatch,
    MailConnectionNotFound,
    MailProviderNotFound,
)
from .registry import ProviderRegistry
from .service import MailConnectionService, safe_return_to

router = APIRouter(prefix="/api/mail-connections", tags=["mail-connections"])


class AuthorizeRequest(BaseModel):
    return_to: str = "/dashboard/settings/sending-accounts"
    connection_id: uuid.UUID | None = None


class UpdateConnectionRequest(BaseModel):
    is_default: Literal[True]


def _owner_id(user: dict) -> uuid.UUID:
    try:
        return uuid.UUID(str(user["id"]))
    except (KeyError, TypeError, ValueError) as exc:
        # This should only be reachable if the verified Supabase JWT is malformed.
        raise MailboxAuthorizationFailed() from exc


def _error_status(exc: MailboxConnectionError) -> int:
    if isinstance(exc, (MailboxAuthorizationFailed, MailboxReauthRequired)):
        return 401
    if isinstance(exc, MailboxPermissionDenied):
        return 403
    if isinstance(exc, (MailConnectionNotFound, MailProviderNotFound)):
        return 404
    if isinstance(exc, MailConnectionAccountMismatch):
        return 409
    if isinstance(exc, MailboxRateLimited):
        return 429
    if exc.retryable:
        return 503
    return 400


def mail_error_response(exc: MailboxConnectionError) -> JSONResponse:
    return JSONResponse(
        status_code=_error_status(exc),
        content={"error": exc.public_error()},
    )


def _provider_definition(registry: ProviderRegistry, provider: str):
    return registry.get(provider)


def _append_query(url: str, key: str, value: str) -> str:
    safe = safe_return_to(url)
    parsed = urlsplit(safe)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    query.append((key, value))
    return urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
    )


@router.get("")
def list_mail_connections(
    user: Annotated[dict, Depends(require_supabase_user)],
    service: Annotated[MailConnectionService, Depends(get_mail_connection_service)],
    registry: Annotated[ProviderRegistry, Depends(get_provider_registry)],
):
    try:
        connections = service.list_connections(_owner_id(user))
    except MailboxConnectionError as exc:
        return mail_error_response(exc)
    return {
        "connections": jsonable_encoder(
            [asdict(connection.public()) for connection in connections]
        ),
        "providers": list(registry.available()),
    }


@router.post("/{provider}/authorize")
def authorize_mail_connection(
    provider: str,
    body: AuthorizeRequest,
    user: Annotated[dict, Depends(require_supabase_user)],
    service: Annotated[MailConnectionService, Depends(get_mail_connection_service)],
    registry: Annotated[ProviderRegistry, Depends(get_provider_registry)],
):
    try:
        definition = _provider_definition(registry, provider)
        result = service.begin_authorization(
            owner_id=_owner_id(user),
            provider=definition.provider,
            return_to=body.return_to,
            target_connection_id=body.connection_id,
        )
    except MailboxConnectionError as exc:
        return mail_error_response(exc)
    return {"authorization_url": result.authorization_url}


@router.get("/{provider}/callback")
def mail_connection_callback(
    provider: str,
    service: Annotated[MailConnectionService, Depends(get_mail_connection_service)],
    registry: Annotated[ProviderRegistry, Depends(get_provider_registry)],
    state: str = Query(""),
    code: str = Query(""),
    error: str | None = Query(None),
):
    try:
        definition = _provider_definition(registry, provider)
        if error is not None:
            return_to = service.reject_authorization(
                provider=definition.provider,
                state=state,
            )
            code_value = (
                "mailbox_permission_denied"
                if error == "access_denied"
                else "mailbox_authorization_failed"
            )
            return RedirectResponse(
                _append_query(return_to, "mail_connection_error", code_value),
                status_code=303,
            )
        result = service.complete_authorization(
            provider=definition.provider,
            state=state,
            code=code,
        )
    except MailboxConnectionError as exc:
        return_to = getattr(exc, "return_to", None)
        if isinstance(return_to, str):
            return RedirectResponse(
                _append_query(return_to, "mail_connection_error", exc.code),
                status_code=303,
            )
        return mail_error_response(exc)
    return RedirectResponse(
        _append_query(result.return_to, "mail_connection", "connected"),
        status_code=303,
    )


@router.patch("/{connection_id}")
def update_mail_connection(
    connection_id: uuid.UUID,
    body: UpdateConnectionRequest,
    user: Annotated[dict, Depends(require_supabase_user)],
    service: Annotated[MailConnectionService, Depends(get_mail_connection_service)],
):
    del body
    try:
        connection = service.set_default(_owner_id(user), connection_id)
    except MailboxConnectionError as exc:
        return mail_error_response(exc)
    return jsonable_encoder(asdict(connection.public()))


@router.delete("/{connection_id}", status_code=204)
def delete_mail_connection(
    connection_id: uuid.UUID,
    user: Annotated[dict, Depends(require_supabase_user)],
    service: Annotated[MailConnectionService, Depends(get_mail_connection_service)],
):
    try:
        service.disconnect(_owner_id(user), connection_id)
    except MailboxConnectionError as exc:
        return mail_error_response(exc)
    return Response(status_code=204)
