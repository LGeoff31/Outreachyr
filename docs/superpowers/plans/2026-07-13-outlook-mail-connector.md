# Outlook and Microsoft 365 Mail Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add personal Outlook.com and organizational Microsoft 365 sending through Microsoft Graph as a strictly additive provider on the provider-neutral mail-connection foundation.

**Architecture:** Register one `MicrosoftGraphAdapter` against PR 1's unchanged OAuth connector and sender protocols. Reuse its OAuth-state store, encrypted credential vault, repository, lifecycle service, API, settings UI, sender picker, and send payload. Microsoft app login remains identity-only through Supabase Azure; Microsoft mail consent is a separate direct OAuth flow.

**Tech Stack:** FastAPI, HTTPX, Microsoft identity platform v2 OAuth with PKCE, Microsoft Graph `sendMail`, Next.js 15, Supabase Azure Auth, existing PR 1 mail-connection framework.

## Stack Position

- Branch: `codex/outlook-mail-connector`
- Base branch while under review: `codex/provider-neutral-mail-connections`
- Pull request target while stacked: `codex/provider-neutral-mail-connections`
- Prerequisite plan: `docs/superpowers/plans/2026-07-13-provider-neutral-mail-connections.md`
- After PR 1 merges, rebase this branch onto current `main`, retarget the PR to `main`, and verify the remaining diff is Outlook-only.

Create the stacked branch only after the reviewed foundation tip is checked out:

```bash
git switch codex/provider-neutral-mail-connections
git switch -c codex/outlook-mail-connector
```

## Scope

PR 2 adds:

- Provider key `MailProvider.MICROSOFT = "microsoft"`.
- User-facing name “Outlook / Microsoft 365.”
- Personal Microsoft and organizational Microsoft 365 accounts through the `/common` authority.
- One direct delegated capability: `send_mail` as the authenticated `/me` mailbox.
- Microsoft identity login through Supabase provider `azure`, with identity-only scope.
- Microsoft-specific setup, policy copy, tests, and rollout checks.

PR 2 does not add:

- Inbox or sent-folder reads.
- `Mail.Read`, `Mail.ReadWrite`, `Mail.Send.Shared`, application permissions, shared mailboxes, or send-as delegation.
- Webhooks, subscriptions, delta sync, message lookup, scheduled send, or delivery tracking.
- Large-attachment upload sessions.
- A Microsoft SDK, MSAL cache, or a second credential model.
- Automatic retries after a send attempt.
- A database migration or schema/model change.
- Any generic API, service, repository, encryption, state, UI-state, sender-selection, or send-payload refactor.

## PR 2 Scope Guard

These foundation files must remain unchanged:

```text
backend/mail_connections/protocols.py
backend/mail_connections/errors.py
backend/mail_connections/registry.py
backend/mail_connections/repository.py
backend/mail_connections/crypto.py
backend/mail_connections/service.py
backend/mail_connections/delivery.py
backend/mail_connections/router.py
backend/mail_connections/providers/google.py
backend/migrations/

frontend/lib/mail-connections/types.ts
frontend/lib/mail-connections/api.ts
frontend/lib/mail-connections/errors.ts
frontend/lib/mail-connections/selectors.ts
frontend/lib/mail-connections/sendPayload.ts
frontend/components/mail-connections/MailConnectionsProvider.tsx
frontend/components/mail-connections/MailConnectionCard.tsx
frontend/components/mail-connections/ConnectMailboxButton.tsx
frontend/components/mail-connections/SenderSelect.tsx
frontend/components/OutreachForm.tsx
frontend/app/auth/callback/route.ts
```

If Microsoft cannot be added without changing one of these files, fix the abstraction in PR 1 and rebase PR 2. Do not hide a foundation redesign inside the Outlook diff.

## Exact File Scope

### Create

```text
backend/mail_connections/providers/microsoft.py
backend/tests/test_microsoft_mail_provider.py

frontend/components/provider-icons/MicrosoftLogo.tsx
frontend/components/provider-icons/MicrosoftLogo.test.tsx
```

### Modify

```text
backend/mail_connections/types.py
backend/mail_connections/dependencies.py
backend/config.py
backend/tests/test_config.py
backend/tests/test_mail_connection_registry.py
backend/tests/test_mail_connection_router.py
backend/pyproject.toml
backend/uv.lock

frontend/lib/appAuthProviders.ts
frontend/lib/appAuthProviders.test.ts
frontend/lib/mail-connections/providers.ts
frontend/lib/mail-connections/providers.test.ts
frontend/components/provider-icons/MailProviderLogo.tsx
frontend/components/auth/AppLoginPanel.test.tsx
frontend/components/mail-connections/SendingAccountsView.test.tsx

frontend/app/privacy/page.tsx
frontend/app/terms/page.tsx
.env.example
docker-compose.yml
supabase/config.toml
scripts/dev.mjs
scripts/dev.test.mjs
README.md
```

No other product file should change without an explicit explanation in the PR description.

## Microsoft Provider Contract

Add only this enum member in `backend/mail_connections/types.py`:

```python
MICROSOFT = "microsoft"
```

`MicrosoftGraphAdapter` implements PR 1's `OAuthMailboxConnector`, `CredentialRefresher`, `CredentialRevoker`, and `MailSender` protocols directly. Its constructor accepts:

```text
client_id: str
client_secret: str
redirect_uri: str
tenant: str = "common"
http_client: httpx.Client | None
now: Callable[[], datetime]
```

Use injected HTTP and clock dependencies in tests. Production HTTP timeouts:

```text
connect = 5 seconds
read = 30 seconds
write = 30 seconds
pool = 5 seconds
```

Configure no transport retry policy.

### Endpoints

```text
Authorization:
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize

Token exchange/refresh:
https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token

Mailbox identity:
https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName

Send:
https://graph.microsoft.com/v1.0/me/sendMail
```

Default `tenant` is `common`. Configuration rejects path, query, fragment, whitespace, or URL delimiter characters in a custom tenant value.

### Connector permission set

Request exactly:

```text
offline_access
https://graph.microsoft.com/User.Read
https://graph.microsoft.com/Mail.Send
```

The connector does not need an ID token because it reads the mailbox identity from Graph `/me`. Do not add `Mail.Read`, `Mail.ReadWrite`, `Mail.Send.Shared`, or application permissions.

The Supabase Microsoft login is separate and requests only `email`; it never requests `offline_access`, `Mail.Send`, or Graph resource scopes.

## Authorization and Grant Exchange

### Authorization URL

Build the v2 authorization URL with exactly:

```text
client_id=<configured client ID>
response_type=code
response_mode=query
redirect_uri=<exact configured URI>
scope=<space-delimited connector permission set>
state=<opaque state from PR 1>
code_challenge=<S256 challenge from PR 1>
code_challenge_method=S256
prompt=select_account
login_hint=<existing address only for a targeted reconnect>
```

Never put the client secret, owner ID, return path, or PKCE verifier in the URL or state. The only account identifier permitted in the authorization URL is the existing mailbox address as `login_hint` during targeted reconnect.

`login_hint` is not part of state and is used only for targeted reconnect. The callback still requires the returned Graph account ID to match PR 1's stored target; a hint is not an authorization boundary.

### Token exchange

POST form-encoded data to the token endpoint:

```text
client_id
client_secret
code
code_verifier
redirect_uri
grant_type=authorization_code
scope=<same connector permission set>
```

Require:

- Non-empty `access_token`.
- Non-empty `refresh_token`.
- Bearer token type, case-insensitive.
- Positive numeric `expires_in`.
- Returned scopes sufficient for `User.Read` and `Mail.Send`.

Then call Graph `/me` and construct:

```text
provider_account_id = profile.id
email = profile.mail, falling back to profile.userPrincipalName
display_name = profile.displayName or null
capabilities = {send_mail}
```

Reject the grant when the stable ID or both address fields are missing.

Persist only the encrypted provider payload:

```json
{
  "access_token": "<secret>",
  "refresh_token": "<secret>",
  "token_type": "Bearer",
  "expires_at": 1780000000,
  "scope": "Mail.Send User.Read offline_access"
}
```

PR 1's vault wraps this payload with version/context and stores it under `private.mail_connection_credentials`.

## Refresh-Token Rotation

When the access token is expired or inside PR 1's clock-skew window, POST:

```text
client_id
client_secret
grant_type=refresh_token
refresh_token=<current refresh token>
scope=<connector permission set>
```

On success:

1. Replace access token and expiry.
2. Replace the refresh token whenever Microsoft returns a new one.
3. Preserve the current refresh token only when the response omits a replacement.
4. Return the complete credential payload.
5. Let PR 1's delivery service encrypt and persist it before sending.
6. Abort the send if rotated-credential persistence fails.

Never log either token generation. A refresh failure must not erase the previous encrypted payload before the error is classified.

## Disconnect Semantics

`MicrosoftGraphAdapter.revoke()` intentionally performs no Microsoft network call:

- The Microsoft logout endpoint logs out SSO; it is not a per-application delegated-token revocation endpoint.
- `revokeSignInSessions` is account-wide and far broader than disconnecting Outreachyr.
- PR 1 still deletes the encrypted local credential and connection.
- UI/docs explain how the user can also remove Outreachyr consent in Microsoft account or organizational app-consent settings.

Do not fake remote revocation or request broader Graph permissions to implement it.

## MIME Sending

Serialize the existing Python `EmailMessage` with SMTP policy:

```python
mime_bytes = message.as_bytes(policy=email.policy.SMTP)
encoded_body = base64.b64encode(mime_bytes)
```

- Use standard Base64, not Gmail's URL-safe Base64.
- Reject locally if `len(encoded_body) > 4_000_000`.
- POST the encoded bytes to `/me/sendMail`.
- Use `Authorization: Bearer <access token>`.
- Use `Content-Type: text/plain`.
- Treat only HTTP `202` as success.
- Do not expect a response body or message ID.

Return:

```text
provider = microsoft
accepted = true
provider_message_id = null
```

`202 Accepted` means Microsoft accepted the request for processing; it is not proof of final delivery.

The 4 MB request limit means some PDFs accepted by Gmail will be too large for this send-only Outlook v1. Large-attachment upload sessions would require a wider permission/flow and remain out of scope.

## Error Mapping

Map only to PR 1's existing classes:

| Microsoft condition | Domain exception | Public behavior |
|---|---|---|
| OAuth `invalid_grant`, `interaction_required`, `consent_required` | `MailboxReauthRequired` | 409 `mailbox_reauth_required` |
| Graph 401 | `MailboxReauthRequired` | 409 `mailbox_reauth_required` |
| Graph 403 | `MailboxPermissionDenied` | 403 `mailbox_permission_denied` |
| Graph 429 | `MailboxRateLimited` | 429 plus `Retry-After` |
| OAuth `server_error` or `temporarily_unavailable` | `MailboxTemporaryFailure` | 503 |
| Connect failure/timeout before send body transmission | `MailboxTemporaryFailure` | 503 |
| Send write/read timeout or remote-protocol failure | `MailboxDeliveryUnknown` | 502; no retry |
| Graph 5xx after send attempt begins | `MailboxDeliveryUnknown` | 502; no retry |
| OAuth invalid client/scope/config | `MailboxConnectionError("microsoft_oauth_configuration")` | 502 generic provider error |
| Graph 400 | `MailboxConnectionError("microsoft_message_rejected")` | 502 generic provider error |
| Local or Graph 413 | `MailboxConnectionError("microsoft_message_too_large")` | 502 generic provider error |
| Other unexpected 4xx | `MailboxConnectionError("microsoft_provider_error")` | 502 generic provider error |

For 429, parse a positive integer `Retry-After` and use 60 seconds if missing or malformed.

Connection-state behavior remains PR 1's behavior:

- Reauth becomes `reconnect_required`.
- Permission failure becomes `error`.
- Rate limit, temporary failure, and delivery unknown keep the connection `connected` while recording `last_error_code`.
- The service performs no automatic provider-send retries.

Logs may include provider, operation, status, duration, sanitized Graph error code, and Microsoft request/correlation IDs. Logs must omit tokens, codes, verifier, MIME/body, recipient, subject, attachment name, and OAuth error description.

## Task 1: Add Microsoft Configuration and Enum

**Files:**

- Modify: `backend/mail_connections/types.py`
- Modify: `backend/config.py`
- Modify: `backend/tests/test_config.py`
- Modify: `backend/pyproject.toml`
- Modify: `backend/uv.lock`

- [ ] Write failing config tests: complete config parses; all-absent or partial config fails startup with missing variable names but no values; tenant defaults to `common`; invalid tenant fails; HTTPS redirect is required except `http://localhost`.
- [ ] Add `MICROSOFT = "microsoft"` to the enum and no other domain change.
- [ ] Move HTTPX from PR 1's test-only dependency group into production dependencies: remove its dev-group entry, add `"httpx>=0.28,<0.29"` to project dependencies, and regenerate the lock with:

  ```bash
  cd backend
  uv remove --dev httpx
  uv add "httpx>=0.28,<0.29"
  uv lock --check
  ```

- [ ] Add typed config for `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`, `MICROSOFT_MAIL_TENANT`, and `MICROSOFT_MAIL_REDIRECT_URI`.
- [ ] Run:

  ```bash
  cd backend
  uv run python -m unittest discover -s tests -p 'test_config.py' -v
  ```

  Expected: `OK`; no secret values appear in failures or logs.

- [ ] Commit: `feat: configure Microsoft mail provider`

## Task 2: Implement Authorization, Exchange, and Identity

**Files:**

- Create: `backend/mail_connections/providers/microsoft.py`
- Create: `backend/tests/test_microsoft_mail_provider.py`
- Modify: `backend/mail_connections/dependencies.py`
- Modify: `backend/tests/test_mail_connection_registry.py`

- [ ] Write failing URL tests for `/common`, exact scopes, exact redirect, opaque state, PKCE S256, query response mode, account picker, absent hint on Connect new, and expected hint on targeted reconnect.
- [ ] Assert client secret, owner ID, return path, and verifier are absent from the URL; mailbox email appears only as the explicitly tested reconnect `login_hint`.
- [ ] Write failing exchange tests for exact form fields and headers, bearer-token validation, expiry calculation with injected clock, returned-scope validation, and no unexpected request fields.
- [ ] Write failing identity tests for `mail` first, UPN fallback, nullable display name, missing stable ID, missing address, and stable provider account ID.
- [ ] Write failing error tests for invalid grant, consent required, invalid client, OAuth transient errors, malformed JSON, and missing required token fields.
- [ ] Implement with an injected `httpx.Client`/`MockTransport`; tests make no network calls.
- [ ] Ensure `MailboxGrant` exposes only `send_mail` and that secret payloads are excluded from `repr`.
- [ ] Register the completed adapter in `dependencies.py` and add the failing-then-passing registry assertion for provider `microsoft` with only `send_mail`.
- [ ] Run:

  ```bash
  cd backend
  uv run python -m unittest discover -s tests -p 'test_microsoft_mail_provider.py' -v
  uv run python -m unittest discover -s tests -p 'test_mail_connection_registry.py' -v
  ```

  Expected: authorization/exchange/identity cases end in `OK`.

- [ ] Commit: `feat: authorize Microsoft sending accounts`

## Task 3: Implement Refresh Rotation and Graph Sending

**Files:**

- Modify: `backend/mail_connections/providers/microsoft.py`
- Modify: `backend/tests/test_microsoft_mail_provider.py`

- [ ] Write failing refresh tests for unexpired passthrough, refresh inside skew window, new-token replacement, omitted-token preservation, invalid grant, transient OAuth error, malformed response, and token-free captured logs.
- [ ] Write failing MIME tests that decode standard Base64 and compare the original subject/body/recipient/From headers and a small PDF attachment.
- [ ] Write failing send tests for exact endpoint/headers/body, `202` ID-less receipt, oversized local rejection, 400, 401, 403, 413, 429 with valid/invalid `Retry-After`, and provider 5xx.
- [ ] Write failing transport tests: connect failure is temporary; write/read timeout and remote-protocol failure are delivery unknown; each case makes one send request at most.
- [ ] Implement refresh rotation and require PR 1's service to persist the returned payload before send without changing that service.
- [ ] Implement MIME send with no automatic retries.
- [ ] Run:

  ```bash
  cd backend
  uv run python -m unittest discover -s tests -p 'test_microsoft_mail_provider.py' -v
  ```

  Expected: `OK`; all network interactions are mocked; retry-count assertions remain one or zero.

- [ ] Commit: `feat: send Outlook mail through Microsoft Graph`

## Task 4: Prove the Existing API Works Unchanged

**Files:**

- Modify: `backend/tests/test_mail_connection_router.py`

- [ ] Add a test where `POST /api/mail-connections/microsoft/authorize` returns exactly `{authorization_url}` using the unchanged route.
- [ ] Add a callback test that consumes PR 1's state, stores a Microsoft connection, and redirects to the original safe return path.
- [ ] Add a Microsoft `error=access_denied` callback test that consumes state, makes zero token calls, discards `error_description`, and redirects with `mail_oauth_denied`.
- [ ] Assert the list item has the unchanged fields and `provider = "microsoft"`.
- [ ] Assert default switching, disconnect, and `POST /api/send` use the unchanged generic routes and `mail_connection_id` field.
- [ ] Assert all provider errors retain PR 1's nested envelope and fixed HTTP mapping.
- [ ] Assert no Microsoft token, Graph profile ID, scope list, or credential metadata appears in public JSON.
- [ ] Run:

  ```bash
  cd backend
  uv run python -m unittest discover -s tests -p 'test_mail_connection_router.py' -v
  ```

  Expected: `OK` without edits to router/service/repository files.

- [ ] Commit: `test: cover Microsoft through generic mail APIs`

## Task 5: Add Microsoft Login and Provider Presentation

**Files:**

- Modify: `frontend/lib/appAuthProviders.ts`
- Modify: `frontend/lib/appAuthProviders.test.ts`
- Modify: `frontend/lib/mail-connections/providers.ts`
- Modify: `frontend/lib/mail-connections/providers.test.ts`
- Create: `frontend/components/provider-icons/MicrosoftLogo.tsx`
- Create: `frontend/components/provider-icons/MicrosoftLogo.test.tsx`
- Modify: `frontend/components/provider-icons/MailProviderLogo.tsx`
- Modify: `frontend/components/auth/AppLoginPanel.test.tsx`
- Modify: `frontend/components/mail-connections/SendingAccountsView.test.tsx`

Add the app-login registry entry:

```ts
{
  id: "microsoft",
  supabaseProvider: "azure",
  label: "Microsoft",
  scopes: "email",
}
```

Add the mail-provider presentation entry:

```text
provider key: microsoft
display name: Outlook / Microsoft 365
account noun: Outlook account
connect label: Connect Outlook
reconnect label: Reconnect Outlook
```

- [ ] Write failing app-login tests for two buttons, Supabase provider `azure`, scope exactly `email`, shared `/auth/callback`, provider-specific loading state, and absence of `offline_access`, `Mail.Send`, or Graph scopes.
- [ ] Write failing presentation tests for the exact label/copy/logo and generic components rendering a Microsoft connection without Outlook-specific branches.
- [ ] Write failing settings tests that offer Gmail and Outlook, call `/api/mail-connections/microsoft/authorize`, reconnect Microsoft through the same action, and render Microsoft as default/selected.
- [ ] Add the Microsoft logo and registry entries. The existing login panel, settings screen, card, and sender picker must discover them from registries.
- [ ] Do not edit the generic mail API client, shared state provider, sender picker, `OutreachForm`, or Supabase callback route.
- [ ] Run:

  ```bash
  npm --prefix frontend run test -- \
    lib/appAuthProviders.test.ts \
    lib/mail-connections/providers.test.ts \
    components/provider-icons/MicrosoftLogo.test.tsx \
    components/auth/AppLoginPanel.test.tsx \
    components/mail-connections/SendingAccountsView.test.tsx
  ```

  Expected: all targeted tests pass.

- [ ] Commit: `feat: add Microsoft login and Outlook presentation`

## Task 6: Configure Supabase, Entra, Local Dev, and Policy Copy

**Files:**

- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `supabase/config.toml`
- Modify: `scripts/dev.mjs`
- Modify: `scripts/dev.test.mjs`
- Modify: `README.md`
- Modify: `frontend/app/privacy/page.tsx`
- Modify: `frontend/app/terms/page.tsx`

Add environment entries:

```dotenv
SUPABASE_AUTH_AZURE_CLIENT_ID=your_entra_signin_client_id
SUPABASE_AUTH_AZURE_SECRET=your_entra_signin_client_secret

MICROSOFT_MAIL_CLIENT_ID=your_entra_mail_client_id
MICROSOFT_MAIL_CLIENT_SECRET=your_entra_mail_client_secret
MICROSOFT_MAIL_TENANT=common
MICROSOFT_MAIL_REDIRECT_URI=http://localhost:3000/api/mail-connections/microsoft/callback
```

Only the backend container receives `MICROSOFT_MAIL_*`; never expose a mail client secret through `NEXT_PUBLIC_*`.

PR 2 is configuration-gated at startup, not hidden at runtime. Compose requires all Azure identity and Microsoft mail credentials with `:?`; `backend/config.py` also rejects all-absent and partial mail configuration. This matches the unconditionally rendered login/connect entries and prevents a visible provider whose backend is disabled.

Update the existing `[api]` section:

```toml
external_url = "http://localhost:54321"
```

Add:

```toml
[auth.external.azure]
enabled = true
client_id = "env(SUPABASE_AUTH_AZURE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_AZURE_SECRET)"
redirect_uri = "http://localhost:54321/auth/v1/callback"
```

Keep hosted Supabase Site URL `https://outreachyr.com` and exact Redirect URLs `https://outreachyr.com/auth/callback` and `http://localhost:3000/auth/callback`. The provider callbacks belong in Entra registrations, not Supabase's application Redirect URL list.

- [ ] Write failing dev-script tests that normalize the Azure/Supabase local callback to `localhost`, derive the connector callback at the frontend origin, and never print secret values.
- [ ] Update the dev script to print all three Microsoft redirect layers distinctly.
- [ ] Update privacy copy: encrypted access/refresh credentials, Microsoft account ID/name/address, user-triggered message/attachment transfer to Graph, no inbox read, and local deletion on disconnect.
- [ ] Update terms: authorization to send, anti-spam/organizational policies, throttling/revocation, unsupported shared/send-as mailboxes, and `202` not guaranteeing delivery.
- [ ] Document exact Entra and Supabase registration steps below, the 4 MB Graph request limit, consent troubleshooting, Microsoft-side consent removal, and verification commands.
- [ ] Run:

  ```bash
  npm run test:dev-script
  docker compose --env-file .env.example config --quiet
  ```

  Expected: Node tests pass, Compose validates, and printed values contain no secrets.

- [ ] Commit: `docs: configure Microsoft identity and mail OAuth`

## Entra Registration Checklist

Create two separate Web registrations. For both, select “Accounts in any organizational directory and personal Microsoft accounts.” Disable implicit/hybrid and public-client flows.

### `Outreachyr Sign-in`

- [ ] Redirect URIs:
  - `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
  - `http://localhost:54321/auth/v1/callback`
- [ ] No `Mail.Send` or application permissions.
- [ ] Configure Supabase provider `azure` with this registration's client ID/secret.
- [ ] Frontend additional scope is only `email`.
- [ ] Add the optional `xms_edov` claim so verified-domain email state is available to Supabase.

### `Outreachyr Mail Sender`

- [ ] Redirect URIs:
  - `https://outreachyr.com/api/mail-connections/microsoft/callback`
  - `http://localhost:3000/api/mail-connections/microsoft/callback`
- [ ] Delegated permissions: `User.Read` and `Mail.Send`.
- [ ] Runtime scope: `offline_access`.
- [ ] No inbox, shared-mailbox, send-as, or application permission.
- [ ] Publisher/domain verification is a launch gate for the multitenant mail app.
- [ ] Keep initial client-secret lifetime under 12 months and record a rotation owner/date. Certificate assertions are a later hardening task, not part of this PR.

Keep the three redirect layers distinct:

1. Entra sign-in app to Supabase: `/auth/v1/callback` on Supabase.
2. Supabase to Outreachyr app login: `/auth/callback` on Outreachyr.
3. Entra mail app to the FastAPI rewrite: `/api/mail-connections/microsoft/callback` on Outreachyr.

## Task 7: Full Verification and Stack Integrity

- [ ] Run backend verification:

  ```bash
  cd backend
  uv lock --check
  uv sync --locked --group dev
  uv run python -m unittest discover -s tests -p 'test_*.py' -v
  uv run ruff check .
  uv run ruff format --check .
  uv run ty check
  ```

  Expected: unittest ends in `OK`; all static checks exit `0`.

- [ ] Run frontend/root verification:

  ```bash
  cd ../frontend
  npm ci
  npm run test
  npm run typecheck
  npm exec -- eslint .
  npm run build
  cd ..
  npm ci
  npm run test:dev-script
  docker compose --env-file .env.example config --quiet
  git diff --check
  ```

  Expected: all tests/checks pass; production build succeeds; whitespace check is silent.

- [ ] Enforce the foundation scope guard:

  ```bash
  git diff --name-only codex/provider-neutral-mail-connections...HEAD -- \
    backend/mail_connections/protocols.py \
    backend/mail_connections/errors.py \
    backend/mail_connections/registry.py \
    backend/mail_connections/repository.py \
    backend/mail_connections/crypto.py \
    backend/mail_connections/service.py \
    backend/mail_connections/delivery.py \
    backend/mail_connections/router.py \
    backend/mail_connections/providers/google.py \
    backend/migrations \
    frontend/lib/mail-connections/types.ts \
    frontend/lib/mail-connections/api.ts \
    frontend/lib/mail-connections/errors.ts \
    frontend/lib/mail-connections/selectors.ts \
    frontend/lib/mail-connections/sendPayload.ts \
    frontend/components/mail-connections/MailConnectionsProvider.tsx \
    frontend/components/mail-connections/MailConnectionCard.tsx \
    frontend/components/mail-connections/ConnectMailboxButton.tsx \
    frontend/components/mail-connections/SenderSelect.tsx \
    frontend/components/OutreachForm.tsx \
    frontend/app/auth/callback/route.ts
  ```

  Expected: no output.

- [ ] Confirm no migration was added:

  ```bash
  git diff --name-only codex/provider-neutral-mail-connections...HEAD -- backend/migrations
  ```

  Expected: no output.

## Manual Acceptance Matrix

- [ ] Sign in through Microsoft without granting `Mail.Send`.
- [ ] Sign in through Google, then connect Microsoft; app identity provider and mail provider remain independent.
- [ ] Connect a personal `outlook.com` mailbox.
- [ ] Connect a Microsoft 365 work mailbox.
- [ ] Exercise a tenant where user consent is restricted and confirm the permission error is actionable.
- [ ] Send plain text and a small PDF; verify From identity and Sent Items.
- [ ] Switch between Gmail and Microsoft accounts without changing the default unintentionally.
- [ ] Force token expiry and prove refresh rotation is persisted encrypted before send.
- [ ] Revoke Microsoft consent and prove the next send becomes `reconnect_required`.
- [ ] Exercise 429 and verify `Retry-After` reaches the client.
- [ ] Exercise an ambiguous send timeout and verify no automatic retry/duplicate.
- [ ] Attempt a payload above 4 MB and verify no Graph request is made.
- [ ] Re-run a Gmail connect and Gmail send to prove PR 1 behavior is unchanged.

## Rollout

- [ ] Merge and deploy PR 1 first.
- [ ] Create and publisher-verify both Entra registrations.
- [ ] Configure Supabase Azure identity callbacks and Outreachyr `/auth/callback` allowlists.
- [ ] Add direct mail secrets and callback to staging before deploying PR 2.
- [ ] Run personal, work, restricted-consent, refresh, revoke, attachment, and Gmail-regression canaries.
- [ ] Deploy PR 2 only after configuration is present; all-absent and partial Microsoft configuration both fail startup, so the UI cannot advertise a disabled provider.
- [ ] Monitor connect success, token refresh, accepted sends, 429, reauth, permission, and delivery-unknown counts grouped by provider. Do not log message metadata or credentials.
- [ ] Roll back by deploying the PR 1 application revision. Microsoft rows remain encrypted and inert; no database rollback is required.

## Restacking After PR 1 Merge

- [ ] Record the reviewed PR 1 tip before its merge.
- [ ] Fetch current `main` and rebase only the Outlook commits. If `<reviewed-pr1-tip>` is the foundation tip from which this branch was created, run:

  ```bash
  git fetch origin
  git rebase --onto origin/main <reviewed-pr1-tip> codex/outlook-mail-connector
  ```

  This works after a squash merge because the old foundation commits are excluded by the explicit boundary.

- [ ] Push the restacked branch with `git push --force-with-lease` only after the full verification passes.
- [ ] Retarget PR 2 to `main`.
- [ ] Run the complete verification and manual Gmail regression again.
- [ ] Confirm the PR diff contains only the exact PR 2 file scope above.
- [ ] Update the PR description to say PR 1 is merged and link the final foundation commit.

## PR 2 Acceptance Checklist

- [ ] Microsoft identity login requests identity only.
- [ ] Outlook mail consent is separate, direct, PKCE-protected, and send-only.
- [ ] Both personal and organizational accounts connect through `/common`.
- [ ] Refresh-token rotation is encrypted and persisted before sending.
- [ ] Graph receives standard Base64 MIME and only one request per message.
- [ ] Ambiguous delivery is never automatically retried.
- [ ] Existing connection APIs, storage, settings, selection, and send payload are unchanged.
- [ ] Gmail login, connect, select, send, refresh, and disconnect still pass.
- [ ] PR 2 contains no migration and no foundation refactor.

## Current Official References

- [Microsoft authorization-code flow with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft supported account types](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types)
- [Microsoft Graph `sendMail`](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [Microsoft Graph delegated permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Microsoft Graph throttling](https://learn.microsoft.com/en-us/graph/throttling)
- [Microsoft refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
- [Supabase Azure social login](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase social-provider token behavior](https://supabase.com/docs/guides/auth/social-login)
