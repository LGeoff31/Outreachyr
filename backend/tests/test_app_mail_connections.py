from __future__ import annotations

import os
import unittest
import uuid
from contextlib import nullcontext
from email.message import EmailMessage
from unittest.mock import patch

from fastapi import Request

os.environ.setdefault("FRONTEND_PORT", "3000")

import app  # noqa: E402
from mail_connections.errors import MailboxPermissionDenied  # noqa: E402
from mail_connections.types import (  # noqa: E402
    MailCapability,
    MailConnection,
    MailConnectionStatus,
)


class _FakeDeliveryService:
    def __init__(self, connection: MailConnection):
        self.connection = connection
        self.resolved: list[tuple[uuid.UUID, uuid.UUID | None]] = []
        self.sent: list[tuple[uuid.UUID, uuid.UUID | None, list[EmailMessage]]] = []

    def resolve_connection(
        self, owner_id: uuid.UUID, mail_connection_id: uuid.UUID | None
    ) -> MailConnection:
        self.resolved.append((owner_id, mail_connection_id))
        return self.connection

    def send_messages(
        self,
        *,
        owner_id: uuid.UUID,
        mail_connection_id: uuid.UUID | None,
        messages: list[EmailMessage],
    ) -> list[object]:
        self.sent.append((owner_id, mail_connection_id, messages))
        return []


class AppMailConnectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner_id = uuid.uuid4()
        self.connection_id = uuid.uuid4()
        self.connection = MailConnection(
            id=self.connection_id,
            owner_id=self.owner_id,
            provider="google",
            provider_account_id="google-user",
            email="sender@example.com",
            display_name="Sender",
            status=MailConnectionStatus.CONNECTED,
            capabilities=frozenset({MailCapability.SEND_MAIL}),
            is_default=True,
        )

    @staticmethod
    def _request() -> Request:
        return Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/send",
                "headers": [(b"authorization", b"Bearer access-token")],
            }
        )

    def test_real_send_uses_verified_owner_and_selected_connection(self) -> None:
        delivery = _FakeDeliveryService(self.connection)
        try:
            with (
                patch.object(
                    app,
                    "_supabase_user_from_request",
                    return_value={"id": str(self.owner_id), "email": "app@example.com"},
                ),
                patch.object(
                    app,
                    "_mail_delivery_context",
                    return_value=nullcontext(delivery),
                    create=True,
                ),
                patch.object(app, "persist_sent_campaign") as persist,
                patch.object(app, "_billing_status_for_owner", return_value=None),
            ):
                response = app._send_campaign(
                    self._request(),
                    people=[("recipient@example.com", "Recipient")],
                    company="Example",
                    dry_run=False,
                    mail_connection_id=self.connection_id,
                    subject="Hello",
                    body_opt="Body",
                    resume_bytes=None,
                    resume_filename="resume.pdf",
                )
        except TypeError as exc:
            self.fail(f"provider-neutral sender selection is not wired: {exc}")

        self.assertEqual(response["ok"], True)
        self.assertEqual(
            delivery.resolved,
            [(self.owner_id, self.connection_id)],
        )
        self.assertEqual(len(delivery.sent), 1)
        sent_owner, sent_connection, messages = delivery.sent[0]
        self.assertEqual(sent_owner, self.owner_id)
        self.assertEqual(sent_connection, self.connection_id)
        self.assertEqual(messages[0]["From"], "sender@example.com")
        persist.assert_called_once()

    def test_preview_does_not_require_identity_or_mail_connection(self) -> None:
        try:
            response = app._send_campaign(
                self._request(),
                people=[("recipient@example.com", "Recipient")],
                company="Example",
                dry_run=True,
                mail_connection_id=None,
                subject="Hello",
                body_opt="Body",
                resume_bytes=None,
                resume_filename="resume.pdf",
            )
        except TypeError as exc:
            self.fail(f"provider-neutral preview contract is not wired: {exc}")

        self.assertEqual(response["dry_run"], True)
        self.assertEqual(response["count"], 1)

    def test_generic_mail_connection_routes_are_mounted(self) -> None:
        paths = set(app.app.openapi()["paths"])
        self.assertTrue(
            {
                "/api/mail-connections",
                "/api/mail-connections/{provider}/authorize",
                "/api/mail-connections/{provider}/callback",
                "/api/mail-connections/{connection_id}",
            }.issubset(paths)
        )

    def test_legacy_google_session_and_queue_routes_are_removed(self) -> None:
        paths = set(app.app.openapi()["paths"])
        self.assertTrue(
            {
                "/api/auth/google/start",
                "/api/auth/google/callback",
                "/api/auth/google/session",
                "/api/auth/me",
                "/api/auth/logout",
                "/api/internal/process-send-queue",
            }.isdisjoint(paths)
        )

    def test_send_permission_error_uses_forbidden_status_and_nested_shape(self) -> None:
        response = app._mail_error_response(MailboxPermissionDenied())

        self.assertEqual(response.status_code, 403)
        self.assertIn(b'"code":"mailbox_permission_denied"', response.body)


if __name__ == "__main__":
    unittest.main()
