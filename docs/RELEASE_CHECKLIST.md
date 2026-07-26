# Release Checklist

Use this checklist for each release candidate and production release. Local
release review can complete the repository gates below, but deployed
production or enterprise readiness still requires separate target-environment
proof for credentials, reverse proxy/TLS, backup/restore, audit logging,
identity/access controls, and operational monitoring.

## 1. Version and Notes

- [ ] Bump version in `package.json`.
- [ ] Add release entry in `CHANGELOG.md`.
- [ ] Identify contract-impacting changes and confirm docs were updated.

## 2. Quality Gates

- [ ] Run `npm test` and confirm green.
- [ ] Run `npm audit --omit=dev` and confirm no unresolved vulnerabilities.
- [ ] Run smoke check against a live server with auth token.

## 3. Security Validation

- [ ] Confirm `API_AUTH_TOKEN` is configured and not placeholder.
- [ ] Confirm `ENCRYPTION_SECRET` is configured and not placeholder.
- [ ] Confirm `AI_CHAT_HOST` is explicitly set to the intended bind host.
- [ ] Confirm `ALLOWED_HOSTS` and `ALLOWED_ORIGIN` are explicitly set for environment.
- [ ] Confirm `ALLOWED_CUSTOM_PROVIDER_HOSTS` is explicit if custom providers are enabled.
- [ ] Confirm `TRUST_PROXY` matches the deployment topology and proxy header handling.
- [ ] Confirm rate-limit settings include an appropriate `RATE_LIMIT_MAX_BUCKETS` cap.
- [ ] Confirm audit logging path (`AUDIT_LOG_PATH`) is writable and monitored.

## 4. Deployment Readiness

- [ ] Reverse proxy TLS/mTLS and ACL configuration reviewed.
- [ ] Runtime env vars reviewed for target environment.
- [ ] Backup and restore path verified for SQLite data.
- [ ] Rollback plan documented.

## 5. Post-Release Verification

- [ ] Verify `/api/health` in deployed environment.
- [ ] Verify a standard chat request and stream request.
- [ ] Verify audit events are arriving in SIEM.
- [ ] Verify on-call/alerts are active for auth/rate-limit failures.
