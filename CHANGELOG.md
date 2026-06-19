# Changelog

All notable changes to AI Chat should be documented in this file.

The format is inspired by Keep a Changelog and semantic versioning.

## [Unreleased]

### Changed

- Moved the security hardening checklist into `docs/` with the other release and operations references.
- Documented explicit proxy-trust, stream-timeout, and rate-limit bucket controls in setup and release docs.

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
