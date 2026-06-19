# Enterprise Readiness Review - 2026-06-19

AI Chat is a strong local showcase for Kujo-backed multi-provider chat workflows. It is not yet an enterprise-certified product, but this review tightened deployability, security defaults, and documentation clarity while preserving the app's small, reviewable shape.

## Completed This Pass

- Moved the prior security hardening checklist from the repository root to `docs/SECURITY_HARDENING_CHECKLIST.md`.
- Confirmed there is no `src/` folder in this checkout; active source remains intentionally split across `server.js`, `lib/`, `public/`, `scripts/`, and `tests/`.
- Changed API middleware order so host/origin checks, token auth, and rate limits run before JSON body parsing.
- Added JSON envelopes for malformed and oversized authenticated JSON payloads.
- Added `Cache-Control: no-store` to API responses.
- Added `TRUST_PROXY`, defaulting to disabled, so forwarded headers are trusted only behind an explicit trusted proxy deployment.
- Added `RATE_LIMIT_MAX_BUCKETS` to cap in-memory rate-limit tracker growth.
- Suppressed raw upstream stream error bodies unless `DEBUG_API_ERRORS=1`.
- Updated README, setup, API contract, release checklist, security operations, changelog, and route tests for the new behavior.

## Current Readiness Assessment

- Local showcase quality: strong.
- Small-team internal deployment readiness: improving, with reverse proxy, token auth, host/origin controls, audit logging, backups, and release gates documented.
- Enterprise-grade readiness: not universal yet. The app still needs deeper operational controls, identity integration, observability, and data governance before it should be marketed as production-certified enterprise software.

## Recommended Next-Session Work

1. Add structured audit-log rotation guidance and an optional built-in rotation guard for local deployments.
2. Add a restore verification script that can restore a backup into a temporary SQLite database and validate schema/readability.
3. Add `/api/health` readiness detail for database writability, audit-log writability, and configured provider host allowlists.
4. Add admin-facing token rotation documentation and an operational runbook for expiring browser-stored tokens.
5. Add a request correlation section to `docs/API_CONTRACT.md` documenting `X-Request-Id` and audit-log linkage.
6. Add tests for JSON payload size limits and proxy-origin fallback behavior with `TRUST_PROXY=1`.
7. Add a lightweight accessibility pass for the auth modal, settings panel, stream status, and transcription controls.
8. Add provider profile import/export with secret-safe redaction to make setup portable without leaking API keys.
9. Add an optional read-only demo mode that disables state writes while keeping offline fixture chat usable for public demos.
10. Add screenshots or a short local demo walkthrough to README once the UI is visually verified.
11. Decide whether the product positioning should remain "local showcase app" or graduate to a supported deployment target with explicit SLA/security commitments.

## Files To Keep In Root

- `server.js`: runtime entrypoint.
- `bridge_chat.kujo`: canonical Kujo bridge example used directly by the app.
- `README.md`, `SETUP_AND_INSTALL.md`, `.env.example`, `CHANGELOG.md`, `LICENSE`, `package.json`: canonical project surfaces.

Everything else that is operational guidance or review material should live under `docs/` unless it becomes a required top-level convention.
