# AI Chat

[![Version](https://img.shields.io/badge/version-1.0.0-black)](https://github.com/kujolang/ai-chat)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![built with Kujo](https://img.shields.io/badge/built%20with-Kujo-white.svg)](https://github.com/kujolang/kujo)

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
	- Open to a welcome screen at `/`, then use stable opaque `/c/{routeId}` links for bookmarkable chats without exposing internal chat IDs
	- Render chat titles with the locally bundled Departure Mono font; no font CDN request is required for it
	- Persist changed chats, panes, and messages incrementally with visible save status
- Provider profiles
	- Store provider profiles and model suggestions in Settings
	- Reorder provider cards and their model rows with drag and drop
	- Collapse provider cards while keeping their order and model count visible
	- Choose the model/provider that every regular new chat starts with
	- API keys are encrypted before being stored in SQLite
- Model picker
	- Search the full configured model catalog in real time from the composer
	- Scroll long result lists in a styled, keyboard-friendly dropdown
- Seed OpenRouter and Ollama Cloud (Watchdog) with the July 17, 2026 catalog snapshot; existing profiles receive any newly cataloged suggestions without replacing their current models, except the intentionally curated `Watchdog / OpenRouter (TUD)` benchmark profile
- Multi-pane comparisons
	- Add multiple panes per chat with per-pane profile/model selection
	- Broadcast one prompt to all panes
	- Save an ordered pane/model arrangement as a reusable pane profile and start new chats from it
- Scheduled chat automations
	- Save prompts that run daily, on weekdays, or weekly in a selected local timezone
	- Choose the provider/model and optional project for each automation
	- Run an automation immediately, pause/resume it, and reopen durable chats from previous runs
- Streaming and thinking UI
	- Live assistant text streaming via SSE
	- Thinking/reasoning deltas shown when available
- Agent instructions
	- Apply the repository-owned, non-editable system prompt from `SYSTEM_PROMPT.md` to every model request; change it only by editing that Markdown file and restarting the server
	- Save your preferred name in General settings so chat models can address you naturally
	- Set persistent, AGENTS.md-compatible custom instructions once in Settings; add matching comma-separated model groups when a model needs specialized guidance
	- Enable or disable each model-specific instruction group without deleting its saved text
- Transcription support
	- Audio upload proxy endpoint for OpenAI-compatible transcription APIs
	- Browser recording button to send audio and insert transcript into the composer
- Bounded tool execution
	- Reorder and collapse Tool cards in Settings while preserving their configured execution order
	- Execute the provider-neutral `web_search` contract with local SearXNG or Ollama Web Search and return citation-grade sourced results with canonical URLs, timestamps, and explicit capability metadata
	- Execute provider-neutral browser tools in fresh Playwright Chromium contexts with scoped sessions, bounded artifacts, network isolation, scoped approvals, and a read-only default policy
	- Store and forward other OpenAI-compatible function schemas; unsupported calls still stop explicitly

## What This Repo Is Not

- Not a guarantee of correct model answers or model quality
- Not a replacement for human review
- Not a production-certified chat platform or universal enterprise product out of the box
- Not a fully audited security/release program
- Not unrestricted live-provider access by default

Use the app as a clear boundary for chat workflows, not as a promise of correctness.

## Requirements

- Node.js 22.17.0 (use `nvm use`; this repo includes `.nvmrc`)
- npm 9+
- Kujo binary available locally
- AI SDK directory available locally (for example: `/path/to/ai-sdk/src`)
- Playwright-managed Chromium for local browser tools (`npx playwright install chromium`)

## Project Structure

- Frontend
	- `public/index.html`
	- `public/app.css`
	- `public/app.js`
- Backend
	- `server.js`
	- `lib/server-runtime.js`
- Fixed model instructions
	- `SYSTEM_PROMPT.md`
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
- WATCHDOG_PROXY_URL
- WATCHDOG_PROXY_TOKEN_FILE
- WATCHDOG_OPENROUTER_UPSTREAM_PROFILE
- WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE
- WATCHDOG_DIRECT_STREAMING
- WATCHDOG_TELEMETRY_URL
- WATCHDOG_API_TOKEN_FILE
- WATCHDOG_TELEMETRY_CONTENT_MODE
- MAX_TOOL_ROUNDS
- MAX_TOOL_CALLS_PER_REQUEST
- MAX_TOOL_CALLS_PER_ROUND
- MAX_TOOL_CONTEXT_CHARS
- WEB_SEARCH_MAX_RESULTS
- WEB_SEARCH_MAX_RESULT_BYTES
- WEB_SEARCH_BACKEND
- SEARXNG_BASE_URL
- WEB_SEARCH_TIMEOUT_MS
- WEB_SEARCH_CACHE_TTL_MS
- WEB_SEARCH_CACHE_MAX_ENTRIES
- AI_CHAT_SKILLS_ENABLED
- AI_CHAT_SKILL_ROOTS
- AI_CHAT_EXTRA_SKILL_ROOTS
- AI_CHAT_SKILLS_MAX_COUNT
- AI_CHAT_SKILLS_MAX_DEPTH
- AI_CHAT_SKILLS_MAX_READ_CHARS
- AI_CHAT_LOCAL_TOOLS_ENABLED
- AI_CHAT_LOCAL_WORKSPACE_ROOTS
- AI_CHAT_LOCAL_WRITE_ENABLED
- AI_CHAT_LOCAL_SHELL_ENABLED
- AI_CHAT_LOCAL_SHELL_ALLOWLIST
- AI_CHAT_LOCAL_MAX_READ_CHARS
- AI_CHAT_LOCAL_MAX_OUTPUT_CHARS
- AI_CHAT_LOCAL_MAX_ENTRIES
- AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS
- AI_CHAT_ACTIONS_ENABLED
- AI_CHAT_ACTION_MANIFEST_PATH
- AI_CHAT_ACTION_TIMEOUT_MS
- AI_CHAT_ACTION_MAX_RESULT_BYTES
- BROWSER_ENABLED
- BROWSER_HEADLESS
- BROWSER_SESSION_TTL_MS
- BROWSER_MAX_SESSIONS
- BROWSER_MAX_ACTIONS_PER_REQUEST
- BROWSER_MAX_ACTIONS_PER_SESSION
- BROWSER_NAVIGATION_TIMEOUT_MS
- BROWSER_MAX_TEXT_CHARS
- BROWSER_MAX_RESULT_BYTES
- BROWSER_ARTIFACT_DIR
- BROWSER_ALLOWED_HOSTS
- BROWSER_APPROVAL_TTL_MS
- BROWSER_ACTION_POLICY

Offline fixture mode is supported in the bridge and smoke workflow for safe local validation without live provider credentials.

Tool note: Web Search, Skill, Local, Action Adapter, and Browser presets are executable through AI Chat's provider-neutral tool runtime. `WEB_SEARCH_BACKEND=auto` prefers `SEARXNG_BASE_URL` when configured and otherwise uses an API-key-backed custom Ollama profile. Search results keep the stable `query` and `results` shape but now add canonical URLs, source domains, retrieval timestamps, optional upstream publication dates, explicit capability/policy metadata, and short read-only cache metadata for safer citations. Skill presets expose bounded read-only access to local `SKILL.md` manuals under configured skill roots, defaulting to common Codex, agent, and Claude skill folders. Local presets expose configured workspaces through explicit file and allowlisted command tools only when `AI_CHAT_LOCAL_TOOLS_ENABLED=1`; write and shell actions each require their own opt-in. Action Adapter presets call trusted loopback services declared in a manifest so document, MCP, plugin, or workflow capabilities can be added without giving the model arbitrary system access. See `docs/LOCAL_AGENT_CAPABILITIES.md` for the full capability matrix. With `BROWSER_ENABLED=1`, the stable browser contracts use local Playwright Chromium; the model provider never selects or sees that backend. Browser schemas are not advertised when Chromium is unavailable. Custom tools still require a registered executor.

Security note:

- Use a long, random ENCRYPTION_SECRET in production.
- Changing ENCRYPTION_SECRET after data is encrypted will prevent decrypting previously saved API keys.
- Set API_AUTH_TOKEN and keep it secret. The browser app stores this token locally with an expiry (default 30 days) using an in-app auth modal.
- Set AI_CHAT_HOST to `127.0.0.1` for the default reviewed showcase path; override it explicitly only if you intend to expose a broader listener.
- For custom providers, set ALLOWED_CUSTOM_PROVIDER_HOSTS to an explicit host allowlist.
- Set TRUST_PROXY=1 only when AI Chat runs behind a trusted reverse proxy that sets `X-Forwarded-*` headers.
- Use RATE_LIMIT_MAX_BUCKETS to cap in-memory rate-limit tracker growth under high-cardinality traffic.
- Use STREAM_REQUEST_TIMEOUT_MS to tune long-running upstream streaming requests.
- Use `WEB_SEARCH_TIMEOUT_MS`, `WEB_SEARCH_CACHE_TTL_MS`, and `WEB_SEARCH_CACHE_MAX_ENTRIES` to bound identical search latency/reuse without changing the active model provider.
- Use `AI_CHAT_SKILL_ROOTS` to replace the default local skill roots or `AI_CHAT_EXTRA_SKILL_ROOTS` to add roots. Skill tools are read-only, scoped to configured roots, bounded by count/depth/read limits, and only return text files inside a selected skill folder.
- Use `AI_CHAT_LOCAL_TOOLS_ENABLED=1` with `AI_CHAT_LOCAL_WORKSPACE_ROOTS` to expose local workspace tools. File writes and command execution stay disabled until `AI_CHAT_LOCAL_WRITE_ENABLED=1` or `AI_CHAT_LOCAL_SHELL_ENABLED=1`; shell commands must also be named in `AI_CHAT_LOCAL_SHELL_ALLOWLIST`.
- Use `AI_CHAT_ACTIONS_ENABLED=1` with `AI_CHAT_ACTION_MANIFEST_PATH` to expose trusted loopback action adapters for document, MCP, plugin, or workflow capabilities.
- Use `BROWSER_ALLOWED_HOSTS` to restrict browser tooling to explicit public domains or subdomains, and `BROWSER_APPROVAL_TTL_MS` to keep typed/click approval grants short-lived and single-use.
- Live provider and transcription requests are optional and require the configured provider/API-key path.
- The dedicated Watchdog provider accepts only the configured loopback URL. Its proxy token is read from `WATCHDOG_PROXY_TOKEN_FILE`; it does not copy the upstream Ollama key into AI Chat or its SQLite database.
- OpenRouter through Watchdog uses the same Watchdog proxy, database, and dashboard as Ollama. Set `WATCHDOG_OPENROUTER_UPSTREAM_PROFILE` to the named upstream configured in Watchdog; the OpenRouter key remains server-side in Watchdog.
- `Watchdog / Ollama (TUD)` uses the existing Watchdog proxy with a dedicated named upstream profile. Its work Ollama key remains server-side in Watchdog, and it cannot select a personal direct Ollama credential.

To create the two local credential files without putting the OpenRouter key in AI Chat's SQLite database or `.env`, run:

```bash
AI_CHAT_SECRETS_DIR="${HOME}/.config/ai-chat"
install -d -m 700 "$AI_CHAT_SECRETS_DIR"
read -rsp "OpenRouter API key: " OPENROUTER_API_KEY; printf '\n'
printf '%s\n' "$OPENROUTER_API_KEY" > "$AI_CHAT_SECRETS_DIR/openrouter-api-key"
unset OPENROUTER_API_KEY
openssl rand -hex 32 > "$AI_CHAT_SECRETS_DIR/watchdog-openrouter-proxy-token"
chmod 600 "$AI_CHAT_SECRETS_DIR/openrouter-api-key" "$AI_CHAT_SECRETS_DIR/watchdog-openrouter-proxy-token"
```

Start a second loopback Watchdog instance for OpenRouter (the existing instance stays configured for Ollama Cloud):

```bash
WATCHDOG_ROOT=/Users/robertdevore/2026/Kujolang/kujo-repos/watchdog
AI_CHAT_SECRETS_DIR="${HOME}/.config/ai-chat"
KUJO_BIN="${KUJO_BIN:-kujo}"
OPENROUTER_API_KEY="$(<"$AI_CHAT_SECRETS_DIR/openrouter-api-key")" \
WDG_PORT=7701 \
WDG_DB_PATH="$WATCHDOG_ROOT/data/watchdog-openrouter.db" \
WDG_UPSTREAM_BASE_URL=https://openrouter.ai/api/v1 \
WDG_PROXY_AUTH_MODE=override \
WDG_UPSTREAM_API_KEY_ENV=OPENROUTER_API_KEY \
WDG_PROXY_AUTHZ_MODE=token \
WDG_PROXY_AUTHZ_TOKEN="$(<"$AI_CHAT_SECRETS_DIR/watchdog-openrouter-proxy-token")" \
"$KUJO_BIN" run --interpreter "$WATCHDOG_ROOT/dashboard_server.kujo"
```

Then point AI Chat at that managed proxy and restart AI Chat:

```bash
echo 'WATCHDOG_OPENROUTER_UPSTREAM_PROFILE=openrouter-work' >> .env
```

### Work Ollama Watchdog setup (TUD)

Create a separate work-key file. Do not put the key in AI Chat's `.env`, the AI Chat settings UI, or the AI Chat SQLite database:

```bash
install -d -m 700 "$HOME/.config/watchdog"
read -rsp "Work Ollama API key: " OLLAMA_API_KEY; printf '\n'
printf '%s\n' "$OLLAMA_API_KEY" > "$HOME/.config/watchdog/ollama-tud-work-api-key"
unset OLLAMA_API_KEY
chmod 600 "$HOME/.config/watchdog/ollama-tud-work-api-key"
```

Add this named upstream profile to Watchdog's existing `watchdog_proxy_config.json`, preserving its existing `openrouter-work` entry:

```bash
{
  "upstream_profiles": {
    "openrouter-work": { "upstream_base_url": "https://openrouter.ai/api/v1", "auth_mode": "override", "upstream_api_key_env": "OPENROUTER_WORK_API_KEY" },
    "ollama-tud-work": { "upstream_base_url": "https://ollama.com/v1", "auth_mode": "override", "upstream_api_key_env": "OLLAMA_TUD_WORK_API_KEY" }
  }
}
```

Configure the existing Watchdog launch environment to load the key file at startup:

```bash
echo 'SIGNALBOX_WATCHDOG_OLLAMA_TUD_WORK_KEY_FILE=/Users/robertdevore/.config/watchdog/ollama-tud-work-api-key' >> /Users/robertdevore/2026/signalbox/.env.watchdog
launchctl kickstart -k "gui/$(id -u)/com.signalbox.watchdog"
```

Add the named upstream selection to AI Chat's local `.env`, restart AI Chat, then select `Watchdog / Ollama (TUD)` in Settings. AI Chat seeds this profile on both fresh and existing databases. Leave its API key and base URL empty because the server reads the existing shared proxy token file.

```bash
WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE=ollama-tud-work
```

- With `WATCHDOG_DIRECT_STREAMING=1`, a Watchdog pane automatically uses a matching, API-key-backed custom Ollama profile for the live provider connection and sends completion telemetry to Watchdog asynchronously. This avoids Watchdog's buffered proxy path while preserving observability. If no matching direct profile exists, the managed proxy remains the fallback.
- When Watchdog protects `/api/*` with token auth, `WATCHDOG_API_TOKEN_FILE` must point to a readable file containing `WDG_API_AUTH_TOKEN`. This is separate from the proxy authorization token. Rejected or unreachable asynchronous telemetry is logged as a sanitized warning without failing the chat stream.
- AI Chat emits provider-neutral trace spans/events for provider rounds, connection and first-token timing, thinking, tool execution, errors, throughput, and committed message persistence. `WATCHDOG_TELEMETRY_CONTENT_MODE` defaults to `off`; `summary` keeps bounded structural summaries, while `full` explicitly opts into bounded raw content and should be used only with an appropriate local privacy policy.
- Watchdog remains an optional passive collector. AI Chat, SearXNG, Ollama Web Search, and every future tool adapter continue to run independently; telemetry failure never becomes a chat or tool dependency.

## Quick Start

1. Install dependencies

```bash
nvm use
npm install
npx playwright install chromium
```

If Node.js was changed after the dependencies were installed and startup reports a
`NODE_MODULE_VERSION` mismatch for `better-sqlite3`, rebuild its native module with
the Node.js version you will use to run the app:

```bash
npm run rebuild:native
```

`npm run dev` and `npm start` also check `better-sqlite3` before booting and rebuild
it automatically when the installed native binary was compiled for a different
Node.js runtime.

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

The OpenRouter and Ollama Cloud suggestion lists are a static catalog snapshot, so a
selectable model is not proof that the configured key can use it. The app preserves
your existing model suggestions and adds the catalog candidates on startup. Refresh
account-visible inventory before relying on a newly added or marked-retired model.

## First-Run User Setup

1. Open Settings.
2. Add or edit provider profiles.
3. Enter API keys for each direct-provider profile you plan to use. Watchdog profiles use the server-managed credential file instead.
4. Add, edit, remove, and drag model rows within each provider profile. Drag provider cards to set their order.
5. In General settings, choose the default model/provider for regular new chats.
6. Optionally add your name so models can address you naturally.
7. Create a new chat and add panes for side-by-side comparison.
8. Open Pane Profiles in the chat header to save the current pane/model arrangement for later benchmarks or repeated workflows.
9. Send a prompt; every pane receives the same prompt automatically.

## API Endpoints

- GET /api/health
- GET /api/providers
- GET /api/state
- GET/POST /api/automations
- PUT/DELETE /api/automations/:automationId
- POST /api/automations/:automationId/run
- GET /api/automations/:automationId/runs
- PUT /api/state
- POST /api/state/changes
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

The server forwards SSE and newline-delimited JSON incrementally, keeps the timeout idle-based while data is arriving, and treats provider error events as terminal. The client automatically resumes token-limited, unexpectedly closed, and transiently failed partial responses without discarding text already received.

When a model requests `web_search`, the server dispatches it through a local registry and selects the configured adapter. `auto` uses SearXNG when `SEARXNG_BASE_URL` is set, otherwise it calls `https://ollama.com/api/web_search` with the configured Ollama credential. The runtime appends the bounded result payload as a provider-compatible tool message and continues until the model produces a final response or reaches the tool budget. The stable arguments are `query`, `max_results`, optional `domains`, and optional `freshness` (`day`, `week`, `month`, or `year`).

The default per-request tool budget is 256 tool rounds and 2048 executed tool calls, configurable with `MAX_TOOL_ROUNDS` and `MAX_TOOL_CALLS_PER_REQUEST` and capped at 512 rounds / 4096 calls. A model can request many calls at once, but AI Chat executes at most `MAX_TOOL_CALLS_PER_ROUND` (default 6), returns deferred results for the remainder, bounds each web-search payload with `WEB_SEARCH_MAX_RESULT_BYTES`, and compacts the oldest tool messages after `MAX_TOOL_CONTEXT_CHARS`. This keeps long research runs from exhausting the provider context before a final answer is produced. If the total cap is reached, the stream reports the active budget in its terminal error.

The stable browser tools are `browser_open(url, session_id?)`, `browser_snapshot(session_id)`, `browser_act(session_id, action)`, and `browser_close(session_id)`. The saved `browser_use` name remains available as a deprecated compatibility adapter. Sessions are isolated per chat, expire automatically, expose opaque IDs only, and are closed during shutdown. Read-only navigation, snapshots, extraction, scrolling, going back, and screenshots remain automatic. Browser snapshots now include the final URL, page title, retrieval timestamp, stable element refs, and provenance metadata while clearly marking page-derived text and links as untrusted content. The default `read-only` action policy returns `tool_approval_required` for non-sensitive typing and other narrowly scoped non-read-only actions, while login, purchase, submit, delete, permission, credential, upload, download, and similarly consequential actions fail closed with `browser_action_blocked`. `BROWSER_ALLOWED_HOSTS` optionally narrows browser use to trusted public domains/subdomains. `BROWSER_ACTION_POLICY=development` remains a deprecated local-testing escape hatch for non-sensitive actions only.

Browser navigation allows only HTTP/HTTPS and pins each request to a validated public DNS result. Localhost, private/link-local/multicast networks, cloud-metadata addresses, unsafe schemes, redirect pivots, network writes, downloads, user-profile access, file upload, arbitrary JavaScript, and shell/filesystem control are blocked. Page content is untrusted data. Screenshots are bounded local artifacts and tool results never expose the artifact directory. If health reports `chromium_unavailable`, run `npx playwright install chromium` with the same Node installation used to start AI Chat.

The offline fixture path is verified in the local smoke workflow and is the safest path for docs/CI-style checks.

## Durable State Behavior

The browser writes normalized state changes through `POST /api/state/changes` instead of resending the complete conversation corpus. Changes are dependency-ordered, split into bounded batches, idempotent when retried, and stored transactionally in SQLite. Conversation growth therefore does not make later saves exceed the global JSON request limit.

The composer always shows `Saving…`, `Saved`, or an explicit `Not saved` state. Failed writes remain in the local cache and retry with bounded backoff; a linked chat can be recovered from that cache if a reload races its first server write. `PUT /api/state` remains available for older clients, but new clients should use incremental changes.

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

Run a saved pane profile across every test in a benchmark Markdown document. The
runner creates one chat per test, persists each pane response as it completes,
and writes the exact start time, finish time, and per-response duration under
`data/benchmark-runs/`:

```bash
API_AUTH_TOKEN=your_app_token npm run benchmark:run -- \
  --tests "/absolute/path/Benchmark Tests.md" \
  --pane-profile "OpenRouter (TUD)" \
  --title-prefix "RND005TST"
```

The app server must already be running. Re-run with `--run-id <id>` to keep
the run artifact under a predictable name; completed pane responses remain in
their benchmark chats if a later provider request fails.

Benchmark runs default to one request at a time and retry transient or empty
responses up to three times. This is intentional for shared work keys; use
`--concurrency 4` only after a stable baseline, and do not increase it merely
to shorten a run.

Benchmark files may contain any positive number of tests. Use one `# TEST
<number>: <title>` or `## TEST <number>: <title>` heading per test, followed by
an `## Prompt` section. Test numbers should be sequential for predictable chat
titles.

Use `--title-prefix` when benchmark chats need a sortable run identifier; the
runner appends a three-digit test number, for example `RND005TST001`.

Run smoke tests (server must already be running):

```bash
npm run smoke
```

When the server was started with `BROWSER_ENABLED=1`, verify that Playwright
Chromium is advertised as executable:

```bash
npm run smoke:browser
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
providers 200 5
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
