# Changelog

All notable changes to Kujo AI Chat should be documented in this file.

The format is inspired by Keep a Changelog and semantic versioning.

## [Unreleased]

### Changed

- Hardened smoke test flow to require auth and support configurable host/port/base URL targeting.
- Added security integration tests for host/origin enforcement and provider URL allowlist rejection.
- Replaced synchronous bridge execution in `POST /api/chat` with non-blocking process execution.
- Added CI workflow gates for `npm test` and `npm audit --omit=dev`.
- Added security operations runbook for reverse-proxy ACL, mTLS, and SIEM examples.
- Added explicit API contract/versioning and release checklist documentation.

### Security

- Remediated production dependency vulnerability in `qs` via lockfile update.
