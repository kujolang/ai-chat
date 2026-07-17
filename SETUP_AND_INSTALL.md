# AI Chat Setup and Install Guide

This guide is a dedicated, end-user focused setup reference for running AI Chat locally.

## 1. Prerequisites

- Node.js 18+
- npm 9+
- Kujo binary built and available on your machine
- Playwright Chromium installed locally for browser tools

## 2. Configure Environment

Copy values from `.env.example` and define these variables in your shell or environment file:

- KUJO_BIN
- AI_SDK_PATH
- PORT
- DB_PATH
- DB_BACKUP_DIR
- ENCRYPTION_SECRET
- API_AUTH_TOKEN
- TRUST_PROXY
- WATCHDOG_PROXY_URL
- WATCHDOG_PROXY_TOKEN_FILE
- WATCHDOG_DIRECT_STREAMING
- WATCHDOG_TELEMETRY_URL
- WATCHDOG_API_TOKEN_FILE
- MAX_TOOL_ROUNDS
- MAX_TOOL_CALLS_PER_REQUEST
- WEB_SEARCH_MAX_RESULTS

`AI_SDK_PATH` must point to a directory that contains both `ai_sdk.kujo` and `providers.kujo`.

Recommended local defaults:

```bash
AI_SDK_PATH=/path/to/ai-sdk/src
PORT=4173
DB_PATH=/absolute/path/to/ai-chat/data/ai_chat.db
DB_BACKUP_DIR=/absolute/path/to/ai-chat/data/backups
ENCRYPTION_SECRET=<long-random-secret>
API_AUTH_TOKEN=<long-random-token>
TRUST_PROXY=0
WATCHDOG_PROXY_URL=http://127.0.0.1:7700/proxy/v1
WATCHDOG_PROXY_TOKEN_FILE=/absolute/path/to/watchdog-proxy-token
WATCHDOG_DIRECT_STREAMING=1
WATCHDOG_TELEMETRY_URL=http://127.0.0.1:7700/api/telemetry/requests
WATCHDOG_API_TOKEN_FILE=
MAX_TOOL_ROUNDS=8
MAX_TOOL_CALLS_PER_REQUEST=24
WEB_SEARCH_MAX_RESULTS=5
BROWSER_ENABLED=0
BROWSER_HEADLESS=1
BROWSER_SESSION_TTL_MS=900000
BROWSER_MAX_SESSIONS=4
BROWSER_MAX_SESSIONS_PER_CHAT=2
BROWSER_MAX_ACTIONS_PER_REQUEST=12
BROWSER_MAX_ACTIONS_PER_SESSION=30
BROWSER_NAVIGATION_TIMEOUT_MS=15000
BROWSER_MAX_TEXT_CHARS=30000
BROWSER_MAX_RESULT_BYTES=131072
BROWSER_ARTIFACT_DIR=/absolute/path/to/ai-chat/data/tool-artifacts/browser
BROWSER_ACTION_POLICY=read-only
```

Important security behavior:

- API keys are encrypted using `ENCRYPTION_SECRET`.
- If you change `ENCRYPTION_SECRET` later, existing encrypted API keys cannot be decrypted.
- API routes require `API_AUTH_TOKEN`; the web UI shows an in-app auth modal once and stores it locally with an expiry (default 30 days).
- API routes reject unauthenticated requests before parsing JSON bodies, return JSON error envelopes for malformed authenticated JSON, and send `Cache-Control: no-store`.
- `TRUST_PROXY` defaults to disabled. Enable it only behind a trusted reverse proxy so rate limiting, origin checks, HSTS detection, and audit IPs may use `X-Forwarded-*` headers.
- The Watchdog profile is the reviewed local-proxy exception to the HTTPS-only custom-provider policy. It must exactly match `WATCHDOG_PROXY_URL`, remain on loopback, and reads its bearer token from `WATCHDOG_PROXY_TOKEN_FILE`.
- Watchdog keeps the upstream provider key; AI Chat never stores or receives that upstream key. SignalBox and AI Chat telemetry can therefore share one Watchdog database while remaining distinguishable by source and correlation fields.
- For true live Watchdog chat streaming, keep an API-key-backed custom Ollama profile with the same model in AI Chat and leave `WATCHDOG_DIRECT_STREAMING=1`. AI Chat uses that direct connection for the stream, then posts non-content completion metrics to `WATCHDOG_TELEMETRY_URL`. When Watchdog protects `/api/*` with token auth, set `WATCHDOG_API_TOKEN_FILE` to a readable file containing `WDG_API_AUTH_TOKEN`; the proxy token file cannot replace this separate API credential unless both Watchdog roles intentionally use the same value. Rejected or unreachable telemetry produces a sanitized server warning without failing the chat.

## 3. Install Dependencies

From the project root:

```bash
npm install
npx playwright install chromium
```

`better-sqlite3` includes a native module and must be built for the active Node.js
runtime. If you switch Node.js versions with `nvm` or see a
`NODE_MODULE_VERSION` mismatch when starting the app, run this while that version
is active:

```bash
npm run rebuild:native
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
- SSE and NDJSON providers are consumed incrementally; active data resets the stream idle timeout.
- Partial responses are retained and automatically resumed after token limits, unexpected closes, and bounded transient failures.
- Chat state is persisted independently from provider streaming through bounded incremental writes, so a large historical chat corpus is never resent as one save request.
- The composer displays the durable-save state. Do not close the page while it says `Saving…` or `Not saved`; failed writes remain cached locally and retry automatically.

## 7. Voice and Transcription

- Use the Whisper Record button in the composer to capture audio.
- The backend forwards transcription requests through POST /api/transcribe.
- Transcript text is inserted into the composer when successful.

## 8. Tools

The Web Search preset is executable through AI Chat's provider-neutral tool runtime. For the local-first path, run SearXNG with JSON output enabled and set `SEARXNG_BASE_URL` (loopback HTTP or HTTPS). With `WEB_SEARCH_BACKEND=auto`, AI Chat prefers that adapter; without it, the runtime uses the API key from a custom Ollama profile and Ollama Web Search. You can force `searxng` or `ollama` with `WEB_SEARCH_BACKEND`. The active chat provider only requests `web_search`; it never selects the backend.

Search calls accept `query`, `max_results`, optional `domains`, and optional `freshness`, and are bounded by `MAX_TOOL_ROUNDS`, `MAX_TOOL_CALLS_PER_REQUEST`, and `WEB_SEARCH_MAX_RESULTS`. Results return to the model as provider-compatible tool messages so it can produce the final answer.

Set `BROWSER_ENABLED=1` after installing Chromium to enable `browser_open`, `browser_snapshot`, `browser_act`, `browser_close`, and the saved-chat compatibility adapter `browser_use`. Health and Settings show browser presets as unavailable when the executable is missing, rather than forwarding a schema that cannot run. If startup can find Playwright but a tool call cannot launch Chromium, the tool returns `browser_not_configured` with the installation command.

Browser sessions use a fresh context without the user's browser profile and are scoped to the current chat. The runtime limits sessions, actions, lifetime, navigation time, extracted text, result payloads, and screenshots; expired/abandoned sessions and shutdown resources are closed automatically. Only HTTP/HTTPS public destinations are allowed. DNS results are pinned for each intercepted request, redirects are revalidated, and localhost, private/link-local/multicast, metadata, unsafe-scheme, download, file, arbitrary-JavaScript, and network-write paths fail closed.

The default `BROWSER_ACTION_POLICY=read-only` automatically permits public navigation, snapshots/text extraction, scrolling, back, screenshots, and safe link traversal. Typing and potentially consequential clicks return `tool_approval_required`. `development` is a controlled local-testing switch for non-sensitive typing and controls; sensitive fields and purchase/login/delete/submit/download/permission-style targets remain approval-gated. Do not enable it globally.

## 9. Health and Smoke Validation

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

## 10. Backup and Maintenance

Create a backup:

```bash
npm run db:backup
```

Run SQLite VACUUM:

```bash
npm run db:vacuum
```

Backups are written to `DB_BACKUP_DIR`.

## 11. Deployment Usage Recommendations

- Put the app behind TLS/reverse proxy infrastructure if you deploy beyond local use.
- Limit access to trusted users and networks.
- Set `TRUST_PROXY=1` only when the proxy is trusted and strips untrusted client-supplied `X-Forwarded-*` headers.
- Back up DB_PATH on a schedule.
- Keep ENCRYPTION_SECRET stable and protected.
- Rotate provider API keys on a regular cadence.
