# Outreachyr

Frontend is in `frontend/`. Backend is in `backend/`.

## Local dev

```sh
cp .env.example .env

npm run dev
```

Fill in `.env` before starting. `npm run dev` starts the Supabase CLI stack,
reads local URLs, keys, and database connection values from
`supabase status -o env`, then passes the derived values into Docker Compose
with watch mode.

- Frontend: `http://localhost:${FRONTEND_PORT}`
- Backend: `http://127.0.0.1:${BACKEND_PORT}`
- Supabase Studio: printed by `npm run dev` and `npm exec -- supabase status`

To run one service:

```sh
npm run dev:backend
npm run dev:frontend
```

To stop the app containers and local Supabase without deleting local data:

```sh
npm run dev:down
```

`BACKEND_PORT` and `FRONTEND_PORT` control the app ports. Local Supabase values
come from `supabase status -o env`; Docker-side Supabase reachability defaults
to `SUPABASE_INTERNAL_HOST=host.docker.internal` and can be overridden in `.env`.
For direct Compose runs, `SUPABASE_SERVER_URL` can provide the Docker-reachable
Supabase host used by Next server-side fetches. The server client still uses
`NEXT_PUBLIC_SUPABASE_URL` for Supabase Auth cookie identity, so browser and
server OAuth handshakes share the same PKCE cookies.

For Google OAuth in local Supabase, start the stack and copy the Supabase API
URL from `npm exec -- supabase status`, or use the `Google OAuth redirect URI`
printed by `npm run dev`. Add this value under the Google OAuth client's
**Authorized redirect URIs**:

```text
${API_URL}/auth/v1/callback
```

The app callback remains `http://localhost:${FRONTEND_PORT}/auth/callback` and
is passed into the Supabase CLI config by the dev script.

Google login and Gmail sending use separate authorization flows. Supabase Auth
only requests identity scopes (`openid`, `email`, and `profile`). After login,
connect a sending account under **Settings > Sending accounts**; that consent
flow requests Gmail send access and stores the resulting credentials encrypted
in Postgres.

Set `MAILBOX_CREDENTIAL_KEYS` before running migrations. Generate its initial
Fernet key with:

```sh
python -c 'from cryptography.fernet import Fernet; print("v1:" + Fernet.generate_key().decode())'
```

For Gmail consent, either reuse `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` or
set the dedicated `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET` pair.
The OAuth client used for sending must allow this redirect URI:

```text
http://localhost:${FRONTEND_PORT}/api/mail-connections/google/callback
```

In production, replace the origin with the public frontend origin. Keep old
vault keys after the active key (comma-separated) during key rotation so
existing sending-account credentials remain decryptable.

## Backend commands

```sh
docker compose run --rm backend uv run alembic upgrade head
docker compose run --rm backend uv run ruff check .
docker compose run --rm backend uv run ruff format --check .
docker compose run --rm backend uv run ty check
```
