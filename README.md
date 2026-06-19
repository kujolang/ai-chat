# AI Chat

AI Chat is a local showcase app for provider-gated chat workflows, offline fixtures, structured conversation behavior, and reviewable AI interaction boundaries.

The app boots locally, persists chats/settings in SQLite, and uses browser localStorage only for client cache plus app token/session metadata.

It is intentionally small enough to clone, inspect, and extend without losing the thread.

For agent and contributor guidance, including canonical examples and search exclusions, see `AGENTS.md`.

## Who This Is For

This project is for end users and teams who want one local web app to:

- Manage multiple provider profiles in one place
- Compare responses across providers and models
- Keep chat history durable on disk
- Use voice-to-text input workflows

## Core Features

- Chat workspace
	- Create, rename, pin, archive, delete, and search chats
- Provider profiles
	- Store provider profiles and model suggestions in Settings
	- API keys are encrypted before being stored in SQLite
- Multi-pane comparisons
	- Add multiple panes per chat with per-pane profile/model selection
	- Broadcast one prompt to all panes
- Streaming and thinking UI
	- Live assistant text streaming via SSE
	- Thinking/reasoning deltas shown when available
- Transcription support
	- Audio upload proxy endpoint for OpenAI-compatible transcription APIs
	- Browser recording button to send audio and insert transcript into the composer

## What This Repo Is Not

- Not a guarantee of correct model answers or model quality
- Not a replacement for human review
- Not a production-certified chat platform or universal enterprise product out of the box
- Not a fully audited security/release program
- Not unrestricted live-provider access by default

Use the app as a clear boundary for chat workflows, not as a promise of correctness.

## Requirements

- Node.js 18+
- npm 9+
- Kujo binary available locally
- AI SDK directory available locally (for example: `/path/to/ai-sdk/src`)

## Project Structure

- Frontend
	- `public/index.html`
	- `public/app.css`
	- `public/app.js`
- Backend
	- `server.js`
	- `lib/server-runtime.js`
- Bridge files
	- `bridge_chat.kujo`
- External SDK files are loaded from `AI_SDK_PATH` (not vendored in this repository):
	- `ai_sdk.kujo`
	- `providers.kujo`
- Database utilities
	- `scripts/backup-db.js`
	- `scripts/vacuum-db.js`
	- `scripts/smoke-test.js`
- Review and release references
	- `docs/API_CONTRACT.md`
	- `docs/RELEASE_CHECKLIST.md`
	- `docs/SECURITY_HARDENING_CHECKLIST.md`
	- `docs/SECURITY_OPERATIONS.md`

## Environment Configuration

Use `.env.example` as your baseline and set:

- KUJO_BIN
- AI_SDK_PATH
- AI_CHAT_HOST
- PORT
- DB_PATH
- DB_BACKUP_DIR
- ENCRYPTION_SECRET
- API_AUTH_TOKEN
- TRUST_PROXY

Offline fixture mode is supported in the bridge and smoke workflow for safe local validation without live provider credentials.

Security note:

- Use a long, random ENCRYPTION_SECRET in production.
- Changing ENCRYPTION_SECRET after data is encrypted will prevent decrypting previously saved API keys.
- Set API_AUTH_TOKEN and keep it secret. The browser app stores this token locally with an expiry (default 30 days) using an in-app auth modal.
- Set AI_CHAT_HOST to `127.0.0.1` for the default reviewed showcase path; override it explicitly only if you intend to expose a broader listener.
- For custom providers, set ALLOWED_CUSTOM_PROVIDER_HOSTS to an explicit host allowlist.
- Set TRUST_PROXY=1 only when AI Chat runs behind a trusted reverse proxy that sets `X-Forwarded-*` headers.
- Use RATE_LIMIT_MAX_BUCKETS to cap in-memory rate-limit tracker growth under high-cardinality traffic.
- Use STREAM_REQUEST_TIMEOUT_MS to tune long-running upstream streaming requests.
- Live provider and transcription requests are optional and require the configured provider/API-key path.

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
ENCRYPTION_SECRET=replace_with_strong_secret \
API_AUTH_TOKEN=replace_with_strong_token \
KUJO_BIN=/absolute/path/to/kujo \
AI_SDK_PATH=/path/to/ai-sdk/src \
AI_CHAT_HOST=127.0.0.1 \
PORT=4173 \
npm run dev
```

3. Open in browser

```text
http://127.0.0.1:4173
```

4. Enter API_AUTH_TOKEN once in the in-app auth modal, then choose how many days to remember it.
5. In Settings, add provider API keys and profile defaults
6. If you want a safe provider-free smoke path, use offline fixture mode in the bridge/smoke workflow.

## First-Run User Setup

1. Open Settings.
2. Add or edit provider profiles.
3. Enter API keys for each profile you plan to use.
4. Set model suggestions (comma-separated) per profile.
5. Create a new chat and add panes for side-by-side comparison.
6. Send a prompt with broadcast enabled or disabled.

## API Endpoints

- GET /api/health
- GET /api/providers
- GET /api/state
- PUT /api/state
- POST /api/chat
- POST /api/chat/stream
- POST /api/transcribe

## Streaming Behavior

The streaming endpoint emits SSE events from POST /api/chat/stream:

- token: incremental assistant text chunks
- thinking: incremental reasoning/thinking chunks (provider dependent)
- done: final metadata and usage payload
- error: stream error payload

If a provider/model does not emit reasoning deltas, thinking output remains empty.

The offline fixture path is verified in the local smoke workflow and is the safest path for docs/CI-style checks.

## Database Operations

Create a backup:

```bash
npm run db:backup
```

Run maintenance VACUUM:

```bash
npm run db:vacuum
```

Backups are written under DB_BACKUP_DIR.

## Validation

Run smoke tests (server must already be running):

```bash
npm run smoke
```

Smoke test environment options:

- Uses `API_AUTH_TOKEN` by default for auth, or `SMOKE_API_TOKEN` if set
- Uses `PORT` by default for endpoint target, or `SMOKE_BASE_URL` / `SMOKE_HOST` / `SMOKE_PORT`

Example:

```bash
API_AUTH_TOKEN=replace_with_strong_token PORT=4173 npm run smoke
```

Expected smoke output:

```text
health 200
providers 200 4
state 200
chat 200
smoke checks passed against http://127.0.0.1:4173
```

Manual SDK check:

```bash
cd /path/to/ai-sdk

AI_CHAT_ROOT=/absolute/path/to/ai-chat
BRIDGE_PAYLOAD='{"provider_id":"openai","api_key":"x","offline_fixture":true,"messages":[{"role":"user","content":"hello"}]}'

/absolute/path/to/kujo run "$AI_CHAT_ROOT/bridge_chat.kujo" --interpreter -- --payload "$BRIDGE_PAYLOAD"
```

Expected result: a JSON response with `"ok": true` and non-empty `"output_text"`.

Unit test check:

```bash
npm test
```

CI gates on push/PR to `main`:

- `npm test`
- `npm audit --omit=dev`

## Deployment Notes

- Run behind a reverse proxy (for TLS and access controls) if you deploy beyond local use.
- Restrict server access to trusted networks/users.
- Back up the SQLite database regularly.
- Rotate provider API keys periodically.
- Keep ENCRYPTION_SECRET secure and stable.
- Confirm /api/health shows ai_sdk_available=true before sending live-provider chat requests.
- Confirm /api/health shows auth_configured=true before exposing the service.
- Confirm AI_CHAT_HOST is explicitly set if you need a bind address other than `127.0.0.1`.
- Set ALLOWED_ORIGIN and ALLOWED_HOSTS for deployment-specific origin/host enforcement.
- Set TRUST_PROXY=1 only behind a trusted reverse proxy; leave it disabled for direct local serving.

Security operations reference:

- docs/SECURITY_OPERATIONS.md

Contract and release governance:

- docs/API_CONTRACT.md
- docs/RELEASE_CHECKLIST.md
- docs/SECURITY_HARDENING_CHECKLIST.md
- CHANGELOG.md

## Additional Setup Guide

For a standalone setup and install reference, see:

- SETUP_AND_INSTALL.md
