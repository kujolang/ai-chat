# AI Chat Setup and Install Guide

This guide is a dedicated, end-user focused setup reference for running AI Chat locally.

## 1. Prerequisites

- Node.js 22.17.0 through `nvm use` from this repository
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
- WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE
- WATCHDOG_DIRECT_STREAMING
- WATCHDOG_TELEMETRY_URL
- WATCHDOG_API_TOKEN_FILE
- BENCHMARK_WATCHDOG_PROXY_URL
- BENCHMARK_WATCHDOG_PROXY_TOKEN_FILE
- BENCHMARK_WATCHDOG_OPENROUTER_UPSTREAM_PROFILE
- BENCHMARK_WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE
- BENCHMARK_WATCHDOG_TELEMETRY_URL
- BENCHMARK_WATCHDOG_API_TOKEN_FILE
- AI_CHAT_INSTANCE_ROLE
- AI_CHAT_INSTANCE_LABEL
- BENCHMARK_OUTPUT_DIR
- BENCHMARK_MAX_RESPONSE_TOKENS
- BENCHMARK_RECOMMENDED_CONCURRENCY
- BENCHMARK_MAX_CONCURRENCY
- BENCHMARK_STREAM_MAX_INFLIGHT
- BENCHMARK_STREAM_QUEUE_LIMIT
- BENCHMARK_STREAM_QUEUE_TIMEOUT_MS
- CODEX_CLI_PATH
- CODEX_MODEL_CACHE_PATH
- CODEX_SANDBOX_MODE
- MAX_TOOL_ROUNDS
- MAX_TOOL_CALLS_PER_REQUEST
- MAX_TOOL_CALLS_PER_ROUND
- MAX_TOOL_CONTEXT_CHARS
- WEB_SEARCH_MAX_RESULTS
- WEB_SEARCH_MAX_RESULT_BYTES
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
WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE=ollama-tud-work
WATCHDOG_DIRECT_STREAMING=1
WATCHDOG_TELEMETRY_URL=http://127.0.0.1:7700/api/telemetry/requests
WATCHDOG_API_TOKEN_FILE=
BENCHMARK_WATCHDOG_PROXY_URL=http://127.0.0.1:8800/proxy/v1
BENCHMARK_WATCHDOG_PROXY_TOKEN_FILE=/absolute/path/to/benchmark-watchdog-proxy-token
BENCHMARK_WATCHDOG_OPENROUTER_UPSTREAM_PROFILE=openrouter-benchmark
BENCHMARK_WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE=ollama-tud-benchmark
BENCHMARK_WATCHDOG_TELEMETRY_URL=http://127.0.0.1:9900/api/telemetry/requests
BENCHMARK_WATCHDOG_API_TOKEN_FILE=
AI_CHAT_INSTANCE_ROLE=interactive
AI_CHAT_INSTANCE_LABEL=
BENCHMARK_OUTPUT_DIR=/absolute/path/to/ai-chat/data/benchmark-runs
BENCHMARK_MAX_RESPONSE_TOKENS=6000
BENCHMARK_RECOMMENDED_CONCURRENCY=1
BENCHMARK_MAX_CONCURRENCY=2
BENCHMARK_STREAM_MAX_INFLIGHT=1
BENCHMARK_STREAM_QUEUE_LIMIT=2
BENCHMARK_STREAM_QUEUE_TIMEOUT_MS=30000
STREAM_REQUEST_TIMEOUT_MS=0
TOOL_CONTINUATION_TIMEOUT_MS=0
CODEX_CLI_PATH=codex
CODEX_MODEL_CACHE_PATH=/absolute/path/to/.codex/models_cache.json
CODEX_SANDBOX_MODE=read-only
MAX_TOOL_ROUNDS=2048
MAX_TOOL_CALLS_PER_REQUEST=16384
MAX_TOOL_CALLS_PER_ROUND=6
MAX_TOOL_CONTEXT_CHARS=262144
MAX_MESSAGE_CHARS=1000000
MAX_TOTAL_MESSAGE_CHARS=4000000
CONTEXT_COMPACTION_ENABLED=1
CONTEXT_COMPACTION_STRATEGY=structured_excerpt_v1
CONTEXT_COMPACTION_TARGET_CHARS=262144
CONTEXT_COMPACTION_SUMMARY_CHARS=24576
CONTEXT_COMPACTION_PRESERVE_RECENT_MESSAGES=24
WEB_SEARCH_MAX_RESULTS=5
WEB_SEARCH_MAX_RESULT_BYTES=12288
WEB_SEARCH_TIMEOUT_MS=6000
WEB_SEARCH_CACHE_TTL_MS=5000
WEB_SEARCH_CACHE_MAX_ENTRIES=64
AI_CHAT_SKILLS_ENABLED=1
AI_CHAT_SKILL_ROOTS=
AI_CHAT_EXTRA_SKILL_ROOTS=
AI_CHAT_SKILLS_MAX_COUNT=500
AI_CHAT_SKILLS_MAX_DEPTH=6
AI_CHAT_SKILLS_MAX_READ_CHARS=48000
AI_CHAT_LOCAL_TOOLS_ENABLED=0
AI_CHAT_LOCAL_WORKSPACE_ROOTS=
AI_CHAT_LOCAL_WRITE_ENABLED=0
AI_CHAT_LOCAL_SHELL_ENABLED=0
AI_CHAT_LOCAL_SHELL_ALLOWLIST=git,rg,ls,pwd
AI_CHAT_LOCAL_MAX_READ_CHARS=64000
AI_CHAT_LOCAL_MAX_OUTPUT_CHARS=64000
AI_CHAT_LOCAL_MAX_ENTRIES=200
AI_CHAT_LOCAL_COMMAND_TIMEOUT_MS=15000
AI_CHAT_ACTIONS_ENABLED=0
AI_CHAT_ACTION_MANIFEST_PATH=
AI_CHAT_ACTION_TIMEOUT_MS=15000
AI_CHAT_ACTION_MAX_RESULT_BYTES=131072
BROWSER_ENABLED=0
BROWSER_HEADLESS=1
BROWSER_SESSION_TTL_MS=900000
BROWSER_MAX_SESSIONS=32
BROWSER_MAX_SESSIONS_PER_CHAT=8
BROWSER_MAX_ACTIONS_PER_REQUEST=24
BROWSER_MAX_ACTIONS_PER_SESSION=60
BROWSER_NAVIGATION_TIMEOUT_MS=15000
BROWSER_MAX_TEXT_CHARS=30000
BROWSER_MAX_RESULT_BYTES=131072
BROWSER_ARTIFACT_DIR=/absolute/path/to/ai-chat/data/tool-artifacts/browser
BROWSER_ALLOWED_HOSTS=
BROWSER_APPROVAL_TTL_MS=120000
BROWSER_ACTION_POLICY=read-only
```

Important security behavior:

- API keys are encrypted using `ENCRYPTION_SECRET`.
- If you change `ENCRYPTION_SECRET` later, existing encrypted API keys cannot be decrypted.
- API routes require `API_AUTH_TOKEN`; the web UI shows an in-app auth modal once and stores it locally with an expiry (default 30 days).
- API routes reject unauthenticated requests before parsing JSON bodies, return JSON error envelopes for malformed authenticated JSON, and send `Cache-Control: no-store`.
- `TRUST_PROXY` defaults to disabled. Enable it only behind a trusted reverse proxy so rate limiting, origin checks, HSTS detection, and audit IPs may use `X-Forwarded-*` headers.
- The Watchdog profile is the reviewed local-proxy exception to the HTTPS-only custom-provider policy. It must exactly match `WATCHDOG_PROXY_URL`, remain on loopback, and reads its bearer token from `WATCHDOG_PROXY_TOKEN_FILE`.
- `Watchdog / Ollama (TUD)` is the corresponding work-key profile. It uses the same loopback proxy and proxy token as the other Watchdog profiles, but selects `WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE`; it always uses the proxy rather than a direct Ollama profile.
- Watchdog keeps the upstream provider key; AI Chat never stores or receives that upstream key. SignalBox and AI Chat telemetry can therefore share one Watchdog database while remaining distinguishable by source and correlation fields.
- For true live Watchdog chat streaming, keep an API-key-backed custom Ollama profile with the same model in AI Chat and leave `WATCHDOG_DIRECT_STREAMING=1`. AI Chat uses that direct connection for the stream, then posts non-content completion metrics to `WATCHDOG_TELEMETRY_URL`. When Watchdog protects `/api/*` with token auth, set `WATCHDOG_API_TOKEN_FILE` to a readable file containing `WDG_API_AUTH_TOKEN`; the proxy token file cannot replace this separate API credential unless both Watchdog roles intentionally use the same value. Rejected or unreachable telemetry produces a sanitized server warning without failing the chat.
- Benchmarks may use a dedicated managed Watchdog lane through `BENCHMARK_WATCHDOG_*`. Benchmark-tagged requests switch to that lane automatically, leaving the interactive Watchdog lane untouched.
- `AI_CHAT_INSTANCE_ROLE=benchmark` marks a dedicated benchmark server. `/api/health` then reports the instance role plus reviewed benchmark queue, concurrency, and token settings so the runner can refuse the wrong server before a long run starts.
- A local Codex install adds a managed `Codex` profile automatically when `CODEX_MODEL_CACHE_PATH` points to a readable Codex model cache. AI Chat shells out to `CODEX_CLI_PATH` with your existing Codex login, so no API key is stored in AI Chat. `CODEX_SANDBOX_MODE` defaults to `read-only`, and Codex runs locally while AI Chat forwards trace metadata to `WATCHDOG_TELEMETRY_URL` for the same dashboard view used by the other providers.

## 3. Install Dependencies

From the project root:

```bash
nvm use
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

The normal startup commands run the same compatibility check first and automatically
rebuild `better-sqlite3` when the installed binary targets a different Node.js ABI.

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

If startup says AI Chat is already running on that URL, leave the existing
server alone and open the printed address. If a different app owns the port,
stop that process or restart AI Chat with a different `PORT`.

## 5. First-Time In-App Setup

1. Open Settings.
2. Add or edit provider profiles.
3. Enter API keys for the providers you want to use.
4. Add, edit, remove, and drag model rows within each provider profile. Drag provider cards to set their order; use the chevron to collapse or open a card.
5. In General settings, choose the default model/provider for regular new chats.
6. Optionally add your preferred name so chat models can address you naturally.
7. Create a chat and add panes if you want side-by-side comparisons.
8. Optionally open Pane Profiles in the chat header, name the current pane/model arrangement, and save it for future chats.
9. Send prompts to all panes.

The fixed system prompt lives in `SYSTEM_PROMPT.md`. It is intentionally absent from the Settings interface; edit the Markdown file directly and restart AI Chat to apply changes.

Regular New Chat continues to create one pane. To reuse a saved arrangement, open Pane Profiles and choose New Chat for that profile. Apply Here replaces the current chat's panes; if they contain messages, the app asks for confirmation first.

## 6. How Streaming Works

- The app uses POST /api/chat/stream for live responses.
- Token updates appear incrementally in the assistant message.
- Thinking/reasoning appears only when the upstream provider emits those deltas.
- SSE and NDJSON providers are consumed incrementally; active data resets the stream idle timeout.
- Partial responses are retained and automatically resumed after token limits, unexpected closes, and bounded transient failures.
- Chat state is persisted independently from provider streaming through bounded incremental writes, so a large historical chat corpus is never resent as one save request.
- Oversized request transcripts are accepted up to the larger server body/message limits, then compacted toward a reviewed ~256k-character active context window by replacing older turns with a structured summary plus the newest verbatim turns.
- The composer displays the durable-save state. Do not close the page while it says `Saving…` or `Not saved`; failed writes remain cached locally and retry automatically.

## 7. Voice and Transcription

- Use the Whisper Record button in the composer to capture audio.
- The backend forwards transcription requests through POST /api/transcribe.
- Transcript text is inserted into the composer when successful.

## 7a. Scheduled Chat Automations

Open Automations from the sidebar, create a title and prompt, choose a provider/model, then select a daily, weekday, or weekly schedule and local timezone. Each run creates a new durable chat. Automations run in the server process, so `npm run dev` (or the deployed server process) must remain running at the scheduled time. The Automations view can pause or resume schedules, trigger an immediate run, and link back to previous run chats.

## 8. Tools

Tool cards in Settings can be reordered by dragging their handles and collapsed with their chevrons. The saved order is used when the enabled tool definitions are sent with a request.

The Web Search preset is executable through AI Chat's provider-neutral tool runtime. For the local-first path, run SearXNG with JSON output enabled and set `SEARXNG_BASE_URL` (loopback HTTP or HTTPS). With `WEB_SEARCH_BACKEND=auto`, AI Chat prefers that adapter; without it, the runtime uses the API key from a custom Ollama profile and Ollama Web Search. You can force `searxng` or `ollama` with `WEB_SEARCH_BACKEND`. The active chat provider only requests `web_search`; it never selects the backend.

Search calls accept `query`, `max_results`, optional `domains`, and optional `freshness`; common aliases such as `past_month` normalize to the stable freshness values. Calls are bounded by `MAX_TOOL_ROUNDS`, `MAX_TOOL_CALLS_PER_REQUEST`, `MAX_TOOL_CALLS_PER_ROUND`, and `WEB_SEARCH_MAX_RESULTS`. Results keep the existing `query` plus `results` contract while adding canonical URLs, source domains, retrieval timestamps, optional upstream publication dates, backend capability metadata, and short TTL cache metadata. `WEB_SEARCH_MAX_RESULT_BYTES` bounds each result payload, while `MAX_TOOL_CONTEXT_CHARS` compacts the oldest tool messages during long research runs. `WEB_SEARCH_TIMEOUT_MS`, `WEB_SEARCH_CACHE_TTL_MS`, and `WEB_SEARCH_CACHE_MAX_ENTRIES` bound latency and repeated identical lookups without logging queries/snippets in default telemetry mode. Results return to the model as provider-compatible tool messages so it can produce the final answer.

The Skill presets expose installed local skill manuals to agents through read-only tools:

- `skill_list` discovers `SKILL.md` manuals under configured roots.
- `skill_read` reads the bounded `SKILL.md` for a selected skill id.
- `skill_file_read` reads bounded text reference files inside that selected skill folder.

By default, AI Chat checks common local folders: `~/.codex/skills`, `~/.agents/skills`, and `~/.claude/skills`. Set `AI_CHAT_SKILL_ROOTS` to replace that default list, using comma-separated or platform path-delimited absolute paths. Set `AI_CHAT_EXTRA_SKILL_ROOTS` to add folders while keeping the defaults. Runtime responses do not expose absolute root paths to the model, reject path traversal and symlink escapes, ignore hidden/dependency folders during discovery, and enforce `AI_CHAT_SKILLS_MAX_COUNT`, `AI_CHAT_SKILLS_MAX_DEPTH`, and `AI_CHAT_SKILLS_MAX_READ_CHARS`.

The Local presets make skills actionable through separate permissioned executors:

- `local_workspace_list` lists configured local workspace ids.
- `local_file_list` and `local_file_read` inspect line-numbered, streamed text windows bounded independently by lines, bytes, total characters, and per-line characters. Follow returned `next_offset` and `next_column` exactly.
- `local_file_write` creates, overwrites, or appends bounded non-sensitive text files when `AI_CHAT_LOCAL_WRITE_ENABLED=1`; model-requested overwrite requires a complete unchanged read in that request.
- `local_shell` runs one allowlisted command as executable plus args, without shell interpolation, when `AI_CHAT_LOCAL_SHELL_ENABLED=1`.

Local tools are disabled by default. Set `AI_CHAT_LOCAL_TOOLS_ENABLED=1` and optionally `AI_CHAT_LOCAL_WORKSPACE_ROOTS`; if omitted, the current AI Chat project root is the only workspace. Command execution uses a sanitized environment, bounded output, command timeouts, no provider credentials, and `AI_CHAT_LOCAL_SHELL_ALLOWLIST`. See `docs/LOCAL_AGENT_CAPABILITIES.md` for the full capability map and a throwaway-workspace test command.

The Action Adapter presets bridge document, MCP, plugin, or workflow actions through explicitly configured loopback services:

- `action_adapter_list` lists manifest-declared adapters and input schemas.
- `action_adapter_call` posts structured JSON input to one adapter and returns bounded JSON output.

Set `AI_CHAT_ACTIONS_ENABLED=1` and `AI_CHAT_ACTION_MANIFEST_PATH=/absolute/path/to/actions.json`. Adapter URLs must be loopback `http://127.0.0.1`, `http://localhost`, or equivalent IPv6 loopback URLs; AI Chat does not forward credentials or arbitrary headers. The adapter service owns its own authentication, OAuth, plugin credentials, MCP sessions, document libraries, and side-effect policy.

Set `BROWSER_ENABLED=1` after installing Chromium to enable `browser_open`, `browser_snapshot`, `browser_act`, `browser_close`, and the saved-chat compatibility adapter `browser_use`. Health and Settings show browser presets as unavailable when the executable is missing, rather than forwarding a schema that cannot run. If startup can find Playwright but a tool call cannot launch Chromium, the tool returns `browser_not_configured` with the installation command.

Browser sessions use a fresh context without the user's browser profile and are scoped to the requesting pane (or chat when no pane is supplied). The runtime limits sessions, actions, lifetime, navigation time, extracted text, result payloads, screenshots, approval lifetime, and cached snapshot reuse; expired/abandoned sessions and shutdown resources are closed automatically. Only HTTP/HTTPS public destinations are allowed. DNS results are pinned for each intercepted request, redirects are revalidated, and localhost, private/link-local/multicast, metadata, unsafe-scheme, download, file, arbitrary-JavaScript, and network-write paths fail closed. `BROWSER_ALLOWED_HOSTS` can optionally restrict navigation to specific public domains/subdomains without creating a private-network bypass.

The default `BROWSER_ACTION_POLICY=read-only` automatically permits public navigation, snapshots/text extraction, scrolling, back, screenshots, and safe link traversal. Non-sensitive typing and other narrowly scoped non-read-only actions return `tool_approval_required` with a short-lived, single-use approval request bound to the chat/browser session and exact target. Sensitive fields and purchase/login/delete/submit/download/permission-style targets are hard-blocked with `browser_action_blocked`, even after ordinary approval. `development` is a deprecated local-testing switch for non-sensitive actions only. Do not enable it globally.

## 9. Health and Smoke Validation

The app provides these key endpoints:

- GET /healthz
- GET /api/healthz
- GET /api/health
- GET /api/providers
- GET /api/state

Use `/healthz` or `/api/healthz` for unauthenticated reverse-proxy and tunnel probes. `/api/health` remains the authenticated runtime metadata endpoint for the app UI and diagnostics.

For dedicated benchmark servers, confirm `/api/health` reports:

- `instance.role=benchmark`
- reviewed `benchmark.default_max_response_tokens`
- reviewed `benchmark.max_concurrency`
- expected `watchdog.default` and `watchdog.benchmark` endpoints
- `watchdog.benchmark.telemetry_split_from_proxy=true` when dashboard/API traffic is intentionally separated from proxy traffic

For a local-read harness benchmark, expose only a throwaway fixture workspace
with `AI_CHAT_LOCAL_TOOLS_ENABLED=1` and `AI_CHAT_LOCAL_WORKSPACE_ROOTS`, then
run `npm run benchmark:run -- --tool-preset local-read ...`. The runner obtains
the three read-only local schemas from authenticated health metadata and records
their tool-call counts and trace ids in the generated run artifact.

Run smoke checks after server startup:

```bash
npm run smoke
```

For a server started with `BROWSER_ENABLED=1`, verify the Playwright Chromium
runtime with:

```bash
npm run smoke:browser
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
