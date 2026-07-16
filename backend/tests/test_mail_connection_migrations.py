from __future__ import annotations

import json
import importlib
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet

from mail_connection_migration import (
    assert_legacy_owner_coverage,
    assert_no_pending_send_jobs,
    reconstruct_legacy_gmail_sessions,
    sync_legacy_google_sessions,
)
from mail_connections.crypto import CredentialVault, EncryptedPayload


class _Result:
    def __init__(self, rows: list[dict[str, Any]] | None = None, scalar: Any = None):
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self._rows]

    def first(self) -> dict[str, Any] | None:
        return dict(self._rows[0]) if self._rows else None

    def scalar_one(self) -> Any:
        return self._scalar


class _MemoryBind:
    def __init__(
        self,
        *,
        sessions: list[dict[str, Any]] | None = None,
        connections: list[dict[str, Any]] | None = None,
        credentials: dict[str, dict[str, Any]] | None = None,
        pending_jobs: bool = False,
    ):
        self.sessions = [dict(row) for row in (sessions or [])]
        self.connections = [dict(row) for row in (connections or [])]
        self.credentials = {
            str(connection_id): dict(value)
            for connection_id, value in (credentials or {}).items()
        }
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.mutation_count = 0
        self.pending_jobs = pending_jobs

    def execute(
        self, statement: Any, parameters: dict[str, Any] | None = None
    ) -> _Result:
        sql = " ".join(str(statement).split())
        params = dict(parameters or {})
        self.calls.append((sql, params))

        if "legacy-mail:load-sessions" in sql:
            return _Result(self.sessions)
        if "legacy-mail:load-connections" in sql:
            owner_id = str(params["owner_id"])
            rows: list[dict[str, Any]] = []
            for connection in self.connections:
                if str(connection["owner_id"]) != owner_id:
                    continue
                row = dict(connection)
                credential = self.credentials.get(str(connection["id"]))
                if credential:
                    row.update(credential)
                else:
                    row.update(
                        encrypted_payload=None,
                        key_id=None,
                        credential_version=None,
                    )
                rows.append(row)
            return _Result(rows)
        if "legacy-mail:coverage" in sql:
            legacy_owners = {str(row["owner_id"]) for row in self.sessions}
            google_owners = {
                str(row["owner_id"])
                for row in self.connections
                if row.get("provider") == "google"
            }
            return _Result(scalar=len(legacy_owners - google_owners))
        if "legacy-mail:pending" in sql:
            return _Result(scalar=self.pending_jobs)
        if "legacy-mail:reconstruct-source" in sql:
            rows = []
            for connection in self.connections:
                if connection.get("provider") != "google":
                    continue
                if (
                    connection.get("provider_metadata", {}).get("oauth_client")
                    != "legacy_google"
                ):
                    continue
                credential = self.credentials.get(str(connection["id"]))
                if credential:
                    rows.append({**connection, **credential})
            return _Result(rows)
        if "legacy-mail:insert-connection" in sql:
            self.connections.append(
                {
                    "id": str(params["connection_id"]),
                    "owner_id": str(params["owner_id"]),
                    "provider": "google",
                    "email": params["email"],
                    "is_default": params["is_default"],
                    "created_at": params["created_at"],
                    "provider_metadata": json.loads(params["provider_metadata"]),
                }
            )
            self.mutation_count += 1
            return _Result()
        if "legacy-mail:update-connection" in sql:
            connection = self._connection(params["connection_id"])
            connection.update(
                email=params["email"],
                provider_metadata=json.loads(params["provider_metadata"]),
            )
            self.mutation_count += 1
            return _Result()
        if "legacy-mail:write-credentials" in sql:
            connection_id = str(params["connection_id"])
            previous = self.credentials.get(connection_id)
            self.credentials[connection_id] = {
                "encrypted_payload": params["encrypted_payload"],
                "key_id": params["key_id"],
                "credential_version": (
                    int(previous["credential_version"]) + 1 if previous else 1
                ),
            }
            self.mutation_count += 1
            return _Result()
        if "legacy-mail:restore-session" in sql:
            restored = {
                "session_id": str(params["session_id"]),
                "owner_id": str(params["owner_id"]),
                "refresh_token": params["refresh_token"],
                "email": params["email"],
                "created_at": params["created_at"],
            }
            existing = next(
                (
                    row
                    for row in self.sessions
                    if str(row["session_id"]) == restored["session_id"]
                ),
                None,
            )
            if existing is None:
                self.sessions.append(restored)
            else:
                existing.update(restored)
            self.mutation_count += 1
            return _Result()
        raise AssertionError(f"Unexpected SQL: {sql}")

    def _connection(self, connection_id: Any) -> dict[str, Any]:
        expected = str(connection_id)
        return next(row for row in self.connections if str(row["id"]) == expected)


class LegacyGoogleSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.vault = CredentialVault.from_config(f"v1:{Fernet.generate_key().decode()}")
        self.now = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)

    def test_sync_uses_only_newest_session_per_owner_and_real_encryption(self) -> None:
        owner_one = uuid.uuid4()
        owner_two = uuid.uuid4()
        bind = _MemoryBind(
            sessions=[
                {
                    "session_id": "old-one",
                    "owner_id": owner_one,
                    "refresh_token": "old-secret",
                    "email": "old@example.com",
                    "created_at": self.now - timedelta(days=1),
                },
                {
                    "session_id": "owner-two",
                    "owner_id": owner_two,
                    "refresh_token": "second-secret",
                    "email": "second@example.com",
                    "created_at": self.now,
                },
                {
                    "session_id": "new-one",
                    "owner_id": owner_one,
                    "refresh_token": "new-secret",
                    "email": "new@example.com",
                    "created_at": self.now,
                },
            ]
        )

        changed = sync_legacy_google_sessions(bind, self.vault)

        self.assertEqual(changed, 2)
        self.assertEqual(len(bind.connections), 2)
        migrated_one = next(
            row for row in bind.connections if str(row["owner_id"]) == str(owner_one)
        )
        self.assertEqual(migrated_one["email"], "new@example.com")
        self.assertTrue(migrated_one["is_default"])
        self.assertEqual(
            migrated_one["provider_metadata"]["oauth_client"], "legacy_google"
        )
        encrypted_row = bind.credentials[str(migrated_one["id"])]
        encrypted = EncryptedPayload(
            key_id=encrypted_row["key_id"],
            ciphertext=encrypted_row["encrypted_payload"],
        )
        self.assertEqual(
            self.vault.decrypt(encrypted, context=f"connection:{migrated_one['id']}"),
            {
                "email": "new@example.com",
                "oauth_client": "legacy_google",
                "refresh_token": "new-secret",
            },
        )
        with self.assertRaises(ValueError):
            self.vault.decrypt(encrypted, context=f"connection:{uuid.uuid4()}")
        self.assertNotIn("new-secret", repr(bind.calls))

    def test_sync_is_idempotent_when_source_session_is_unchanged(self) -> None:
        owner_id = uuid.uuid4()
        bind = _MemoryBind(
            sessions=[
                {
                    "session_id": "stable",
                    "owner_id": owner_id,
                    "refresh_token": "stable-secret",
                    "email": "stable@example.com",
                    "created_at": self.now,
                }
            ]
        )

        self.assertEqual(sync_legacy_google_sessions(bind, self.vault), 1)
        mutations_after_first_sync = bind.mutation_count
        self.assertEqual(sync_legacy_google_sessions(bind, self.vault), 0)

        self.assertEqual(len(bind.connections), 1)
        self.assertEqual(bind.mutation_count, mutations_after_first_sync)

    def test_sync_does_not_overwrite_a_dedicated_google_connection(self) -> None:
        owner_id = uuid.uuid4()
        dedicated_id = uuid.uuid4()
        dedicated = {
            "id": str(dedicated_id),
            "owner_id": str(owner_id),
            "provider": "google",
            "email": "dedicated@example.com",
            "is_default": True,
            "created_at": self.now,
            "provider_metadata": {"oauth_client": "google_mail"},
        }
        bind = _MemoryBind(
            sessions=[
                {
                    "session_id": "legacy",
                    "owner_id": owner_id,
                    "refresh_token": "legacy-secret",
                    "email": "legacy@example.com",
                    "created_at": self.now - timedelta(days=1),
                }
            ],
            connections=[dedicated],
        )

        changed = sync_legacy_google_sessions(bind, self.vault)

        self.assertEqual(changed, 0)
        self.assertTrue(
            any("legacy-mail:load-sessions" in sql for sql, _ in bind.calls)
        )
        self.assertEqual(bind.connections, [dedicated])
        self.assertEqual(bind.credentials, {})
        self.assertEqual(bind.mutation_count, 0)


class LegacyMigrationInvariantTests(unittest.TestCase):
    def setUp(self) -> None:
        self.vault = CredentialVault.from_config(f"v1:{Fernet.generate_key().decode()}")
        self.now = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)

    def test_coverage_rejects_a_legacy_owner_without_google_connection(self) -> None:
        owner_id = uuid.uuid4()
        bind = _MemoryBind(
            sessions=[
                {
                    "session_id": "legacy",
                    "owner_id": owner_id,
                    "refresh_token": "secret",
                    "email": "owner@example.com",
                    "created_at": self.now,
                }
            ]
        )

        with self.assertRaisesRegex(RuntimeError, "legacy Gmail owner"):
            assert_legacy_owner_coverage(bind)

    def test_pending_send_job_guard_aborts_cutover(self) -> None:
        bind = _MemoryBind(pending_jobs=True)

        with self.assertRaisesRegex(RuntimeError, "pending campaign send jobs"):
            assert_no_pending_send_jobs(bind)

        self.assertEqual(bind.mutation_count, 0)

    def test_downgrade_reconstructs_a_usable_session_from_encrypted_credentials(
        self,
    ) -> None:
        owner_id = uuid.uuid4()
        connection_id = uuid.uuid4()
        encrypted = self.vault.encrypt(
            {
                "email": "restored@example.com",
                "oauth_client": "legacy_google",
                "refresh_token": "restored-secret",
            },
            context=f"connection:{connection_id}",
        )
        bind = _MemoryBind(
            connections=[
                {
                    "id": str(connection_id),
                    "owner_id": str(owner_id),
                    "provider": "google",
                    "email": "restored@example.com",
                    "is_default": True,
                    "created_at": self.now,
                    "provider_metadata": {
                        "oauth_client": "legacy_google",
                        "legacy_session_id": "restored-session",
                    },
                }
            ],
            credentials={
                str(connection_id): {
                    "encrypted_payload": encrypted.ciphertext,
                    "key_id": encrypted.key_id,
                    "credential_version": 1,
                }
            },
        )

        restored = reconstruct_legacy_gmail_sessions(bind, self.vault)

        self.assertEqual(restored, 1)
        self.assertEqual(
            bind.sessions,
            [
                {
                    "session_id": "restored-session",
                    "owner_id": str(owner_id),
                    "refresh_token": "restored-secret",
                    "email": "restored@example.com",
                    "created_at": self.now,
                }
            ],
        )


def _optional_migration(name: str) -> Any:
    return importlib.import_module(name)


class _MigrationOp:
    def __init__(self, bind: Any):
        self.bind = bind
        self.executed: list[str] = []

    def get_bind(self) -> Any:
        return self.bind

    def execute(self, statement: Any) -> None:
        self.executed.append(" ".join(str(statement).split()))
        self.bind.execute(statement)


class MigrationRevisionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.expand = importlib.import_module(
            "migrations.versions.0009_mail_connections"
        )
        self.cutover = _optional_migration(
            "migrations.versions.0010_remove_legacy_mail_sessions"
        )
        self.vault = CredentialVault.from_config(f"v1:{Fernet.generate_key().decode()}")

    def test_0009_missing_key_fails_before_any_database_mutation(self) -> None:
        bind = Mock()
        migration_op = _MigrationOp(bind)

        with (
            patch.object(self.expand, "op", migration_op),
            patch.object(
                self.expand,
                "credential_vault_from_environment",
                create=True,
                side_effect=RuntimeError(
                    "Missing required environment variable: MAILBOX_CREDENTIAL_KEYS"
                ),
            ),
            self.assertRaisesRegex(RuntimeError, "MAILBOX_CREDENTIAL_KEYS"),
        ):
            self.expand.upgrade()

        bind.execute.assert_not_called()
        self.assertEqual(migration_op.executed, [])

    def test_0009_upgrade_builds_hardened_schema_then_syncs_and_asserts(self) -> None:
        bind = Mock()
        migration_op = _MigrationOp(bind)
        sync = Mock()
        coverage = Mock()

        with (
            patch.object(self.expand, "op", migration_op),
            patch.object(
                self.expand,
                "credential_vault_from_environment",
                create=True,
                return_value=self.vault,
            ),
            patch.object(
                self.expand,
                "sync_legacy_google_sessions",
                create=True,
                new=sync,
            ),
            patch.object(
                self.expand,
                "assert_legacy_owner_coverage",
                create=True,
                new=coverage,
            ),
        ):
            self.expand.upgrade()

        sql = (
            " ".join(
                call.args[0].text
                if hasattr(call.args[0], "text")
                else str(call.args[0])
                for call in bind.execute.call_args_list
            )
            + " "
            + " ".join(migration_op.executed)
        )
        self.assertIn("create schema if not exists private", sql.lower())
        self.assertIn("mail_connections_one_default_per_owner", sql)
        self.assertIn("mail_connections_one_legacy_google_per_owner", sql)
        self.assertIn("enable row level security", sql.lower())
        self.assertIn("revoke all", sql.lower())
        sync.assert_called_once_with(bind, self.vault)
        coverage.assert_called_once_with(bind)

    def test_0010_pending_guard_runs_under_locks_and_aborts_before_drop(self) -> None:
        executed: list[str] = []

        class _EventBind:
            def execute(self, statement: Any, parameters: Any = None) -> _Result:
                executed.append(" ".join(str(statement).split()).lower())
                return _Result()

        bind = _EventBind()
        migration_op = _MigrationOp(bind)

        with (
            patch.object(self.cutover, "op", migration_op, create=True),
            patch.object(
                self.cutover,
                "credential_vault_from_environment",
                create=True,
                return_value=self.vault,
            ),
            patch.object(
                self.cutover,
                "assert_no_pending_send_jobs",
                create=True,
                side_effect=RuntimeError("pending campaign send jobs remain"),
            ),
            self.assertRaisesRegex(RuntimeError, "pending campaign send jobs"),
        ):
            self.cutover.upgrade()

        self.assertEqual(migration_op.executed, [])
        self.assertEqual(
            executed,
            [
                "lock table public.campaign_send_jobs, "
                "public.gmail_send_sessions in share row exclusive mode"
            ],
        )
        self.assertFalse(any(sql.startswith("drop table") for sql in executed))

    def test_0010_upgrade_locks_syncs_asserts_then_drops_legacy_tables(self) -> None:
        events: list[str] = []

        class _EventBind:
            def execute(self, statement: Any, parameters: Any = None) -> _Result:
                sql = " ".join(str(statement).split()).lower()
                if sql.startswith("lock table"):
                    events.append(sql)
                elif sql.startswith("drop table"):
                    events.append(sql)
                return _Result()

        bind = _EventBind()
        migration_op = _MigrationOp(bind)
        with (
            patch.object(self.cutover, "op", migration_op, create=True),
            patch.object(
                self.cutover,
                "assert_no_pending_send_jobs",
                create=True,
                side_effect=lambda _bind: events.append("guard"),
            ),
            patch.object(
                self.cutover,
                "credential_vault_from_environment",
                create=True,
                side_effect=lambda: (events.append("key"), self.vault)[1],
            ),
            patch.object(
                self.cutover,
                "sync_legacy_google_sessions",
                create=True,
                side_effect=lambda _bind, _vault: events.append("sync"),
            ),
            patch.object(
                self.cutover,
                "assert_legacy_owner_coverage",
                create=True,
                side_effect=lambda _bind: events.append("coverage"),
            ),
        ):
            self.cutover.upgrade()

        self.assertEqual(
            events,
            [
                "key",
                "lock table public.campaign_send_jobs, "
                "public.gmail_send_sessions in share row exclusive mode",
                "guard",
                "sync",
                "coverage",
                "drop table public.campaign_send_jobs",
                "drop table public.gmail_send_sessions",
            ],
        )

    def test_0010_downgrade_recreates_tables_indexes_before_reconstruction(
        self,
    ) -> None:
        events: list[str] = []

        class _EventBind:
            def execute(self, statement: Any, parameters: Any = None) -> _Result:
                events.append(" ".join(str(statement).split()).lower())
                return _Result()

        bind = _EventBind()
        migration_op = _MigrationOp(bind)
        with (
            patch.object(self.cutover, "op", migration_op, create=True),
            patch.object(
                self.cutover,
                "credential_vault_from_environment",
                create=True,
                return_value=self.vault,
            ),
            patch.object(
                self.cutover,
                "reconstruct_legacy_gmail_sessions",
                create=True,
                side_effect=lambda _bind, _vault: events.append("reconstruct"),
            ),
        ):
            self.cutover.downgrade()

        combined = " ".join(events)
        self.assertIn("create table public.gmail_send_sessions", combined)
        self.assertIn("gmail_send_sessions_owner_id_idx", combined)
        self.assertIn("create table public.campaign_send_jobs", combined)
        self.assertIn("campaign_send_jobs_status_next_send_after_idx", combined)
        self.assertIn(
            "alter table public.gmail_send_sessions enable row level security",
            combined,
        )
        self.assertIn(
            "alter table public.campaign_send_jobs enable row level security",
            combined,
        )
        self.assertIn(
            "revoke all privileges on public.gmail_send_sessions",
            combined,
        )
        self.assertEqual(events[-1], "reconstruct")

    def test_0009_downgrade_checks_legacy_tables_before_private_drops(self) -> None:
        events: list[str] = []

        class _EventBind:
            def execute(self, statement: Any, parameters: Any = None) -> _Result:
                events.append(" ".join(str(statement).split()).lower())
                return _Result()

        bind = _EventBind()
        migration_op = _MigrationOp(bind)
        with (
            patch.object(self.expand, "op", migration_op),
            patch.object(
                self.expand,
                "assert_legacy_tables_exist",
                create=True,
                side_effect=lambda _bind: events.append("legacy tables checked"),
            ),
        ):
            self.expand.downgrade()

        self.assertEqual(events[0], "legacy tables checked")
        self.assertTrue(
            all("private." in event for event in events[1:]),
            events,
        )


if __name__ == "__main__":
    unittest.main()
