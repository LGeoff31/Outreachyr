Alembic migrations for the Outreachyr backend.

Run from `backend/`:

```powershell
uv run alembic upgrade head
```

`0009_mail_connections` and later require `MAILBOX_CREDENTIAL_KEYS` so legacy
Gmail refresh tokens can be encrypted before the old session table is removed.
`0010_remove_legacy_mail_sessions` intentionally aborts while any campaign send
job is still pending; drain the legacy queue with the old release before
deploying this cutover.
