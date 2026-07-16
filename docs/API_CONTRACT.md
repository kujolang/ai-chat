# API Contract and Versioning

This document defines the public HTTP contract for AI Chat and the compatibility rules for clients and agents.

## 1. Contract Scope

Public API base: same origin, path prefix `/api`.

Current endpoints:

- `GET /api/health`
- `GET /api/providers`
- `GET /api/state`
- `PUT /api/state`
- `POST /api/chat`
- `POST /api/chat/stream`
- `POST /api/transcribe`

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

## 5. State Contract

`GET /api/state` returns:

- `state.chats` array
- `state.projectFolders` array
- `state.activeChatId` string|null
- `state.showArchived` boolean
- `state.searchQuery` string
- `state.broadcastToAllPanes` boolean compatibility field; the UI always persists this as `true` and broadcasts prompts to every pane.
- `state.settings` object containing `temperature`, `maxTokens`, `profiles`, and saved function-tool definitions in `tools`

Profile key handling guarantee:

- Raw API keys are never returned.
- `api_key_present` is exposed as a boolean indicator.
- `credential_managed` is `true` for Watchdog profiles whose proxy token comes from the server credential file.

Bridge/offline path note:

- The bridge accepts an `offline_fixture` flag for safe local smoke validation.
- Live provider calls remain gated behind configured API keys and the external AI SDK files.
- Watchdog profiles use `WATCHDOG_PROXY_TOKEN_FILE` and automatically attach `X-Observe-*` correlation headers to chat requests.

## 6. Streaming Contract (`POST /api/chat/stream`)

Requests may include `tools`, an array of up to 32 OpenAI-compatible function definitions. Enabled tool schemas are forwarded to the selected provider, but schemas do not grant capabilities. AI Chat does not currently execute tool calls. If the provider requests one, the JSON route returns HTTP 422 or the streaming route emits a terminal `error` event with code `tool_execution_unavailable`; the response includes the requested `tool_names` when available. Clients must not retry that error automatically.

The endpoint returns `text/event-stream` with the following events:

- `token`: `{ "delta": "..." }`
- `thinking`: `{ "delta": "..." }` (provider-dependent)
- `done`: final payload with `provider`, `model`, `finish_reason`, `usage`, `output_text`, `thinking_text`, and `transport` (`direct` or `proxy`)
- `error`: `{ "code": "...", "message": "..." }`

Client rules:

- Treat `done` as terminal success.
- Treat `error` as terminal failure unless your retry policy allows continuation.
- Do not depend on exact token chunk boundaries.
- Thinking deltas are optional and provider-dependent.
- `finish_reason` may be `stream_closed` when an upstream provider closes the connection without sending a terminal reason; clients should treat that as incomplete and may continue the request.
- The server consumes the complete upstream body before emitting its terminal `done` event and supports standard multiline SSE `data:` frames.
- SSE and newline-delimited JSON upstream bodies are forwarded incrementally. Provider `error` events are terminal and are never followed by a misleading `done` event.
- Provider tool calls are terminal while no executor is connected. The server emits `tool_execution_unavailable` instead of returning an empty successful answer or repeatedly continuing the request.
- Watchdog streams may use a matching direct Ollama profile and asynchronous Watchdog telemetry intake when direct streaming is enabled; otherwise they use the managed proxy fallback.

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
