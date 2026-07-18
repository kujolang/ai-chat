# Changelog

## Unreleased

- Render browser screenshots as compact thumbnails and open them in a scrollable chat gallery.
- Show terminal tool-execution failures in assistant messages and avoid retrying explicitly non-retryable tool errors.
- Permit same-origin browser screenshot blob URLs under the content-security policy.
- Move Pane Profiles to the right of Add Pane in the chat header.
- Display browser-tool screenshots in the assistant response and expose them through an authenticated, opaque artifact endpoint.
- Add reusable pane profiles that preserve ordered provider/model selections, with create, apply, new-chat, and delete management while retaining the single-pane default for normal new chats.
- Add local Playwright Chromium execution for stable provider-neutral browser tools, with isolated scoped sessions, pinned public-network requests, bounded snapshots/artifacts/actions, read-only approval policy, health/Settings availability, compatibility routing, and deterministic fixtures.
- Replace browser whole-state saves with dependency-ordered incremental SQLite changes, bounded request batching, retry-safe idempotent writes, an always-visible save status, and an unload warning while data is unsaved.
- Stream SSE and NDJSON responses incrementally, preserve terminal provider errors, and strengthen bounded continuation recovery.
- Route Watchdog chats through a matching direct Ollama profile when available, with asynchronous Watchdog telemetry, to avoid buffered proxy cutoffs.
- Execute the provider-neutral `web_search` contract through a bounded tool registry with local SearXNG preference and Ollama Web Search fallback; retain explicit `tool_execution_unavailable` errors for unsupported schemas.
- Authenticate direct-stream Watchdog telemetry with its dedicated API token file and emit sanitized warnings when asynchronous telemetry intake is rejected or unreachable.

All notable changes to AI Chat should be documented in this file.

The format is inspired by Keep a Changelog and semantic versioning.

## [Unreleased]

### Changed

- Added a first-class Watchdog provider that routes AI Chat through the shared local telemetry proxy with server-managed credentials and per-chat correlation metadata.
- Moved the security hardening checklist into `docs/` with the other release and operations references.
- Documented explicit proxy-trust, stream-timeout, and rate-limit bucket controls in setup and release docs.
- Preserve provider message-shaped stream chunks, recover incomplete responses, and render Markdown thinking output.
- Refined sidebar action sizing and modal scrolling/layout behavior for settings and token usage.
- Increased the default completion budget, fixed upstream SSE line buffering, and added recovery for thinking-only continuation passes.
- Track provider-reported input, output, and cached-input token usage in the composer summary and analytics modal.
- Always broadcast prompts to every pane and move pane status/remove controls into the workspace header.

### Security

- Run API auth, host/origin checks, and rate limiting before JSON body parsing.
- Added JSON error envelopes for malformed and oversized authenticated request bodies.
- Added `Cache-Control: no-store` to API responses.
- Disabled `X-Forwarded-*` trust by default unless `TRUST_PROXY=1` is configured.
- Capped in-memory rate-limit bucket growth with `RATE_LIMIT_MAX_BUCKETS`.
- Suppressed raw provider stream error bodies unless `DEBUG_API_ERRORS=1`.

## [1.0.0] - 2026-06-10

### Changed

- Hardened smoke test flow to require auth and support configurable host/port/base URL targeting.
- Added security integration tests for host/origin enforcement and provider URL allowlist rejection.
- Replaced synchronous bridge execution in `POST /api/chat` with non-blocking process execution.
- Added CI workflow gates for `npm test` and `npm audit --omit=dev`.
- Added security operations runbook for reverse-proxy ACL, mTLS, and SIEM examples.
- Added explicit API contract/versioning and release checklist documentation.

### Security

- Remediated production dependency vulnerability in `qs` via lockfile update.
