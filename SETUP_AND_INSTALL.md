# AI Chat Setup and Install Guide

This guide is a dedicated, end-user focused setup reference for running AI Chat locally.

## 1. Prerequisites

- Node.js 18+
- npm 9+
- Kujo binary built and available on your machine

## 2. Configure Environment

Copy values from `.env.example` and define these variables in your shell or environment file:

- KUJO_BIN
- AI_SDK_PATH
- PORT
- DB_PATH
- DB_BACKUP_DIR
- ENCRYPTION_SECRET
- API_AUTH_TOKEN

`AI_SDK_PATH` must point to a directory that contains both `ai_sdk.kujo` and `providers.kujo`.

Recommended local defaults:

```bash
AI_SDK_PATH=/path/to/ai-sdk/src
PORT=4173
DB_PATH=/absolute/path/to/ai-chat/data/ai_chat.db
DB_BACKUP_DIR=/absolute/path/to/ai-chat/data/backups
ENCRYPTION_SECRET=<long-random-secret>
API_AUTH_TOKEN=<long-random-token>
```

Important security behavior:

- API keys are encrypted using `ENCRYPTION_SECRET`.
- If you change `ENCRYPTION_SECRET` later, existing encrypted API keys cannot be decrypted.
- API routes require `API_AUTH_TOKEN`; the web UI shows an in-app auth modal once and stores it locally with an expiry (default 30 days).

## 3. Install Dependencies

From the project root:

```bash
npm install
```

## 4. Start the Application

Example launch command:

```bash
ENCRYPTION_SECRET=replace_with_strong_secret \
API_AUTH_TOKEN=replace_with_strong_token \
KUJO_BIN=/absolute/path/to/kujo \
AI_SDK_PATH=/path/to/ai-sdk/src \
AI_CHAT_HOST=127.0.0.1 \
PORT=4173 \
npm run dev
```

Optional SDK shell check:

```bash
cd /path/to/ai-sdk

AI_CHAT_ROOT=/absolute/path/to/ai-chat
BRIDGE_PAYLOAD='{"provider_id":"openai","api_key":"x","offline_fixture":true,"messages":[{"role":"user","content":"hello"}]}'

/absolute/path/to/kujo run "$AI_CHAT_ROOT/bridge_chat.kujo" --interpreter -- --payload "$BRIDGE_PAYLOAD"
```

Expected result: a JSON response with `"ok": true` and non-empty `"output_text"`.

Open:

```text
http://127.0.0.1:4173
```

## 5. First-Time In-App Setup

1. Open Settings.
2. Add or edit provider profiles.
3. Enter API keys for the providers you want to use.
4. Set model suggestions for each profile (comma-separated).
5. Create a chat and add panes if you want side-by-side comparisons.
6. Send prompts using broadcast mode or a single pane.

## 6. How Streaming Works

- The app uses POST /api/chat/stream for live responses.
- Token updates appear incrementally in the assistant message.
- Thinking/reasoning appears only when the upstream provider emits those deltas.

## 7. Voice and Transcription

- Use the Whisper Record button in the composer to capture audio.
- The backend forwards transcription requests through POST /api/transcribe.
- Transcript text is inserted into the composer when successful.

## 8. Health and Smoke Validation

The app provides these key endpoints:

- GET /api/health
- GET /api/providers
- GET /api/state

Run smoke checks after server startup:

```bash
npm run smoke
```

Smoke test notes:

- Requires app token auth; uses `API_AUTH_TOKEN` by default, or `SMOKE_API_TOKEN`
- Targets `http://127.0.0.1:${PORT}` by default
- Override target with `SMOKE_BASE_URL` or `SMOKE_HOST` / `SMOKE_PORT`

Examples:

```bash
API_AUTH_TOKEN=replace_with_strong_token PORT=4173 npm run smoke
SMOKE_BASE_URL=http://127.0.0.1:5000 SMOKE_API_TOKEN=replace_with_strong_token npm run smoke
```

Run unit tests:

```bash
npm test
```

## 9. Backup and Maintenance

Create a backup:

```bash
npm run db:backup
```

Run SQLite VACUUM:

```bash
npm run db:vacuum
```

Backups are written to `DB_BACKUP_DIR`.

## 10. Deployment Usage Recommendations

- Put the app behind TLS/reverse proxy infrastructure if you deploy beyond local use.
- Limit access to trusted users and networks.
- Back up DB_PATH on a schedule.
- Keep ENCRYPTION_SECRET stable and protected.
- Rotate provider API keys on a regular cadence.
