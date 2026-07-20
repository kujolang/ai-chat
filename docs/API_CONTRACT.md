# API Contract and Versioning

This document defines the public HTTP contract for AI Chat and the compatibility rules for clients and agents.

## 1. Contract Scope

Public API base: same origin, path prefix `/api`.

Current endpoints:

- `GET /api/health`
- `GET /api/providers`
- `GET /api/state`
- `GET /api/chats/:chatId`
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

`GET /api/health` returns:

- `service`: `"ai-chat"`
- `ai_sdk_available`: boolean
- `auth_configured`: boolean
- `encryption_configured`: boolean
- `retention_days`: number
- `tool_runtime.tools`: executable provider-neutral tool names
- `tool_runtime.web_search_backend`: resolved `searxng` or `ollama` adapter
- `tool_runtime.web_search`: sanitized search backend capabilities, timeout, cache, and policy metadata
- `tool_runtime.browser`: sanitized `enabled`, `available`, `backend`, `headless`, `action_policy`, and `unavailable_reason` fields
- `tool_runtime.skills`: sanitized `enabled`, `available`, skill/root counts, root labels, and read/discovery limits
- `tool_runtime.schemas`: built-in schemas that are currently executable; browser schemas are absent when Chromium is unavailable

## 5. State Contract

`GET /api/state` returns:

- `state.chats` array
- `state.projectFolders` array
- `state.activeChatId` string|null
- `state.showArchived` boolean
- `state.searchQuery` string
- `state.broadcastToAllPanes` boolean compatibility field; the UI always persists this as `true` and broadcasts prompts to every pane.
- `state.settings` object containing `temperature`, `maxTokens`, `defaultProfileId`, `defaultModel`, persistent `agentInstructions`, provider `profiles`, reusable `paneProfiles`, and saved function-tool definitions in `tools`

Clients may request `GET /api/state?messages=none` to load chat metadata, pane metadata, and per-pane `messageCount` without message bodies. Use `GET /api/chats/:chatId` to hydrate one chat's panes and messages on demand.

`defaultProfileId` and `defaultModel` identify the provider/model selection used by regular new chats. Clients fall back to the first available configured model when the saved selection is missing or no longer exists.

`agentInstructions` is a bounded (24,000-character) app-wide instruction document. `agentInstructionProfiles` is an optional array of bounded `{id, models_csv, instructions, enabled}` entries; matching comma-separated model names append their instructions when `enabled` is not `false`. The browser prepends the combined text as the first system message for each pane request. These fields are intended to be compatible with concise `AGENTS.md` guidance and must not contain credentials or other secrets.

Each pane profile stores a name plus an ordered `panes` array of provider-profile/model selections. It contains no messages or provider credentials. The normal new-chat action remains a single-pane chat; clients may explicitly create a new chat or replace the current chat's panes from a saved pane profile. The browser asks for confirmation before replacing panes that contain messages.

Profile key handling guarantee:

- Raw API keys are never returned.
- `api_key_present` is exposed as a boolean indicator.
- `credential_managed` is `true` for Watchdog profiles whose proxy token comes from the server credential file.

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

`PUT /api/state` remains backward compatible for complete-snapshot clients and retains optimistic state-version checks. It is not recommended for growing conversation histories because its request size includes every message.

Bridge/offline path note:

- The bridge accepts an `offline_fixture` flag for safe local smoke validation.
- Live provider calls remain gated behind configured API keys and the external AI SDK files.
- Watchdog profiles automatically attach `X-Observe-*` correlation headers to chat requests. They use `WATCHDOG_PROXY_TOKEN_FILE`; `watchdog_ollama_tud` selects the configured `WATCHDOG_OLLAMA_TUD_UPSTREAM_PROFILE` through the trusted Watchdog upstream-profile header.

## 6. Streaming Contract (`POST /api/chat/stream`)

Requests may include `tools`, an array of up to 32 OpenAI-compatible function definitions. The streaming route dispatches executable built-in tools through AI Chat's provider-neutral tool registry, appends the result as a provider-compatible tool message, and continues the conversation within bounded round/call limits. The default budget is 24 rounds / 96 calls, configurable up to 64 rounds / 256 calls. The runtime resolves SearXNG or Ollama Web Search independently of the active model provider, and reads local skill manuals only through configured read-only skill roots. A successful final `done` payload includes `tool_calls_executed`. Other schemas do not grant capabilities: unsupported tool requests emit a terminal `tool_execution_unavailable` error containing `tool_names`. The JSON bridge route retains the explicit HTTP 422 behavior for requested tool execution. Clients must not retry terminal tool errors automatically.

Executable local skill contracts are:

- `skill_list`: `{ "query": "optional text", "source": "optional root label filter", "max_results": 50 }`
- `skill_read`: `{ "id": "skill id returned by skill_list" }`
- `skill_file_read`: `{ "id": "skill id returned by skill_list", "path": "relative/path.md", "max_chars": 48000 }`

Skill tool responses are bounded, read-only, and scoped to configured roots. They never return absolute root paths, reject path traversal and symlink escapes, and only read known text file extensions inside a selected skill folder. Skill contents are local workflow context; they do not override user instructions, app safety policy, credential handling, or tool limits.

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
- `done`: final payload with `provider`, `model`, `finish_reason`, `usage`, `output_text`, `thinking_text`, `tool_artifacts`, `transport` (`direct` or `proxy`), stable `trace_id`, and best-effort `watchdog_trace`. Each browser screenshot artifact has an opaque `artifact_id` and `media_type: "image/png"`.
- `error`: `{ "code": "...", "message": "..." }`

Client rules:

- Treat `done` as terminal success.
- Treat `error` as terminal failure unless your retry policy allows continuation.
- Do not depend on exact token chunk boundaries.
- Thinking deltas are optional and provider-dependent.
- `finish_reason` may be `stream_closed` when an upstream provider closes the connection without sending a terminal reason; clients should treat that as incomplete and may continue the request.
- The server consumes the complete upstream body before emitting its terminal `done` event and supports standard multiline SSE `data:` frames.
- SSE and newline-delimited JSON upstream bodies are forwarded incrementally. Provider `error` events are terminal and are never followed by a misleading `done` event.
- `web_search` calls run through the bounded tool runtime. Invalid arguments, missing adapter configuration or credentials, upstream search failure, and tool-budget exhaustion emit explicit terminal errors.
- Browser calls may span multiple provider rounds. Sessions remain scoped to the requesting pane when supplied, otherwise to the chat/request identity; the read-only policy blocks consequential interactions and may return a short-lived `approval_request` object alongside `tool_approval_required`.
- Browser screenshot artifacts in `done.tool_artifacts` are fetched from the authenticated artifact endpoint. Clients should render supported image artifacts alongside the assistant response and retain their opaque IDs in persisted message metadata.
- Unsupported provider tool calls remain terminal. The server emits `tool_execution_unavailable` instead of returning an empty successful answer or repeatedly continuing the request.
- Watchdog streams may use a matching direct Ollama profile and asynchronous Watchdog telemetry intake when direct streaming is enabled; otherwise they use the managed proxy fallback.
- `watchdog_ollama_tud` always uses its managed proxy, preventing a work benchmark from using a matching personal direct Ollama profile.
- Direct Watchdog telemetry uses `WATCHDOG_API_TOKEN_FILE` when the Watchdog `/api/*` surface requires token authentication. Telemetry remains best effort: a rejected or unreachable intake logs a sanitized server warning but does not change the successful chat stream contract.
- Each continuation pass has a unique telemetry `request_id` under one stable `trace_id`. Provider rounds, transport timing, first token, thinking, tool execution, errors, throughput, and committed state persistence are emitted as optional spans/events. The browser persists `usage.trace_id` only when a Watchdog trace was expected.
- `WATCHDOG_TELEMETRY_CONTENT_MODE=off` is the default and records metadata/counts without prompts, queries, tool results, or response text. `summary` permits bounded structural summaries. `full` explicitly opts into bounded content and remains subject to Watchdog redaction.
- The telemetry contract does not couple runtimes: the model provider, provider-neutral tool registry, each tool adapter, AI Chat persistence, and Watchdog can all operate independently.

## 6a. Browser Approval Contract

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
