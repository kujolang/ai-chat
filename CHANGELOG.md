# Changelog

## Unreleased

- Add a managed loopback Hermes / Nous Portal profile seeded with the current zero-cost model catalog.
- Add a separate managed Hermes / xAI Grok OAuth profile for X subscription-backed model access.
- Add explicit per-automation runtime tool selection and reject provider-generated textual tool-call envelopes as terminal protocol errors instead of saving them as successful answers.
- Prevent tool-free benchmark runs from inheriting saved interactive runtime
  tool presets, keeping `--tool-preset none` deterministic and bounded.

## [1.1.0] - 2026-08-22

- Add a launch-readiness Spec and deterministic Eval suite for the local AI Chat release review.
- Clarify that local release review does not by itself prove deployed production or enterprise readiness.
- Replace the placeholder Automations menu with persistent server-side scheduled chats, timezone-aware daily/weekday/weekly schedules, manual runs, pause/resume controls, and durable run history.
- Use Departure Mono for text buttons, simplify modal close controls, reveal the project add action on title hover, move Tool presets into a pane-style dropdown, and keep live tool narration inside the themed Working block.
- Keep long-running saved chats usable by sending a bounded recent context window instead of rejecting the entire accumulated transcript.
- Replace inline pane statuses with a compact pane menu, including per-pane details and hover delete actions.
- Add explicit copied feedback for chat and Watchdog IDs, delay chevron tooltips, and align the Watchdog icon color with other title-bar actions.
- Bundle Departure Mono and use it for chat titles without a font CDN dependency.
- Keep opaque chat links recoverable across reloads, remove the native unsaved-page refresh prompt, and persist newly created chat routes immediately.
- Open the root URL on a welcome screen, give chats separate long opaque route IDs for bookmarkable links, and keep single-pane status/removal controls hidden until a multi-pane comparison is active.
- Add manifest-based Action Adapter presets for trusted loopback document, MCP, plugin, and workflow services with bounded JSON calls and health metadata.
- Add opt-in Local tool presets for configured workspace file inspection, gated text writes, and allowlisted shell commands with path containment, sanitized environments, bounded output, health metadata, docs, and Settings presets.
- Add read-only local Skill tool presets (`skill_list`, `skill_read`, `skill_file_read`) with configurable roots, bounded discovery/read limits, health metadata, and Settings presets.
- Persist default-model changes immediately, keep disabled multi-pane model controls on-theme, make provider drops reliable across card gaps, and add reorderable/collapsible Tool cards.
- Make provider cards collapsible and reorderable, replace comma-separated model inputs with draggable model-row repeaters, and persist provider ordering.
- Add a persistent default model/provider for regular new chats and replace the composer model select with a searchable, scrollable picker for large catalogs.
- Harden `web_search` with canonical citation metadata, bounded URL validation/deduplication, explicit backend capability metadata, short timeouts/retries/coalescing/cache, and privacy-safe telemetry defaults.
- Make decomposed browser tools primary, add provenance-rich snapshots, scoped browser action approvals, optional public-domain allowlists, hard blocks for sensitive actions, and stronger prompt-injection labeling.
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
