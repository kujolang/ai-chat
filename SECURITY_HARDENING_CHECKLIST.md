# Kujo AI Chat Security Hardening Checklist

This checklist tracks the security hardening pass applied to the current codebase.

## Access Control

- [x] Require API token authentication for all `/api/*` routes (`API_AUTH_TOKEN` + `X-API-Token` or bearer token).
- [x] Enforce constant-time token comparison to reduce timing side-channel leakage.
- [x] Reject requests when API auth is not configured.

## Browser and HTTP Hardening

- [x] Disable `X-Powered-By` header.
- [x] Set `Content-Security-Policy`.
- [x] Set `X-Frame-Options: DENY`.
- [x] Set `X-Content-Type-Options: nosniff`.
- [x] Set `Referrer-Policy: no-referrer`.
- [x] Set `Permissions-Policy` for microphone scope.
- [x] Set `Cross-Origin-Resource-Policy: same-origin`.
- [x] Set `Strict-Transport-Security` when HTTPS is detected.
- [x] Add per-request `X-Request-Id`.

## Origin and Host Enforcement

- [x] Enforce host allowlist (`ALLOWED_HOSTS`) on API routes.
- [x] Enforce origin checks (`ALLOWED_ORIGIN` or same-origin fallback).

## Secrets and Key Handling

- [x] Redact API keys from `GET /api/state` responses.
- [x] Return `api_key_present` status instead of plaintext key.
- [x] Preserve existing encrypted keys on state writes when no new key is provided.
- [x] Move bridge provider key material out of argv payload and into provider env vars.
- [x] Reduce startup log exposure of sensitive file paths.

## SSRF and Outbound Safety

- [x] Validate provider base URLs.
- [x] Enforce HTTPS-only provider endpoints.
- [x] Block localhost/private-link/local network hosts for provider URLs.
- [x] Enforce default provider host allowlists.
- [x] Require explicit allowlist for custom provider hosts (`ALLOWED_CUSTOM_PROVIDER_HOSTS`).
- [x] Add outbound request timeout controls (`REQUEST_TIMEOUT_MS`).

## Abuse and DoS Controls

- [x] Add per-IP rate limits with per-route scope (`api`, `chat`, `stream`, `transcribe`).
- [x] Add API JSON payload size limit (`MAX_JSON_BODY_BYTES`).
- [x] Enforce chat request message-count and content-size bounds.
- [x] Enforce upload file count and size bounds (`MAX_AUDIO_UPLOAD_BYTES`).

## Upload and Transcription Path Hardening

- [x] Restrict transcription upload MIME types to explicit audio allowlist.
- [x] Add upload error handling for oversize and invalid MIME.
- [x] Bound transcription parameter lengths (`model`, `language`, `prompt`).

## Data Lifecycle and Auditability

- [x] Add configurable data retention cleanup (`DATA_RETENTION_DAYS`).
- [x] Add append-only security audit logging (`AUDIT_LOG_PATH`).
- [x] Log high-risk security events (auth failures, host/origin rejections, rate limits, write failures).

## Runtime and Documentation

- [x] Add hardened environment variables to `.env.example`.
- [x] Update README and setup docs with token-auth and security env requirements.
- [x] Update runtime tests for authenticated API behavior.

## Follow-up Items

- [x] Add mTLS and reverse-proxy ACL examples for production reference architectures.
- [x] Add SIEM forwarding and alert threshold examples for audit log events.
- [x] Add integration tests for host/origin allowlist edge cases and provider URL rejection cases.
