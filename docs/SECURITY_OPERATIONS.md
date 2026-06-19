# Security Operations Reference

This guide provides deployment-level examples for mTLS, reverse-proxy ACLs, and SIEM forwarding for AI Chat.

## 1. Reference Architecture

Recommended deployment boundary:

1. Internet or internal clients connect over TLS to a reverse proxy.
2. Reverse proxy enforces client auth (mTLS or identity gateway), source ACLs, and request size/time limits.
3. AI Chat runs on a private network interface and accepts only proxy traffic.
4. Audit log events are forwarded to a centralized SIEM pipeline.

## 2. Reverse Proxy ACL Example (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name ai-chat.example.com;

    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;

    # Optional mTLS (see next section)
    # ssl_client_certificate /etc/ssl/certs/org-client-ca.pem;
    # ssl_verify_client on;

    # IP/network ACL example
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
        client_max_body_size 12m;
    }
}
```

## 3. mTLS Example (Nginx)

Enable mTLS where machine-to-machine trust is required.

```nginx
server {
    listen 443 ssl;
    server_name ai-chat.example.com;

    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;

    ssl_client_certificate /etc/ssl/certs/org-client-ca.pem;
    ssl_verify_client on;
    ssl_verify_depth 2;

    location / {
        proxy_pass http://127.0.0.1:4173;
    }
}
```

Operational notes:

- Rotate client certificates on a fixed schedule.
- Revoke compromised certificates immediately.
- Use short-lived certs where possible.
- Ensure the proxy overwrites inbound `X-Forwarded-*` headers from clients before forwarding to AI Chat.

## 4. App-Level Host and Origin Controls

Set app controls to match deployment DNS/proxy expectations:

```bash
AI_CHAT_HOST=127.0.0.1
ALLOWED_HOSTS=ai-chat.example.com,127.0.0.1
ALLOWED_ORIGIN=https://ai-chat.example.com
ALLOWED_CUSTOM_PROVIDER_HOSTS=api.openai.com,openrouter.ai,api.deepseek.com
TRUST_PROXY=1
```

If traffic is fully internal, still set explicit allowlists rather than leaving defaults broad.

Leave `TRUST_PROXY=0` when serving AI Chat directly. Enable it only behind a trusted reverse proxy so HSTS detection, origin fallback checks, audit IPs, and rate-limit keys can safely use `X-Forwarded-*` headers.

## 5. SIEM Forwarding Example

AI Chat writes append-only JSON-line security events to `AUDIT_LOG_PATH`.

Example using Fluent Bit tail input:

```ini
[INPUT]
    Name tail
    Path /srv/ai-chat/data/audit.log
    Parser json
    Tag ai_chat.audit

[FILTER]
    Name record_modifier
    Match ai_chat.audit
    Record service ai-chat
    Record environment production

[OUTPUT]
    Name http
    Match ai_chat.audit
    Host siem.internal.example
    Port 443
    URI /ingest/audit
    tls on
```

## 6. Recommended Alert Thresholds

Use these as a baseline and tune per environment:

- auth failures (`auth_failed`): alert on >=20 events in 5 minutes per source IP.
- forbidden host/origin (`host_rejected`, `origin_rejected`): alert on >=10 events in 5 minutes.
- rate limiting (`rate_limited`): alert on >=30 events in 5 minutes per source IP.
- write failures (`state_write_failed`): alert on any sustained non-zero rate over 5 minutes.
- stream/transcribe failures (`chat_stream_failed`, `transcribe_failed`): warn on >=10 events in 10 minutes.

## 7. Audit Retention and Rotation

- Rotate `audit.log` daily.
- Retain raw audit logs at least 90 days hot and 1 year cold (policy dependent).
- Preserve immutable copies in centralized storage for incident response.

## 8. Deployment Checklist

- Reverse proxy terminates TLS.
- Optional mTLS configured for trusted clients.
- Proxy ACLs restrict source networks.
- Proxy overwrites untrusted inbound `X-Forwarded-*` headers.
- `API_AUTH_TOKEN` is long random and rotated.
- `ALLOWED_HOSTS` and `ALLOWED_ORIGIN` are explicit.
- `TRUST_PROXY` matches the actual deployment topology.
- Audit forwarding to SIEM is active and monitored.
- Alert thresholds are configured and tested.
