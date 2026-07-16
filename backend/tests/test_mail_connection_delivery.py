from __future__ import annotations

import unittest
import uuid

from mail_connections.delivery import MailDeliveryService
from mail_connections.errors import MailConnectionNotFound, MailboxReauthRequired
from mail_connections.registry import ProviderDefinition, ProviderRegistry
from mail_connections.types import (
    MailCapability,
    MailConnection,
    MailConnectionStatus,
    SendReceipt,
    StoredCredential,
)


def _connection(owner_id: uuid.UUID, connection_id: uuid.UUID) -> MailConnection:
    return MailConnection(
        id=connection_id,
        owner_id=owner_id,
        provider="google",
        provider_account_id="google-account",
        email="sender@example.com",
        display_name="Sender",
        status=MailConnectionStatus.CONNECTED,
        capabilities=frozenset({MailCapability.SEND_MAIL}),
        is_default=True,
    )


class _Adapter:
    def __init__(self, events: list[str]):
        self.events = events
        self.sent = []
        self.reauth = False

    def refresh_credentials(self, credentials):
        self.events.append("refreshed")
        if self.reauth:
            raise MailboxReauthRequired()
        return {**credentials, "access_token": "rotated"}

    def send(self, *, credentials, message):
        self.events.append("sent")
        self.sent.append((credentials, message))
        return SendReceipt("google", True, "provider-id")


class _Repository:
    def __init__(self, owner_id, connection, events):
        self.owner_id = owner_id
        self.connection = connection
        self.events = events
        self.status_updates = []

    def get(self, owner_id, connection_id):
        if owner_id == self.owner_id and connection_id == self.connection.id:
            return self.connection
        return None

    def get_default(self, owner_id):
        return self.connection if owner_id == self.owner_id else None

    def read_credentials(self, owner_id, connection_id):
        return StoredCredential(
            payload={"refresh_token": "refresh", "access_token": "old"},
            version=3,
        )

    def write_credentials(
        self, owner_id, connection_id, payload, *, expected_version=None
    ):
        self.events.append("credentials-written")
        self.asserted_write = (payload, expected_version)
        return 4

    def update_status(self, owner_id, connection_id, **kwargs):
        self.events.append("status-updated")
        self.status_updates.append(kwargs)

    def commit(self):
        self.events.append("committed")


class MailDeliveryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner_id = uuid.uuid4()
        self.connection_id = uuid.uuid4()
        self.events: list[str] = []
        self.connection = _connection(self.owner_id, self.connection_id)
        self.repository = _Repository(self.owner_id, self.connection, self.events)
        self.adapter = _Adapter(self.events)
        self.registry = ProviderRegistry()
        self.registry.register(
            ProviderDefinition(
                provider="google",
                sender=self.adapter,
                capabilities=frozenset({MailCapability.SEND_MAIL}),
                credential_refresher=self.adapter,
            )
        )
        self.delivery = MailDeliveryService(self.repository, self.registry)

    def test_refresh_is_cas_persisted_before_email_is_sent(self) -> None:
        receipt = self.delivery.send_email(
            owner_id=self.owner_id,
            mail_connection_id=None,
            recipient="recipient@example.com",
            subject="Hello",
            body_text="Body",
        )

        self.assertEqual(receipt.provider_message_id, "provider-id")
        self.assertEqual(self.repository.asserted_write[1], 3)
        self.assertEqual(
            self.events[:4],
            ["refreshed", "credentials-written", "committed", "sent"],
        )
        sent_credentials, message = self.adapter.sent[0]
        self.assertEqual(sent_credentials["access_token"], "rotated")
        self.assertEqual(message["From"], "sender@example.com")
        self.assertEqual(message["To"], "recipient@example.com")
        self.assertEqual(message.get_content().strip(), "Body")

    def test_explicit_connection_is_owner_scoped(self) -> None:
        with self.assertRaises(MailConnectionNotFound):
            self.delivery.send_email(
                owner_id=uuid.uuid4(),
                mail_connection_id=self.connection_id,
                recipient="recipient@example.com",
                subject="Hello",
                body_text="Body",
            )
        self.assertNotIn("sent", self.events)

    def test_refresh_reauth_marks_connection_before_returning_error(self) -> None:
        self.adapter.reauth = True

        with self.assertRaises(MailboxReauthRequired):
            self.delivery.send_email(
                owner_id=self.owner_id,
                mail_connection_id=self.connection_id,
                recipient="recipient@example.com",
                subject="Hello",
                body_text="Body",
            )

        self.assertEqual(
            self.repository.status_updates[-1]["status"],
            MailConnectionStatus.RECONNECT_REQUIRED,
        )
        self.assertEqual(
            self.repository.status_updates[-1]["error_code"],
            "mailbox_reauth_required",
        )
        self.assertNotIn("sent", self.events)


if __name__ == "__main__":
    unittest.main()
