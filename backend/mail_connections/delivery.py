from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Iterable

from .errors import (
    MailboxConnectionError,
    MailboxDeliveryUnknown,
    MailboxPermissionDenied,
    MailboxReauthRequired,
    MailConnectionNotFound,
    MailConnectionRequired,
    MailConnectionSendNotSupported,
)
from .registry import ProviderRegistry
from .repository import MailConnectionRepository
from .types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
    SendReceipt,
)


class MailDeliveryService:
    def __init__(
        self,
        repository: MailConnectionRepository,
        registry: ProviderRegistry,
    ):
        self.repository = repository
        self.registry = registry

    def resolve_connection(
        self,
        owner_id: uuid.UUID,
        mail_connection_id: uuid.UUID | None,
    ) -> MailConnection:
        if mail_connection_id is None:
            connection = self.repository.get_default(owner_id)
            if connection is None:
                raise MailConnectionRequired()
        else:
            connection = self.repository.get(owner_id, mail_connection_id)
            if connection is None:
                raise MailConnectionNotFound()
        if connection.status == MailConnectionStatus.RECONNECT_REQUIRED:
            raise MailboxReauthRequired()
        if MailCapability.SEND_MAIL not in connection.capabilities:
            raise MailConnectionSendNotSupported()
        return connection

    def send_email(
        self,
        *,
        owner_id: uuid.UUID,
        mail_connection_id: uuid.UUID | None,
        recipient: str,
        subject: str,
        body_text: str,
    ) -> SendReceipt:
        message = EmailMessage()
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body_text)
        return self.send_messages(
            owner_id=owner_id,
            mail_connection_id=mail_connection_id,
            messages=[message],
        )[0]

    def send_messages(
        self,
        *,
        owner_id: uuid.UUID,
        mail_connection_id: uuid.UUID | None,
        messages: Iterable[EmailMessage],
    ) -> list[SendReceipt]:
        connection = self.resolve_connection(owner_id, mail_connection_id)
        definition = self.registry.get(connection.provider)
        stored = self.repository.read_credentials(owner_id, connection.id)
        credentials = dict(stored.payload)

        try:
            if definition.credential_refresher is not None:
                refreshed = definition.credential_refresher.refresh_credentials(
                    credentials
                )
                if refreshed != stored.payload:
                    self.repository.write_credentials(
                        owner_id,
                        connection.id,
                        refreshed,
                        expected_version=stored.version,
                    )
                    # Token rotation must be durable before a request that may
                    # invalidate the previous refresh token.
                    self.repository.commit()
                credentials = refreshed

            receipts: list[SendReceipt] = []
            for original in messages:
                message = copy.deepcopy(original)
                if message.get("From") is None:
                    message["From"] = connection.email
                else:
                    message.replace_header("From", connection.email)
                receipts.append(
                    definition.sender.send(
                        credentials=credentials,
                        message=message,
                    )
                )
        except MailboxConnectionError as exc:
            status = (
                MailConnectionStatus.RECONNECT_REQUIRED
                if isinstance(exc, (MailboxReauthRequired, MailboxPermissionDenied))
                else MailConnectionStatus.CONNECTED
            )
            self.repository.update_status(
                owner_id,
                connection.id,
                status=status,
                error_code=exc.code,
            )
            self.repository.commit()
            raise
        except Exception as exc:
            mapped = MailboxDeliveryUnknown()
            self.repository.update_status(
                owner_id,
                connection.id,
                status=MailConnectionStatus.CONNECTED,
                error_code=mapped.code,
            )
            self.repository.commit()
            raise mapped from exc

        self.repository.update_status(
            owner_id,
            connection.id,
            status=MailConnectionStatus.CONNECTED,
            error_code=None,
            verified_at=datetime.now(timezone.utc),
        )
        self.repository.commit()
        return receipts
