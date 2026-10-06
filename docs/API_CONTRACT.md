# API Contract and Versioning

This document defines the public HTTP contract for AI Chat and the compatibility rules for clients and agents.

## 1. Contract Scope

Public API base: same origin, path prefix `/api`.

Current endpoints:

- `GET /healthz`
- `GET /api/healthz`
- `GET /api/health`
- `GET /api/providers`
- `GET /api/model-context`
- `POST /api/model-context/refresh`
- `GET /api/state`
- `GET /api/chats/:chatId`
- `GET /api/automations`
- `POST /api/automations`
- `PUT /api/automations/:automationId`
- `DELETE /api/automations/:automationId`
- `POST /api/automations/:automationId/run`
- `GET /api/automations/:automationId/runs`
- `PUT /api/state`
- `POST /api/state/changes`
- `POST /api/chat`
- `POST /api/chat/stream`
- `POST /api/transcribe`
- `POST /api/browser/approvals`
- `GET /api/browser/artifacts/:artifactId`

## 2. Authentication Contract

All `/api/*` routes require app token authentication.

Accepted token transport:

- Header: `X-API-Token: <token>`
- Header: `Authorization: Bearer <token>`

If token is missing or invalid, server returns:

```json
{
  "ok": false,
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid API token.",
    "retryable": false
  }
}
```

Authentication, host/origin checks, and rate limiting run before JSON body parsing. An unauthenticated malformed JSON request still returns `unauthorized`.

## 3. Response Envelope Contract

Unless noted otherwise (SSE stream), JSON responses follow this shape:

- Success: `{"ok": true, ...}`
- Failure: `{"ok": false, "error": {"code", "message", "retryable"}, ...}`

Contract guarantees:

- `ok` is always boolean.
- `error.code` is machine-readable and stable for known error classes.
- `error.message` is human-readable and may evolve.
- `error.retryable` signals client retry safety.
- API JSON responses include `Cache-Control: no-store`.

Common transport-level errors:

- `invalid_json`: authenticated JSON body could not be parsed.
- `payload_too_large`: authenticated JSON body exceeds `MAX_JSON_BODY_BYTES`.
- `rate_limited`: route/IP scope exceeded the configured rate limit.

When `DEBUG_API_ERRORS=0`, provider raw error bodies are not included in stream error payloads.

## 4. Health Contract

`GET /healthz` and `GET /api/healthz` return a minimal unauthenticated probe payload:

- `ok`: `true`
- `service`: `"ai-chat"`
- `status`: `"healthy"`

`GET /api/health` returns authenticated runtime metadata:

- `service`: `"ai-chat"`
- `ai_sdk_available`: boolean
- `auth_configured`: boolean
- `encryption_configured`: boolean
- `retention_days`: number
- `instance.role`: `interactive`, `benchmark`, or `hybrid`
- `instance.label`: bounded local label for the running server instance
- `benchmark`: reviewed benchmark-lane metadata including `output_dir_label`, response token cap, recommended/max concurrency, queue limits, and current queue counts
- `watchdog.default` / `watchdog.benchmark`: sanitized managed Watchdog endpoint metadata for the normal interactive lane and the benchmark lane
- `tool_runtime.tools`: executable provider-neutral tool names
- `tool_runtime.web_search_backend`: resolved `searxng` or `ollama` adapter
- `tool_runtime.web_search`: sanitized search backend capabilities, timeout, cache, and policy metadata
- `tool_runtime.browser`: sanitized `enabled`, `available`, `backend`, `headless`, `action_policy`, and `unavailable_reason` fields
- `tool_runtime.skills`: sanitized `enabled`, `available`, skill/root counts, root labels, and read/discovery limits
- `tool_runtime.local`: sanitized `enabled`, `available`, write/shell flags, workspace labels, shell allowlist, and bounded execution limits
- `tool_runtime.actions`: sanitized `enabled`, `available`, adapter metadata, input schemas, and bounded execution limits
- `tool_runtime.repairs`: global result-byte limit plus per-model/per-tool call, repair, invalid-call, oversized-result, and repair-kind counters; argument values are never included
- `tool_runtime.schemas`: built-in schemas that are currently executable; browser schemas are absent when Chromium is unavailable

## 5. State Contract

`GET /api/state` returns:

- `state.chats` array
- Each chat includes a stable `routeId` used only for bookmarkable `/c/{routeId}` browser URLs. It is a long opaque public identifier and is distinct from the internal chat `id` used by API endpoints, persistence relationships, exports, and telemetry.
- `state.projectFolders` array
- `state.activeChatId` string|null
- `state.showArchived` boolean
- `state.searchQuery` string
- `state.broadcastToAllPanes` boolean compatibility field; the UI always persists this as `true` and broadcasts prompts to every pane.
- `state.settings` object containing `temperature`, `maxTokens`, `defaultProfileId`, `defaultModel`, optional `userName`, persistent `agentInstructions`, provider `profiles`, reusable `paneProfiles`, and saved function-tool definitions in `tools`

Clients may request `GET /api/state?messages=none` to load chat metadata, pane metadata, and per-pane `messageCount` without message bodies. Use `GET /api/chats/:chatId` to hydrate one chat's panes and messages on demand.

`GET /api/chats/:chatId/export` returns an authenticated Markdown download named
`chat-{ID}-{datetime}.md`. Its header records the chat ID, title, export time,
pane provider/model selections, and complete user/assistant/thinking transcript.
`POST /api/chats/:chatId/export` saves that same transcript into an explicitly
configured local workspace only when both local tools and local writes are opted
in. It accepts `root_id`, optional safe Markdown `path`, and `create_dirs`; it
never writes outside the configured workspace or to a sensitive file path.

Chat requests accept much larger raw transcripts by default so long-running
tasks can continue. The reviewed server defaults are `MAX_JSON_BODY_BYTES=
8388608`, `MAX_MESSAGES_PER_REQUEST=2000`, `MAX_MESSAGE_CHARS=1000000`, and
`MAX_TOTAL_MESSAGE_CHARS=4000000`. Set any of them lower only when a deployment
needs stricter ingress limits.

Stored chats are not capped by the per-request message or character limits. When
a long conversation outgrows `MAX_MESSAGES_PER_REQUEST` or
`MAX_TOTAL_MESSAGE_CHARS`, the server keeps system instructions and the newest
conversation turns within the active request window, then compacts older turns
into a structured system summary controlled by `CONTEXT_COMPACTION_ENABLED`,
`CONTEXT_COMPACTION_STRATEGY`, `CONTEXT_COMPACTION_TARGET_CHARS`,
`CONTEXT_COMPACTION_SUMMARY_CHARS`, and
`CONTEXT_COMPACTION_PRESERVE_RECENT_MESSAGES`. Older turns remain in the saved
transcript and are compacted only for that provider request.

`defaultProfileId` and `defaultModel` identify the provider/model selection used by regular new chats. Clients fall back to the first available configured model when the saved selection is missing or no longer exists.

`agentInstructions` is a bounded (24,000-character) app-wide instruction document. `agentInstructionProfiles` is an optional array of bounded `{id, models_csv, instructions, enabled}` entries; matching comma-separated model names append their instructions when `enabled` is not `false`. The browser prepends the combined text as the first system message for each pane request. These fields are intended to be compatible with concise `AGENTS.md` guidance and must not contain credentials or other secrets.

`userName` is an optional normalized string of up to 120 characters. The browser sends it as `user_name` on interactive chat requests, and the server adds a bounded system instruction that lets the model address the user naturally. The server also prepends the repository-owned `SYSTEM_PROMPT.md` to every chat request. That fixed prompt is loaded at server startup and is not exposed as an editable state or Settings field.

Each pane profile stores a name plus an ordered `panes` array of provider-profile/model selections. It contains no messages or provider credentials. The normal new-chat action remains a single-pane chat; clients may explicitly create a new chat or replace the current chat's panes from a saved pane profile. The browser asks for confirmation before replacing panes that contain messages.

Profile key handling guarantee:

- Raw API keys are never returned.
- `api_key_present` is exposed as a boolean indicator.
- `credential_managed` is `true` for Watchdog profiles whose proxy token comes from the server credential file.
- `credential_managed` is also `true` for Codex profiles that use the local Codex login and model cache instead of an API key stored in AI Chat.
- `credential_managed` is also `true` for the Hermes free-model profile and the separate xAI OAuth profile, whose credentials remain in their local bridge.

Provider profiles are returned in their persisted `sort_order`. `models_csv` remains the compatible wire/storage field, with comma-separated entries preserving the ordered model rows shown by the browser UI.

### Incremental state changes

`POST /api/state/changes` is the preferred persistence endpoint. Its request body is:

```json
{
  "changes": [
    { "type": "message_upsert", "message": { "id": "message-id", "pane_id": "pane-id", "role": "assistant", "content": "...", "thinking": "", "usage": null, "created_at": 0, "sort_order": 0 } }
  ]
}
```

Supported additive change types are:

- `app_settings_upsert`
- `pane_profiles_upsert` with the complete `paneProfiles` array
- `profile_upsert`, `profile_delete`
- `chat_upsert`, `chat_delete`
- `pane_upsert`, `pane_delete`
- `message_upsert`, `message_delete`

Clients must order dependency creation as profiles, chats, panes, then messages. Deletions must run in the reverse dependency order. A successful response contains `applied` and the new `stateVersion`.

Changes are idempotent entity upserts/deletes and do not require the global state version. This prevents an unrelated concurrent client write from forcing the browser to discard unsaved local chat content. Clients should diff against their last confirmed snapshot, retry failed batches, and never advance that snapshot until every batch succeeds.

For a saved assistant response with an execution cursor, an older checkpoint for the same execution (or a pre-execution placeholder without an ID) cannot overwrite the newer server-saved response. A later cursor or a new execution remains writable. This protects completed detached responses from delayed browser saves.

`PUT /api/state` remains backward compatible for complete-snapshot clients and retains optimistic state-version checks. It is not recommended for growing conversation histories because its request size includes every message.

Bridge/offline path note:

- The bridge accepts an `offline_fixture` flag for safe local smoke validation.
- Live provider calls remain gated behind configured API keys and the external AI SDK files.
- Watchdog profiles automatically attach `X-Observe-*` correlation headers to chat requests. They use `WATCHDOG_PROXY_TOKEN_FILE`; `watchdog_ollama_tud` selects the configured `WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE` through the trusted Watchdog upstream-profile header.

## 6. Streaming Contract (`POST /api/chat/stream`)

Requests may include `tools`, an array of up to 32 OpenAI-compatible function definitions. The normalized names in that request are the complete execution allowlist for the turn: a provider-requested tool is resolved to its canonical name and may execute only when that canonical name was advertised for the current request and still has a connected executor. An absent or empty list authorizes no tools when saved runtime presets are disabled; global executor registration and saved settings do not grant request capability. The streaming route dispatches authorized built-in tools through AI Chat's provider-neutral tool registry, appends the result as a provider-compatible tool message, and continues the conversation within bounded round/call limits. The default budget is 2048 rounds / 16384 calls, configurable up to 8192 rounds / 65536 calls. Every executable call is validated against its advertised schema before execution. Already-valid object inputs retain object identity and values. Only failed validation enters repair; successful repairs add `tool_input_repair` notes to the tool result, and unsuccessful repairs return a bounded, model-readable `invalid_tool_arguments` result without echoing argument values. `MAX_TOOL_RESULT_BYTES` provides a final shared result guard after executor-specific bounds. A failed read-only executable call records a terminal failed receipt and returns a bounded structured error result so the provider can select a fallback. A failed call that might have performed a write or external action keeps its unresolved receipt and terminates the stream with `execution_reconciliation_required`; inspect the external outcome before resuming. The runtime resolves SearXNG or Ollama Web Search independently of the active model provider, and reads local skill manuals only through configured read-only skill roots. A successful final `done` payload includes `tool_calls_executed`, `tool_input_repairs`, and `provider_rounds`. Unadvertised, malformed, concatenated, or unsupported names are rejected before tool progress events or execution and emit a bounded terminal `tool_execution_unavailable` error containing `tool_names`. The server never splits a malformed name into executable guesses. The JSON bridge route retains the explicit HTTP 422 behavior for requested tool execution. Clients must not retry terminal tool errors automatically.

Interactive clients may include `chat_id`, `pane_id`, `assistant_message_id`, `assistant_created_at`, and `assistant_sort_order` for a pre-created assistant placeholder that has already been saved through `/api/state/changes`. When present, the server keeps the upstream provider request running if the browser connection disappears, persists detached checkpoints for the assistant message, and writes the final assistant turn into SQLite. This lets mobile browsers, tab switches, and window changes refresh the chat later instead of losing a long-running response.

Requests may also include an optional `benchmark` object when the caller is a benchmark runner. Supported fields are bounded strings and numbers such as `run_id`, `test_id`, `test_number`, `test_title`, `selection_mode`, `pane_profile`, `lane`, and `instance_role_required`. `selection_mode` distinguishes saved `pane_profile` runs from `custom_models` runs; custom runs send an empty `pane_profile` instead of claiming a saved profile. Benchmark metadata does not change the assistant answer shape, but it lets AI Chat clamp benchmark `max_tokens`, refuse the wrong server role before a long run starts, switch managed Watchdog traffic to a dedicated benchmark lane when configured, and apply benchmark queue/saturation controls.

Executable local skill contracts are:

- `skill_list`: `{ "query": "optional text", "source": "optional root label filter", "max_results": 50 }`
- `skill_read`: `{ "id": "skill id returned by skill_list" }`
- `skill_file_read`: `{ "id": "skill id returned by skill_list", "path": "relative/path.md", "max_chars": 48000 }`

The always-available read-only system contract is `system_time: {}`. It returns
`iso_utc`, `unix_ms`, and the host `timezone`; it does not require a website or
enable local workspace or shell access.

Skill tool responses are bounded, read-only, and scoped to configured roots. They never return absolute root paths, reject path traversal and symlink escapes, and only read known text file extensions inside a selected skill folder. Skill contents are local workflow context; they do not override user instructions, app safety policy, credential handling, or tool limits.

Executable local workspace contracts are:

- `local_workspace_list`: `{}`
- `local_file_list`: `{ "root_id": "workspace_0", "path": ".", "max_entries": 100 }`
- `local_file_read`: `{ "root_id": "workspace_0", "path": "README.md", "offset": 1, "column": 1, "limit": 2000, "max_chars": 64000, "max_bytes": 131072, "max_line_chars": 2000 }`
- `local_file_write`: `{ "root_id": "workspace_0", "path": "notes/example.md", "content": "...", "mode": "create|overwrite|append", "create_dirs": true }`
- `local_shell`: `{ "root_id": "workspace_0", "cwd": ".", "command": "rg", "args": ["pattern", "README.md"], "timeout_ms": 15000 }`

Local workspace tools are disabled unless `AI_CHAT_LOCAL_TOOLS_ENABLED=1`. Write and shell actions additionally require `AI_CHAT_LOCAL_WRITE_ENABLED=1` and `AI_CHAT_LOCAL_SHELL_ENABLED=1`. Shell execution uses `spawn` without shell interpolation, an args array, an allowlist from `AI_CHAT_LOCAL_SHELL_ALLOWLIST`, sanitized environment variables, timeout and output bounds, and configured workspace cwd containment.

`local_file_read` returns 1-indexed line prefixes plus `complete`, `truncated`, `next_offset`, `next_column`, and bounded `meta`. It independently limits lines, returned bytes, total characters, and characters per line; streams large files without loading them whole; normalizes BOM/CRLF safely; never splits a Unicode code point; labels empty and past-EOF reads; and supplies exact continuation coordinates. Invisible macOS filename variants (NFC/NFD, narrow spaces, straight/curly quotes) are retried inside the workspace boundary before a bounded `Did you mean` hint is returned. Exact unchanged reads consume the duplicate marker and re-read the bounded window immediately, returning real content with `deduplicated: true` and `meta.cache: "bounded_reread"`. They never require a second call merely to recover content removed from model context.

An existing file may be overwritten through the model-facing `local_file_write` only after a complete unchanged read in the same request. Partial and stale reads return distinct recovery errors. Create and append retain their existing behavior, and internal transcript export remains outside the model read ledger. Local file tools reject path traversal, symlink escapes, sensitive filenames, device/process pseudo-files, hidden dependency/runtime folders in listings, and unknown or binary file content.

`local_file_write` applies its byte ceiling to the resulting file, including existing bytes during append, and `overwrite` never creates a missing target. `local_shell` preserves argument strings exactly, shares one output-character budget across stdout/stderr, sets `truncated` only when content is actually omitted, returns `exit_code: null` for externally signaled processes, and returns `local_shell_aborted` when request cancellation terminates the command.

Executable action adapter contracts are:

- `action_adapter_list`: `{}`
- `action_adapter_call`: `{ "id": "adapter_id", "input": { "...": "adapter-specific JSON" } }`

Action adapters are disabled unless `AI_CHAT_ACTIONS_ENABLED=1` and `AI_CHAT_ACTION_MANIFEST_PATH` points to a JSON manifest. Each adapter declares `id`, `name`, `description`, loopback-only HTTP `url`, optional `input_schema`, and optional `timeout_ms`. Calls use POST with JSON body `{ "input": ... }`, no credential headers, timeout and result-size limits, and JSON-only responses. AI Chat does not broker OAuth, MCP sessions, plugin credentials, or document-library permissions; the trusted adapter service owns those policies and returns bounded data.

Executable browser contracts use the same provider-neutral loop:

- `browser_open`: `{ "url": "https://example.com", "session_id": "optional opaque id" }`
- `browser_snapshot`: `{ "session_id": "opaque id" }`
- `browser_act`: `{ "session_id": "opaque id", "action": { "type": "navigate|click|type|scroll|back|screenshot|snapshot|close", "url": "optional", "target": "latest snapshot ref", "text": "optional", "direction": "up|down", "amount": 600 } }`
- `browser_close`: `{ "session_id": "opaque id" }`
- `browser_use`: deprecated compatibility adapter for saved schemas; selectors are not unrestricted and element actions require a latest-snapshot ref such as `e1`

Browser tool errors include `browser_not_configured`, `browser_url_blocked`, `browser_dns_failed`, `browser_session_not_found`, `browser_session_expired`, `browser_session_limit`, `browser_action_limit`, `browser_target_stale`, `browser_output_limit`, `browser_action_blocked`, `tool_approval_required`, `tool_approval_denied`, and `tool_approval_expired`. Errors are sanitized and never include browser process details, filesystem paths, cookies, storage, credentials, or response headers.

The stable `web_search` arguments are `query` (required), `max_results`, `domains` (up to 10 domain names), and `freshness` (`day`, `week`, `month`, or `year`). Saved legacy definitions using `recency_days` remain accepted by the runtime.

`web_search` results keep the additive-compatible shape:

- top level: `query`, `results`, optional `meta`
- each result: `title`, canonical HTTP(S) `url`, optional safe `original_url`, normalized `domain`, bounded `content`, `retrieved_at`, optional upstream `published_at` / `published_date`, `source`, and `provenance`

`meta` describes the active backend, request policy, backend capabilities, retrieval timestamp, and bounded cache status. Search snippets and webpage text are untrusted external content, not instructions.

The endpoint returns `text/event-stream` with the following events:

- `token`: `{ "delta": "..." }`
- `thinking`: `{ "delta": "..." }` (provider-dependent)
- `tool`: `{ "phase": "started|completed|failed", "tool_name": "...", "activity": "...", "error_code": "..." }` (transient progress only; `activity` is a bounded, sanitized human-readable label and tool arguments/error messages are not exposed)
- `done`: final payload with `provider`, `model`, `finish_reason`, `usage`, `output_text`, `thinking_text`, `tool_artifacts`, `transport` (`direct` or `proxy`), stable `trace_id`, and best-effort `watchdog_trace`. Each browser screenshot artifact has an opaque `artifact_id` and `media_type: "image/png"`.
- `error`: `{ "code": "...", "message": "..." }`

Additional terminal benchmark errors are:

- `benchmark_instance_mismatch`
- `benchmark_saturated`
- `benchmark_queue_timeout`

Client rules:

- Treat `done` as terminal success.
- Treat `error` as terminal failure unless your retry policy allows continuation.
- Do not depend on exact token chunk boundaries.
- Thinking deltas are optional and provider-dependent.
- `finish_reason` may be `stream_closed` when an upstream provider closes the connection without sending a terminal reason; clients should treat that as incomplete and may continue the request.
- The server consumes the complete upstream body before emitting its terminal `done` event and supports standard multiline SSE `data:` frames.
- SSE and newline-delimited JSON upstream bodies are forwarded incrementally. Provider `error` events are terminal and are never followed by a misleading `done` event.
- `web_search` calls run through the bounded tool runtime. Invalid arguments, missing adapter configuration or credentials, and upstream search failure are passed back to the provider as structured tool results; tool-budget exhaustion remains terminal.
- Browser calls may span multiple provider rounds. Sessions remain scoped to the requesting pane when supplied, otherwise to the chat/request identity; the read-only policy blocks consequential interactions and may return a short-lived `approval_request` object alongside `tool_approval_required`.
- Browser screenshot artifacts in `done.tool_artifacts` are fetched from the authenticated artifact endpoint. Clients should render supported image artifacts alongside the assistant response and retain their opaque IDs in persisted message metadata.
- Unsupported provider tool calls remain terminal. The server emits `tool_execution_unavailable` instead of returning an empty successful answer or repeatedly continuing the request.
- Provider output that consists only of textual `<tool_call>` or `<tool_calls>` markup is terminal with `invalid_provider_tool_call`. The server does not treat provider-generated markup as an executable call or a successful final answer.
- Watchdog streams may use a matching direct Ollama profile and asynchronous Watchdog telemetry intake when direct streaming is enabled; otherwise they use the managed proxy fallback.
- `watchdog_ollama_tud` always uses its managed proxy, preventing a work benchmark from using a matching personal direct Ollama profile.
- Direct Watchdog telemetry uses `WATCHDOG_API_TOKEN_FILE` when the Watchdog `/api/*` surface requires token authentication. Telemetry remains best effort: a rejected or unreachable intake logs a sanitized server warning but does not change the successful chat stream contract.
- Codex profiles run through the local Codex CLI rather than an OpenAI-compatible upstream base URL. AI Chat re-emits the final Codex answer through its own SSE contract and can still post Watchdog trace metadata for that local run.
- The Hermes free-model profile uses the exact configured loopback `HERMES_PROXY_URL`. The separate xAI subscription profile uses `XAI_OAUTH_PROXY_URL`; Hermes supplies only its local OAuth bridge, and AI Chat never receives either upstream credential.
- Each continuation pass has a unique telemetry `request_id` under one stable `trace_id`. Provider rounds, transport timing, first token, thinking, tool execution, errors, throughput, and committed state persistence are emitted as optional spans/events. The browser persists `usage.trace_id` only when a Watchdog trace was expected.
- `WATCHDOG_TELEMETRY_CONTENT_MODE=off` is the default and records metadata/counts without prompts, queries, tool results, or response text. `summary` permits bounded structural summaries. `full` explicitly opts into bounded content and remains subject to Watchdog redaction.
- The telemetry contract does not couple runtimes: the model provider, provider-neutral tool registry, each tool adapter, AI Chat persistence, and Watchdog can all operate independently.

## 6a. Scheduled Automation Contract

Automation objects contain `id`, `title`, `prompt`, `profile_id`, `model`, optional `project_path`, `tools` (an explicit array of up to 32 executable runtime tool names), `repeat` (`daily`, `weekdays`, or `weekly`), local `time`, `weekday`, IANA `timezone`, `enabled`, and next/last-run timestamps. Creating or updating an enabled automation calculates its next run in that timezone. Automations do not inherit the interactive app's enabled tools; only the names saved on that automation are advertised to its provider request.

`POST /api/automations/:automationId/run` queues an immediate run and returns HTTP 202 with the run record. Every run creates a new durable chat and records `running`, `completed`, or `failed` history. A textual tool-call envelope fails the run and stores a bounded failure message instead of marking the markup as a completed answer. Scheduled execution occurs only while the server process is running. `GET /api/automations/:automationId/runs` returns newest-first history with the durable chat route when available.

## 6b. Browser Approval Contract

`POST /api/browser/approvals` accepts:

```json
{
  "request_id": "browser-approval_...",
  "scope_id": "chat-or-pane-scope",
  "decision": "approve"
}
```

`decision` may be `approve` or `deny`. Approvals are bound to the requesting scope, exact browser action, and a short expiration. Successful responses return:

```json
{
  "ok": true,
  "approval": {
    "request_id": "browser-approval_...",
    "decision": "approved",
    "expires_at": "2026-07-18T12:34:56.000Z",
    "used": false
  }
}
```

Approval failures are closed and sanitized with `browser_approval_not_found`, `browser_approval_scope_mismatch`, or `tool_approval_expired`.

## 7. Versioning Policy

Package version (`package.json`) follows semantic versioning for release intent.

Contract compatibility policy:

- Patch (`x.y.Z`): bug fixes only, no breaking contract changes.
- Minor (`x.Y.z`): additive fields/endpoints/events only.
- Major (`X.y.z`): may include breaking API/contract changes.

Breaking changes include:

- Removing/renaming endpoints.
- Removing/renaming required request fields.
- Removing stable response fields.
- Changing error codes in a non-compatible way.

## 8. Backward Compatibility Rules

- New response fields must be additive and optional for existing clients.
- Existing stable error codes should be retained; new codes must be documented.
- Deprecated behavior should be announced in release notes before removal.
- Contract-affecting changes require test updates in `tests/server-routes.test.js`.

## 9. Change Control Requirements

Before merging API changes:

1. Update route tests.
2. Update this contract document.
3. Add release notes entry in `CHANGELOG.md`.
4. Ensure CI passes (`npm test`, `npm audit --omit=dev`).

## Stream lifecycle and deferred tool schemas

`POST /api/chat/stream` accepts a caller-generated `request_id` (1–160 characters). Keep it unique per execution. Duplicate active IDs return an SSE `stream_already_running` error. The server limits active streams with `MAX_ACTIVE_STREAMS` (default 32) and sends SSE comment heartbeats every `STREAM_HEARTBEAT_MS` (default 15000). Comments carry no model output and clients must ignore them. The response requests that reverse proxies disable buffering with `X-Accel-Buffering: no`; deployment proxy settings still matter.

Use authenticated `POST /api/chat/stream/cancel` with `{"request_id":"your-execution-id"}` to stop server work. The response is `{"ok":true,"cancelled":true}` for an active request, or `cancelled:false` when no active entry exists. An early cancellation is retained for 30 seconds to cover cancellation arriving before the stream POST. This is not durable idempotency or an execution-status endpoint. A disconnected client alone does **not** cancel execution: detached mobile responses continue and checkpoint to the saved turn. Cancellation cannot undo already-completed side effects. The app uses a shared operator token; request IDs are not tenant authorization.

The terminal `error` event distinguishes `stream_cancelled` (not retryable), `stream_capacity`, timeout errors, `provider_stream_interrupted` (no provider completion marker), and bounded upstream response failures. Preserve received content on error or EOF. A client-side EOF without `done`/`error` is an interrupted connection, never proof of completion. Refresh the saved turn before retrying an uncertain tool execution. The UI avoids automatic recovery after tool activity and does not issue automatic title-generation requests for failed responses.

Set `tool_discovery:true` to enable request-scoped deferred schemas (the browser UI does this). The complete authorized catalog still comes from `tools` plus enabled saved runtime presets under the existing `include_saved_runtime_presets` policy. Common entry tools, including authorized `local_file_list`, remain advertised. Less-used built-in schemas appear by name in a compact index. `tool_discover({"query":"local_file_write"})` or a category query (`local`, `browser`, `skill`, `action`) loads up to eight matching authorized schemas for the **next** provider round. An empty query lists names. Disabled or absent tools cannot be enabled through discovery. Custom tools remain advertised. Requests without this flag retain eager schemas; nonstreaming bridge requests and Codex CLI retain their existing tool contracts.

Native Ollama and OpenAI-compatible streaming share the discovery and execution contract. The next round recalculates the executable allowlist from advertised schemas; requesting a deferred tool in the same batch as discovery fails authorization. Clients should wait for discovery results before invoking loaded tools. Initial schema savings can trade off against an extra discovery round on tasks requiring deferred tools.

Streaming `done.context_budget` and value-free `model_context_budget` audit/trace events report `system_chars`, `conversation_chars`, `tool_result_chars`, `tool_call_chars`, `tool_schema_bytes`, and `tool_schema_count`. Audit/trace events also list exposed tool names and round index. These counters are characters/bytes, not tokenizer measurements or a billing estimate. Provider-reported usage remains authoritative when available. A trace records requested calls and selected executor/backend; it does not claim to expose private model reasoning.

HTTP-provider streaming `done` and `error` records include dispatched `provider_rounds`, `usage_reported_rounds`, and `usage_complete`. Errors preserve usage from completed rounds even if a later provider call fails. A present numeric `usage.cost` is retained and summed only when each reported round supplies it; incomplete cost stays unknown. Check round coverage before treating usage as a total-task measurement. Context rejection before dispatch does not count as a provider round.

Tool-enabled streams retain `tool_calls_executed` on errors. A length-limited turn
can continue at most twice within the same execution (`length_continuations`). An
explicit `stop` with no answer text in the terminal turn can also continue at most
twice (`empty_continuations`); earlier progress text does not count as that answer.
Exhaustion returns `output_continuation_limit` or `empty_final_response`, with
`retryable: false`. These are completion failures, not network failures. Partial
output and tool receipts remain inspectable; automatic recovery does not replay
completed tool calls. Clients must still verify task-specific artifacts before
calling a successfully delivered response a successful task.


`GET /api/health` includes `streaming.active`, `streaming.max_active`, and `streaming.heartbeat_ms`. SSE parsing bounds retained records to 1 MiB; provider HTTP error responses and search upstream JSON are bounded to 2 MiB while reading. Action adapters enforce their configured byte limit during reads.

### Search attempt provenance

`web_search` results include `meta.failover: { used, primary, attempts }`. Each attempt records `backend`, its per-backend `attempt` number, and `status` (`completed` or `failed`). Failed attempts add a bounded error `code` and HTTP status when available. `meta.backend` and each result's `provenance.backend` identify the backend that supplied the evidence, including cached fallback results. Exhausted search errors expose `error.search_attempts` in the tool result sent to the model.

`GET /api/health` search status reports `alternate_backend` and `max_attempts`. Failover is operator-configured with `WEB_SEARCH_ALTERNATE_BACKEND`; the model cannot select it. The default is disabled. Total attempts are bounded to two on the primary and one on a distinct alternate; deterministic errors and cancellation stop immediately.

### Durable execution foundation

Streaming requests use `request_id` as an execution identity, bound to the normalized request and assistant turn. An identical completed request returns its saved `done` result with `replayed: true`. Reusing the ID for a different request returns `execution_conflict`. Interrupted executions require `resume: true` with the same request; unresolved tool outcomes require reconciliation first. This provides durable receipts, not exactly-once execution of external effects.

Authenticated inspection endpoints:

- `GET /api/executions/:id` returns the execution, checkpoint, and call receipts.
- `POST /api/executions/:id/resume` resumes the exact stored request and emits SSE. Its body cannot replace the model, messages or tools. Authentication and current executor permissions still apply; changing the saved profile's provider rejects resume. A missing ID returns 404, an expired ID returns 410, and a running/uncertain execution returns a structured SSE error without dispatching another attempt.
- `GET /api/executions/:id/events?after=0` returns up to 256 ordered events after a nonnegative sequence cursor, plus `status` and `next_cursor`.
- `POST /api/executions/:id/calls/:callId/reconcile` accepts `disposition: "completed"` with an observed result object, or `disposition: "not_started"`, and nonempty `evidence` of at most 4,000 characters. Inspect the actual outcome before submitting. Reconciliation cannot run while the execution is active.

Persisted SSE events carry numeric `id` sequence values. The client can drain saved events without creating a second model request. Inspection includes `last_cursor` and `resume: {allowed, reason}`. Event pages include `terminal_cursor` (zero while running); clients skip terminal records from older attempts and stop at the current one. A slow consumer exceeding the 256 KiB output buffer is disconnected; events remain in the journal for cursor replay. Startup restores interrupted saved turns and marks calls with no confirmed result as uncertain. Shutdown checkpoints and cancels active streams before closing SQLite.

`EXECUTION_RETENTION_DAYS` controls terminal journal payload retention (default 90 days; 0 disables cleanup; maximum 36,500). Startup and new execution admission expire up to 100 eligible runs per batch. Only completed, failed or cancelled runs without started/uncertain receipts qualify. Running and interrupted executions, and unresolved external outcomes, remain available. Expiry removes request/checkpoint/result/event/call payloads but retains the ID, turn identity and fingerprint indefinitely. An expired ID fails with `execution_expired` instead of dispatching the request again; its event endpoint returns HTTP 410. This is logical database cleanup, not secure erasure of SQLite pages or existing backups. Saved chat transcripts have their own retention policy.

Each saved assistant response offers **Review execution** when it is not streaming. The dialog shows status and receipts. Completed executions restore their saved result, running executions recover output, and interrupted executions resume only after unresolved calls are reconciled. Reconciliation requires the user's observed outcome, evidence and, for a completed call, its result. Stop also cancels resumed requests. Resuming updates the original response instead of creating a new user/assistant pair or adopting changed pane selections.

Streaming Codex executions persist their native session. The journal records its thread ID, home/workspace scope, attempt boundary, and observed command/search/file/MCP/tool receipts. After an interruption, `native_attempt` requires operator reconciliation even when individual tools have completed: the CLI may have performed an action before its event was observed. Inspect native history and actual external outcomes before resolving that boundary. Resume invokes `codex exec resume` with the exact saved ID and verified receipts, keeps the configured sandbox, and rejects a changed session identity. It does not submit the original transcript as a fresh session. A clean native process exit without `turn.completed`, or with unresolved action receipts, is not completion.

Legacy native runs created without persistent session metadata, or runs whose Codex home/workspace changed, fail with `execution_resume_unavailable`. Missing native session files cause a native CLI failure; they never trigger automatic fresh execution. Auxiliary JSON Codex requests remain ephemeral. Native session files are owned by Codex and are outside AI Chat's journal retention policy. Completed native results can be replayed within journal retention. Only one local process may own an execution database; a live recorded PID prevents takeover.

### Whole-request context allowance

`MODEL_CONTEXT_LIMITS_JSON` maps `provider:model`, provider name, or `default` to a context window between 1,024 and 4,000,000 tokens. Selection order is exact override, provider override, dated exact-model metadata, configured default, then 65,536. `MODEL_CONTEXT_METADATA_PATH` optionally points to a local JSON file with `fetched_at` (ISO timestamp) and `models: [{provider, model, context_window}]`. Use the actual route provider ID, including managed routes such as `watchdog_openrouter`. Populate values from the provider's current catalog; the application does not infer a limit from the model name. The Codex model cache is also read, including its effective context percentage. Catalogs over 8 MiB, invalid timestamps, or timestamps older than 30 days are ignored. Static metadata is rechecked at most once per minute, so expiry and file changes take effect without restart. It never adds prompt instructions.


Opt-in `MODEL_CONTEXT_DISCOVERY_ENABLED=1` discovers exact-model capacities before
requests and caches them beside the database (`MODEL_CONTEXT_CACHE_PATH` overrides
the path). `MODEL_CONTEXT_SOURCES_JSON` maps a profile ID (preferred) or provider ID
to `{type:"ollama",url:"https://ollama.com"}` or
`{type:"models",url:"https://provider.example/v1"}`. These operator-configured
sources are public, credential-free metadata endpoints. OpenRouter has a default
source; Hermes/xAI use their configured authenticated local model catalogs and
ChatGPT uses its existing connection lease. Codex retains its effective-window
cache. An unknown native Codex model keeps a conservative initial-transcript
check, but AI Chat does not override the native harness window/compaction limit
with that guess; explicit configured overrides still apply. Other/custom/Watchdog routes require an explicit source mapping: model names
do not prove routing or capacity. Do not map local Ollama to cloud metadata;
local runtime `num_ctx` can be smaller than the model architecture maximum.

Selection is exact/provider override, fresh discovered profile/route/model record,
static exact-model metadata, configured default, then conservative 65,536 fallback.
Discovered catalogs are numeric-only, bounded to 8 MiB/4,096 entries, use 10-second
HTTP deadlines and reject redirects. Refresh interval is one day; failed discovery
backs off for five minutes and may retain a previous record for at most 30 days.
Profile route/source/account changes invalidate discovery identity. Descriptions,
credentials and remote instructions are never persisted. A documented output cap
is reserved separately and limits `max_tokens` on actual requests.

Authenticated `GET /api/model-context` returns `{ok,discovery_enabled,models}`;
each row includes `profile_id`, `provider_id`, `model`, `window_tokens`, `source`,
`known` and optional `max_output_tokens`. `known:false` identifies an unverified
fallback, not a provider-advertised capacity. Authenticated
`POST /api/model-context/refresh` refreshes all saved model selections with three
workers, deduplicates concurrent refreshes and returns the same coverage shape.
It respects cache/backoff, does not change profiles or model selections, and
returns 409 if discovery is disabled. Partial discovery remains explicit in rows;
`ok:true` does not assert every model is known. `npm run context:refresh` invokes
this endpoint on a loopback server; an optional filename saves the numeric report.

Without an explicit `MAX_TOOL_CONTEXT_CHARS`, tool-result retention grows to the
selected model's input allowance; the whole-request budget still enforces safety.
An explicit operator cap remains authoritative. Small models retain the existing
conservative path. No receipts, protocol IDs or protected constraints are dropped
to pretend an over-budget request succeeded.

Both JSON and streaming requests reserve requested output and estimate input from serialized messages, reasoning, tool arguments, schemas, and receipts using UTF-8 bytes plus framing. Streaming repeats this check with the currently loaded schemas before each model round. JSON checks its final bridge payload before dispatch. If the requested output reservation prevents protected input or completed tool receipts from fitting, AI Chat halves that reservation down to a 1,024-token floor, retrying against the original messages; the reduced `max_tokens` is sent to the provider and reported as `output_reservation`. Impossible protected input still fails with `context_budget_exceeded` (HTTP 400 for JSON). Success responses expose `context_budget`, including the selected limit/source, `context_limit_known`, optional `model_max_output_tokens`, removals, reservation and measurement scope. Estimates are not vendor tokenizer counts or billing measurements.

Native Codex requests budget the supplied transcript and wrapper before spawn; `context_scope: "codex_initial_transcript"` distinguishes that measurement from the CLI's additional instructions, tools and internal history. AI Chat passes the chosen window and a total-context auto-compaction threshold (at most 80% of the window and within the input allowance) to Codex for its own continuing loop. The requested output amount is an input reservation, not a native CLI output cap. See the official [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) for `model_context_window`, `model_auto_compact_token_limit` and its `total` scope.

### User-saved chat continuity

`GET /api/chats/:chatId/continuity` returns `{ ok: true, continuity: { constraints, decisions, revision, updated_at } }`. A chat without notes starts at revision zero. `PUT` at the same path takes `{ constraints, decisions, revision }`; both text fields are required and together may contain at most 8,000 characters. Successful updates increment the revision. A stale or missing revision returns HTTP 409 `continuity_conflict`. Invalid text returns HTTP 400 `invalid_continuity`; missing chats return HTTP 404 `chat_not_found`. All routes require normal app authentication.

`DELETE` at the same path takes `{ revision }` and clears both fields while incrementing the revision, so stale clients cannot resurrect cleared notes. Deleting the chat removes its continuity record. Ordinary transcript state saves preserve the latest independent continuity record; they cannot overwrite notes from an older cached snapshot.

Notes are encrypted at rest and explicitly edited by the user through Saved notes in the sidebar. They are not inferred from summaries or automatically rewritten by agents. New chat and streaming requests carrying the chat's `chat_id` include the notes as protected context for every pane. Existing in-flight requests retain their original snapshot. Notes remain subject to application policy, tool permissions, and the latest explicit user request. Requests without a matching saved chat receive no chat-specific continuity. Oversized protected context can still fail the configured context budget; it must not silently discard the notes.

### Static page reader tool

`web_fetch({ url, max_chars? })` returns `{ ok, url, title, text, links, truncated, fetched_at, provenance, rendering }`. `url` and `provenance.final_url` identify the final checked destination; provenance uses `backend: "http-static"`, `source_type: "page"`, `source_domain`, `redirect_count`, and `content_is_untrusted: true`. Links are evidence only; following one still requires a fresh policy check. `rendering.performed` is false. `rendering.may_be_needed` and `hint` explain when an available browser may help.

Health exposes `tool_runtime.web_fetch` and the selectable schema. Registration does not authorize a request: callers must advertise the tool or select its saved enabled preset. It works with the browser disabled, but inherits `BROWSER_ALLOWED_HOSTS` and the same URL/DNS checks. Failures use `web_fetch_*` codes, including `url_blocked`, `dns_failed`, `navigation_blocked`, `output_limit`, `content_type`, `encoding`, `timeout`, `cancelled`, and `upstream_failed`. Error tool results follow the normal bounded continuation contract. HTTP errors or blocked redirects do not trigger a hidden rendering fallback.

### Browser containment status

`GET /api/health` includes `tool_runtime.browser.containment` with `available`, `backend`, `reason`, `direct_network`, and `filesystem_isolated`. The macOS implementation reports `macos-seatbelt`, denies direct browser networking, and preserves parent-mediated HTTP policy checks. Missing enforcement prevents browser schemas from being advertised; launching without containment is not a fallback. `browser_containment_unavailable` identifies a rejected or failed contained launch. Linux reports `linux-bubblewrap`, `direct_network: "isolated_namespace"`, and `filesystem_isolated: true`, with scoped mounts and separate PID/IPC/network namespaces. macOS reports `filesystem_isolated: false` and does not claim general IPC isolation. Headed mode and unsupported operating systems fail closed. A failed Linux namespace probe reports `bubblewrap_user_namespace_unavailable`.

### Auxiliary request cancellation

`POST /api/chat` accepts an optional `request_id` with the same 160-character bound as streaming requests. `/api/chat/stream/cancel` cancels either route by this ID. JSON requests have no SSE heartbeats and cancel when the client disconnects; streaming requests retain their detached execution behavior. Explicit cancellation returns HTTP 499 with `stream_cancelled` for an attached JSON client. Shutdown rejects new admission and waits for registered requests, including bridge and Codex child termination, before closing the journal database.

Benchmark admission uses the request's cancellation signal. A cancelled queued request is removed immediately, releases its timeout/listener, and cannot later consume a provider slot. `streaming.active` counts registered streaming and JSON model requests. Browser Stop also cancels title and completion-repair requests. These auxiliary requests advertise no tools or saved runtime presets; cancelling a title suppresses its JSON fallback and title update.

`streaming.output` in health reports `connections`, aggregate `pending_bytes`, `blocked` writers, cumulative `closed` connections and `overflows`, `buffered_peak_bytes` (maximum accepted per-connection buffer), and `per_connection_limit_bytes` (262144). Pending bytes include Node's response buffer. These counters support sustained memory/backpressure analysis without retaining per-request output. An overflow attempt can exceed the limit, but that frame is rejected before entering the accepted buffer.

## Documentation example preferences

Chat state and `chat_upsert` accept an optional `retrieval_preferences` object with `programming_language`. It is stored in SQLite and returned by state/chat reads. The composer **Code examples** field edits this chat preference; empty means any language. Branching a chat preserves its selection.

`POST /api/chat` and `/api/chat/stream` accept the same field. Explicit request presence overrides the saved chat selection; `{}`, null, or an invalid identifier clears it for that request. Absence uses the saved selection. Valid identifiers are trimmed/lowercased, match `[a-z][a-z0-9_-]*`, and contain at most 64 characters; `c++` and `c#` normalize to `cpp` and `csharp`. No repository, file, prompt, or runtime-language inference occurs.

Only the configured `documentation_query` tool consumes the preference. Its model-facing schema accepts `query`; endpoint, credentials, namespace, and language preference are host-owned. Set `AI_CHAT_RAG_URL`, optionally `AI_CHAT_RAG_NAMESPACE` and `AI_CHAT_RAG_TOKEN`, and set `AI_CHAT_RAG_SUPPORTS_PREFERENCES=1` only for a supporting Kujo RAG endpoint. Add and enable the **Documentation schema** preset in Settings. Existing tool authorization still applies; a guessed unadvertised tool cannot run.

The adapter POSTs JSON to `/query`, follows no redirects, makes no capability probes/retries, limits responses to 256 KiB and elapsed transport time to ten seconds, and preserves text plus citation path/line ranges. Without support enabled it sends an ordinary query. No preference enters provider options, browser headers, or `Accept-Language`. RAG must ingest explicitly grouped example blocks with its Markdown-example option to return reduced context.

`node scripts/rag-documentation-smoke.js` exercises the real SSE/tool path against `AI_CHAT_RAG_URL` with local model fixtures and verifies saved defaults, request override, clearing, and captured model input without provider charges.

Documentation results that exceed the input allowance keep the highest-ranked complete citations first. The provider-bound result reports `compacted` and `omitted_citations`; saved execution receipts retain the full lookup result. Native Ollama tool groups are matched by their ordered tool names and indexes when compacting completed work.

With `WATCHDOG_DIRECT_STREAMING` enabled, the personal Ollama route prefers a matching direct credential profile but can use a validated Ollama credential whose model suggestions are stale. The shared Ollama TUD route continues through its configured Watchdog upstream.

## Local ChatGPT plan connections (preview)

These routes require the existing App Access token and Host/Origin checks, plus a loopback client. `CHATGPT_SIGN_IN_ENABLED=1`, a loopback server host and disabled proxy trust gate this local OSS feature. They do not establish an AI Chat application session.

| Method | Route | Request / result |
|---|---|---|
| GET | `/api/connections/chatgpt` | `{ok, enabled, connections}`; public identity/status, explicit `plan_usage_enabled`, one-time `plan_notice_required`, usage link. No plan-name/quota or token fields. |
| POST | `/api/connections/chatgpt/login` | Optional `{connection_id, reconsent}` → `{ok, attempt_id, authorization_url, expires_at}`. At most one pending sign-in; open URL on the server's computer. |
| GET | `/api/connections/chatgpt/attempts/:id` | Pending/exchanging/completed/failed/expired/cancelled status; public connection on success. Terminal status retained briefly. |
| POST | `/api/connections/chatgpt/attempts/:id/cancel` | `{}`; cancels the one-time callback transaction. |
| GET | `/api/connections/chatgpt/:id/models` | `{ok, models:[{slug,display_name}]}` for this account and scope; uncached upstream catalog. |
| POST | `/api/connections/chatgpt/:id/acknowledge-plan` | `{}`; persist dismissal of first plan-use notice, separately from rotating tokens. |
| POST | `/api/connections/chatgpt/:id/disconnect` | `{}` → `{ok, disconnected, remote_revocation_confirmed}`. Local cleanup still happens when remote revocation fails. |

Profiles accept `provider_id:"openai_chatgpt_plan"` and an opaque `connection_id`. API keys and custom URLs are rejected for this provider. Established bindings cannot change in place; create another profile to use another account. State exports contain only the reference; importing on another installation does not transfer access.

`/api/chat/stream` keeps its existing SSE contract and neutral tool permissions. Its execution request adds `connection_binding:{connection_id,binding_epoch,billing_source:"chatgpt_plan",harness:"ai_chat"}`. Success includes the billing source, connection reference and harness. Resume rejects changed bindings; no request retries against another billing source. `/api/chat` collects a mandatory upstream stream and rejects tool requests, which belong on the streaming route. `/api/transcribe` rejects this provider.

ChatGPT streaming errors may use `chatgpt_connect_timeout`, `chatgpt_network_timeout`, `chatgpt_dns_error`, or `chatgpt_connection_error` when a known transport cause is available. Unknown failures retain `chatgpt_provider_error`. These safe categories are persisted in execution results with `retryable: false`; they do not authorize automatic replay or imply that prior tool work failed. Completed upstream output-item events are retained when the terminal envelope omits its output, but tools remain gated on successful response completion.

See [connection setup and limitations](CHATGPT_PLAN.md). The native Codex profile remains separate; App Server RPC and public website login are not exposed by these routes.

## September 2026 hardening clarifications

- Automation `weekday: 0` (or `"0"`) selects Sunday on both create and update. Existing erroneously saved Monday schedules need an explicit user edit; no stored schedule is silently migrated.
- Shutdown stops automation admission, cancels loopback transports, and waits for run persistence before closing SQLite. Deleting a run's chat during execution does not recreate it; surviving run history still reaches a terminal status. Full-state replacement preserves automation links to chats retained under the same IDs and leaves links null for deleted chats.
- Transcription accepts one audio file plus at most 16 fields / 17 total parts. Each field is limited to 16 KiB and each field name to 100 bytes. File overflow keeps HTTP 413 `file_too_large`; other multipart limit violations return HTTP 400 `invalid_multipart`. Upstream response bodies are limited to 2 MiB, remain subject to `REQUEST_TIMEOUT_MS` after headers arrive, and cannot redirect. Transport/body failures retain `transcribe_failed`.
- ChatGPT Responses records and aggregate normalized output use UTF-8 byte limits (2 MiB and 16 MiB). Multiple valid records in a single transport chunk remain valid. Oversized output fails explicitly without authorizing incomplete tool calls.
- Native Codex stdout and stderr share `CODEX_MAX_OUTPUT_BYTES` (32 MiB by default, configurable from 1 KiB to 256 MiB). Overflow stops the process and reports `codex_exec_failed` with the named limit. Persistent execution receipts still require reconciliation before replay of uncertain actions.

No route, persisted schema, profile binding, API-key format, or provider selection changed.

Unknown authenticated `/api` routes return HTTP 404 JSON with `error.code: "api_not_found"`; they do not return the browser application HTML. Non-API browser routes retain the application fallback.

When `HERMES_WATCHDOG_UPSTREAM_PROFILE` is configured, managed Hermes JSON and SSE requests use the server-side Watchdog proxy token and named-upstream header. Observe headers retain request correlation. The downstream Hermes proxy owns Nous OAuth. The direct Hermes and xAI modes remain independent.

### Saved tool evidence during compaction

HTTP tool-enabled executions advertise the internal `tool_result_read` function alongside the caller's authorized tools. Compacted receipts retain a `result_ref` (or `saved_result_ref` in result JSON). The reader accepts that reference plus optional `offset` (default 0) and `limit` (default 3000, maximum 4000 UTF-16 code units; one extra code unit may preserve a surrogate pair). Follow `next_offset` until null. Pages contain the original saved result serialized as JSON, treated as untrusted evidence.

Reads are restricted to completed/failed receipts in the current execution; callers cannot supply another execution ID. Reading never re-executes the original tool. External tool permissions remain unchanged. Recovered pages are protected for their immediate next provider round, while older results remain compactable. `max_tokens` is an upper bound: output reservation may shrink to retain input evidence, without exceeding the context policy.

With `tool_discovery: true`, a premature call to an authorized but deferred tool does not execute it. AI Chat loads that tool's schema and returns a `tool_schema_required` receipt with `execution_started: false`; the model must submit a new call against the loaded schema. This consumes the normal bounded tool budget. Disabled, unknown and malformed tool names remain rejected, and resumed executions restore schemas loaded by these receipts. Shell schema validation failures before executor dispatch also prove non-execution; errors after dispatch remain potentially consequential.

### Local command permission settings

Authenticated `GET /api/local/permissions` returns `{ok, permissions: {skip_allowlist, allow_destructive}, shell_enabled}`. Authenticated `POST /api/local/permissions` requires both boolean fields. Each false→true transition additionally requires its exact `skip_allowlist_confirmation` (`ALLOW UNRESTRICTED COMMANDS`) or `allow_destructive_confirmation` (`ALLOW DESTRUCTIVE COMMANDS`). Destructive mode without unrestricted mode returns 400. To disable unrestricted mode send both false. Changes are atomic, persist independently of ordinary state synchronization, and emit `local_command_permissions_changed` without storing confirmation text. These settings do not enable the server's local shell.

### Local shell deadlines

`local_workspace_list.meta.limits.command_timeout_ms` is the server-enforced cap;
`local_shell.timeout_ms` cannot raise it. The cap defaults to 600000 ms (10 minutes).
An omitted timeout uses `meta.limits.command_default_timeout_ms`, default 120000 ms
(2 minutes), configurable with `AI_CHAT_LOCAL_COMMAND_DEFAULT_TIMEOUT_MS`. Explicit
existing caps remain respected, including caps below the default. These are per-command
deadlines, not limits on the whole agent task. Provider idle timers are paused during
local tool execution; SSE heartbeats and Stop remain active. Permission bypass does
not disable deadlines.
A timeout observed after process close is a failed tool receipt with
`execution_completed: true`, `timed_out: true`, the effective `timeout_ms`, bounded
`stdout`/`stderr`, `exit_code`, `signal`, and `partial_effects: "unknown"`.
The model receives this result and can inspect effects or adapt a pure benchmark.
It must not interpret termination as rollback or blindly repeat consequential work.
Errors without a confirmed execution outcome still require reconciliation.
On POSIX, timeout/cancellation signals target the command process group with a
one-second force-kill grace period. This is not containment of deliberately
detached descendants. Windows uses direct-child termination.

### Retained execution evidence

Provider-bound compacted receipts retain deterministic `outcome` facts. Successful
complete `tool_result_read` pages can restore those facts to their original action;
`read_call_ids` then lists its evidence-retrieval calls. Partial or failed reads and
ambiguous source identities are not folded. Full chronological receipts remain in
`GET /api/executions/:id`. Legacy compacted checkpoint text is accepted on resume.
Context metrics may include `recovered_facts`, the number of projected retrieval
records folded into original actions on that budget pass. This is not a count of
reexecuted actions or newly verified task completions.

Identical historical `local_file_read` snapshots share a projected outcome and keep
all read identities in `read_call_ids`. The fingerprint includes request arguments,
content, pagination and stable file metadata. Changed snapshots and failures remain
separate. This only reduces provider context: each live read still executes and
retains its own journal receipt. `folded_file_reads` reports projected rows folded.
Under context pressure, old read excerpts and input copies give way before recent
execution outcomes, preserving actionable failure evidence longer.

`local_shell` successful and completed-timeout results include nonnegative
`duration_ms` (monotonic spawn-to-close elapsed milliseconds). Completed-timeout
results also retain workspace-relative `cwd`. These additive fields survive bounded
outcome projection. Spawn failures have no completed-process measurement.

Shell argument limits are enforced before spawn: at most 40 strings, each at most
1,000 UTF-16 code units, with no NUL characters. The schema advertises these bounds.
Oversized arguments now return `invalid_tool_arguments` with known non-execution;
they are no longer silently truncated and dispatched. Use a script file for longer
inline programs. Valid argument whitespace and empty arguments are preserved.
Executable paths retain internal whitespace and reject overlength rather than
truncating. This intentionally corrects behavior for previously corrupted inputs.

After actual tool use, a text-only stop immediately following output-limit recovery
receives one bounded completion review if no intervening tool call made progress.
The review asks the model to finish outstanding work or report a verified result
or blocker; it does not infer completeness from particular words or require new
side effects. `post_limit_checks` records this extra review, and its state persists
in execution checkpoints. The existing two output-limit and two empty-answer
continuation caps remain unchanged. This is a recovery aid, not proof that an
arbitrary task is semantically complete; benchmark adjudication remains separate
from transport success.

Process-group termination errors return `local_shell_termination_failed` with
`execution_completed: false`, `retryable: false`, and retained partial output.
They never claim rollback or confirmed process termination. Inspect the process
before retrying. Successful force-kill is not repeated after the child closes.

### Experimental engineering review metadata

With server opt-in `ENGINEERING_REVIEW_ENABLED=1`, new provider-neutral streaming
executions that perform local write/shell work can enter independent review and
bounded repair. See [workflow and limits](LOCAL_AGENT_CAPABILITIES.md#independent-engineering-review-experimental).
No request tools or permissions are added to the worker, and native Codex/JSON
chat are unchanged.

An additive `review` SSE event reports phase changes with
`{enabled, phase, reviews, repairs, outcome}`. During reviewer inference it carries
`{phase:"review", kind:"token"|"thinking", delta}` instead. The review-only
`engineering_review_submit` protocol control produces a
`{phase:"review", kind:"verdict", verdict, findings, checks}` event; it does not
execute a runtime tool or create an executable-call receipt. Clients must preserve
these deltas if they archive the complete multi-phase output; ordinary `token` and
`thinking` continue to contain the worker's answer/reasoning. The built-in UI shows
review/repair status and leaves detailed review content in the execution journal.
`done.engineering_review` reports the final advisory status;
`done.review_text` and `done.review_thinking_text` contain complete review deltas.
Usage and provider-round counters include reviewer and repair requests. Older
clients can ignore the additive event and metadata. Worker output is never
retroactively deleted or replaced. Unresolved/inconclusive review status is also
appended to ordinary answer text. This status is distinct from transport success:
`done.ok=true` does not assert that engineering review passed.

Review state is checkpointed for explicit resume. Completed execution replay
returns the saved result without starting another review. Detailed events remain
available through the existing execution event API, including if a reviewer is
cancelled before producing a verdict.

### Engineering verification and task budgets

Generic streaming requests accept optional `task_deadline_ms`, a positive integer
UTC epoch-millisecond deadline supplied by the caller. It is saved with the
execution and exposed as remaining-time guidance each provider round. Resuming
an execution retains its original deadline. This field is advisory: it does not
extend existing network/tool limits or introduce cancellation for ordinary chat.
The benchmark runner sends its existing external deadline. Native Codex keeps
its own harness; these provider-round instructions apply to the generic loop.

Independent review reserves its fourth and final round for
`engineering_review_submit` only. Invalid verdicts retain bounded field/code
diagnostics without echoing rejected values. One rejected submission per review may
be corrected using the remaining rounds and time, with exact inspected reference
choices in the feedback. A second rejection, exhausted budget or invalid final-round
submission remains inconclusive; validation and permissions are unchanged. The
correction count survives checkpoints. Review packets include a bounded
inventory of final code-write receipts and recognized verification commands. A
pass is changed to a repair request when recorded successful verification
predates a later code write. This is a temporal check, not proof of coverage:
shell edits and imported dependencies still require inspection. Existing review,
repair, permission and wall-time limits remain in force.

`local_kujo` is an optional provider-neutral local tool with operations `guide`,
`check`, `run`, `test` (`test-run`), and `benchmark`. It uses the **PATH `kujo`** by default,
not the bridge's `KUJO_BIN`, and the existing local shell opt-in, command allowlist,
workspace path checks, cancellation and output bounds. It does not sandbox
scripts or grant additional permissions. An operator can set absolute
`AI_CHAT_AGENT_KUJO_BIN` and optional `AI_CHAT_AGENT_KUJO_SHA256` after running
`scripts/qualify-kujo-runtime.js`. Both `local_kujo` and literal `local_shell`
command `kujo` use that executable, after normal permission checks. A missing
executable or mismatched hash fails before spawn without PATH fallback. Hashing
is a qualification guard, not an execution sandbox or protection against all
filesystem races. Explicit other executable paths are not rewritten; child environments follow the qualified runtime inheritance rules below.
`AI_CHAT_AGENT_KUJO_BACKEND=default|interpreter` selects `local_kujo` run and
benchmark behavior; shell arguments stay literal. `check` uses the compiler and
`test` uses Kujo's interpreter-based `test-run` command, which has no backend flag.
Receipts identify the selected executable/hash/backend. `path` is relative to `cwd`; source
must be a bounded non-sensitive `.kujo` file in the configured workspace.

The guide probes the executable version and returns one small reference topic
(`core`, `arguments`, `collections`, `timing`). Examples are verified only on
listed runtime versions; other versions receive no claimed verified example.
Execution results include the actual version, source SHA-256 before/after, exit
status and output. Source changes make verification unsuccessful. Hashes cover
the selected file, not imported dependencies. `check` is syntax/compiler
validation; behavioral checks belong in the script/tests and independent oracles.

Benchmark requires `pure:true`, an explicit `budget_ms` (1,000–600,000), and
1–7 trials (default 5). It calibrates once, estimates whether trials fit while
reserving time, and refuses repetition if they do not. It never automatically
scales a workload or retries a failed trial. Timings are process wall times,
including startup; output equivalence must be verified separately. Script
side effects remain the caller's responsibility even with `pure:true`.

Benchmark result panes now retain `execution_id`, `usage_complete`, and
`usage_source`. Failed streams inspect their saved journal once with a bounded
request, without resuming work. Missing/running/incomplete usage remains marked
incomplete. Recovery of usage never changes failure into acceptance. Older
servers without `local_kujo` retain the original local-dev tool preset.

### Engineering task contracts

`ENGINEERING_CONTRACT_ENABLED=1`, together with engineering review enabled, adds
a protocol-only `engineering_contract` tool to generic development turns with
authorized local write/shell/Kujo tools. This does not grant executable tools.
The worker records 1–8 failure invariants and executable check plans before
implementation, then links each invariant to real successful execution receipts.
The plan is immutable; a late plan is disclosed. Syntax-only Kujo checks, reads,
failed/truncated results and invented references cannot satisfy it. Later file
writes invalidate earlier evidence links. Missing evidence converts a reviewer
pass to a bounded repair request. This proves receipt completeness, not semantic
coverage: shell edits and dependencies still require inspection, and model-written
tests are not independent oracles. Reviewer instructions require inspecting what
the checks actually assert. Explanation-only turns need no contract.

Contract calls must be submitted alone. Mixed batches execute nothing. They use
the existing provider-round budget and persist in the execution checkpoint; they
do not increment executable-tool counters. Reviewer/final phases cannot mutate
the contract. Old checkpoints never gain the requirement retroactively.

With contracts enabled, two recent executable failures trigger at most three
category-specific diagnostic reminders per execution, persisted across resume.
They advise saved-evidence recovery and a minimal pure reproduction rather than
blind retries. They never execute a probe, change a runtime, replay consequential
work or increase a timeout.

Kujo guide topics now also include `json`, `errors`, and `persistence`, with
expected output. The persistence example requires a fresh owned directory and
checks failed-write disk/visible-state consistency before a successful commit.
These examples are independently executed by the reference/qualification scripts.

### Qualified runtime inheritance

When an agent Kujo executable is configured, local shell children inherit a private
PATH directory containing only a `kujo` symlink to that qualified executable.
`KUJO_BIN` in those children points to the same alias; the parent server's bridge
setting is unchanged. This covers test harnesses which spawn `kujo` by name or
read `KUJO_BIN`, without exposing provider credentials or shadowing other commands
from the configured executable's directory. Shell arguments/backend flags remain
literal; the structured `local_kujo` backend option is unchanged.

The pin is validated before every local command when configured. A missing or
changed pinned executable/alias fails before spawning even an intermediary such
as Node, preventing silent fallback through nested commands. Remove or repair
the operator pin if it is no longer valid. With no pin configured, command
environments retain their prior behavior. Permissions are checked before creating
any alias. One private directory is reused per local runtime and cleaned up when
it closes (with process-exit cleanup as a fallback). This is runtime consistency,
not a sandbox or protection against concurrent same-user filesystem mutation.

The review verification inventory also includes executable receipts explicitly
linked by the task contract, so a custom harness such as `node test.js` can
establish temporal freshness without relying on a command-name heuristic.
These entries are labeled `contract_linked_execution`, distinct from recognized
check commands. Each check includes bounded 500-character stdout/stderr tails
and the executor's truncation flag; these excerpts remain untrusted evidence.
The reviewer must still inspect the test's assertions and source coverage.
A later file write invalidates the temporal evidence as before.

Large `done` events retain their complete fields and SSE framing. The server
writes terminal frames in bounded byte chunks with backpressure; a large result
alone is not evidence of a slow consumer. Heartbeats stop once terminal delivery
begins. The 256 KiB pending-output limit still applies to ordinary queued events;
the already-materialized terminal result is separate from that socket queue.
Disconnects still permit journal inspection/replay without rerunning tools.
Benchmark receipts retain `ok: false` for failed delivery even when the journal
reports `execution_status: "completed"`; artifact acceptance requires separate
verification.

### Kujo verification manifests

`local_kujo` accepts optional `verification_paths`: up to 16 unique readable workspace paths relative to `cwd`. Receipts add `verification_manifest` and `verification_manifest_after` (path/SHA-256 rows). `source_unchanged` and `ok` are false if any declared file changes or disappears during execution. This covers declared files only, not automatic dependency discovery or semantic correctness. Existing calls remain valid. See [Kujo quality workflow](engineering/kujo-quality-workflow.md).

### Optional compact Kujo workflow and CLI case batches

`KUJO_GROUNDING_MODE=legacy|compact|off` defaults to `legacy`. Compact mode performs
one permitted runtime guide probe for a Kujo request with `local_kujo` authorized,
saves it as `__kujo_grounding`, and supplies a bounded reference only for a recognized
runtime version. It does not grant shell access or qualify arbitrary programs.
Terminal replay reuses saved results. Runtime and permission checks still apply
to every subsequent execution.

With `KUJO_VERIFICATION_BATCH_ENABLED=1`, `local_kujo` additionally offers:

```json
{
  "root_id": "workspace_0", "operation": "verify", "path": "main.kujo",
  "budget_ms": 120000,
  "cases": [
    {"id": "empty", "args": ["[]"], "exit_code": 0, "stdout_json": "[]"},
    {"id": "invalid", "args": ["bad"], "exit_code": 1, "stderr_error": true}
  ]
}
```

A batch contains 1–32 explicit cases. Each runs the entry point once, after one
shared version probe. Case arguments retain the normal shell limit (20 literal
arguments, each at most 1000 UTF-16 code units); the tool inserts the separator.
`stdout_json` compares decoded JSON; `stdout`/`stderr` compare exact text including
newlines. Unspecified streams must be empty. `stderr_error:true` requires exactly
one nonempty `error` string in a JSON object. Every case needs an output assertion.
Optional `max_duration_ms` asserts process wall time, not algorithmic complexity.

All inputs validate before execution. The shared budget defaults to 120 seconds
and is bounded by the caller task deadline. Each invocation retains existing
permissions, workspace, destructive-command policy, runtime pin and timeout.
A normal assertion mismatch runs remaining explicitly requested cases; abort,
uncertain termination, source change, or incomplete/truncated execution stops the
batch. There are no automatic retries. Use owned fixtures: this is not a sandbox
and does not roll back side effects.

The aggregate receipt succeeds only if all assertions pass and declared source
hashes remain unchanged. Expected exit 1 can therefore be a successful test.
Case evidence is encrypted in the execution journal and recoverable with
`tool_result_read` using returned case `result_ref` values. The model sees compact
summaries by default. Direct library callers without a receipt sink receive full
`case_evidence`. These are explicitly caller-authored assertions, not independent
acceptance evidence. `done` adds `kujo_workflow`, `runtime_preflight_calls`, and
`verification_cases_executed`; model tool-call counts exclude internal case
subprocesses. No existing fields or operations are removed.

`ENGINEERING_REVIEW_MODE=always|selective` defaults to `always` and still requires
`ENGINEERING_REVIEW_ENABLED=1`. Selective mode sends missing/stale deterministic
evidence directly to bounded repair before spending model-review rounds. Once
checks are present, a focused read-only review receives original requirements,
latest write references, bounded change excerpts where an earlier read exists,
linked/recent checks and prior findings. It must inspect final source and semantic
coverage. Passing caller-authored tests do **not** skip that review or certify
quality. Existing checkpoint workflows retain their original mode.

`KUJO_ALLOCATION_GUIDANCE=1` additionally exposes `local_kujo guide` topic
`allocation` and, in compact mode, a short performance reference. This is off by
default. Performance advice is eligible only for the exact pinned binary/default
backend qualified in `lib/kujo-allocation-reference.js`; all other configurations
are explicitly unqualified for that speed claim. Guide receipts expose
`performance_qualified` and `performance_guidance`. It never changes permissions,
executes generated code automatically, or rewrites the candidate. Health and
stream receipts add `kujo_workflow.allocation_guidance`.

### Provider request bytes versus model context

For managed Watchdog routes, `context_budget` additionally reports
`max_request_bytes`, `before_request_bytes` and `after_request_bytes`.
These describe serialized provider request bodies, independently of
`context_window_tokens` and `output_reservation`. The JSON bridge is budgeted
against its documented OpenAI-compatible envelope; streaming measures the exact
body that will be dispatched, including schemas and escaped strings.
`GET /api/health` includes `max_request_bytes` in each Watchdog runtime summary.

If protected content cannot fit, `/api/chat` returns HTTP 400 with
`request_body_budget_exceeded`; `/api/chat/stream` emits that nonretryable error
before provider dispatch. Recoverable history is compacted using existing saved
receipt references. Upstream HTTP 413 retains the `provider_http_error` code and
status but explains the separate request-size limit. No failed request or tool
work is automatically replayed.

### Repeated-read progress guard

AI Chat's managed tool loop checks development requests exposing `local_file_write`,
`local_shell` or `local_kujo`. Six consecutive successful, complete reads of at
most two unchanged views trigger a recovery notice and deduplication of older
provider-facing result bodies. The newest full contents and every original
journal result remain available; call identities and assistant text are preserved.
File content/mtime changes, new ranges, errors, partial reads and other tools
interrupt or reset the matching streak. Read-only requests are not subject to
this development guard. Native external harnesses manage their own execution.

At twelve matching reads, SSE emits `error` with code `execution_no_progress`,
`retryable: false`; it does not emit a successful `done` or dispatch another model
request. Partial output, files, usage and completed receipts remain inspectable.
An explicit execution resume starts another bounded window after the saved stop
marker, without replaying the previous tool calls. This is a no-progress cost
bound, not proof that the task is impossible or a replacement for permissions.
