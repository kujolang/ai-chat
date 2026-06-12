# Agent and Contributor Notes

AI Chat is a small local showcase app. Keep changes easy to scan, copy, and review.

## Canonical Surfaces

Use these files as the source of truth for examples and onboarding:

- `README.md`: shortest runnable quick start and feature overview.
- `SETUP_AND_INSTALL.md`: expanded local setup reference.
- `.env.example`: environment template only; keep placeholders safe.
- `bridge_chat.kujo`: canonical Kujo bridge example used by the app.
- `docs/API_CONTRACT.md`: HTTP/SSE contract for clients and agents.

Tests under `tests/` are contract coverage, not teaching examples. Runtime data under `data/`, dependencies under `node_modules/`, and lockfiles are generated or bulk surfaces; exclude them from broad readability sweeps unless a task explicitly targets them.

## Search Hygiene

Prefer narrow searches that avoid generated and runtime-heavy paths:

```bash
rg "pattern" --glob '!node_modules/**' --glob '!data/**' --glob '!package-lock.json'
```

For file discovery, start with:

```bash
rg --files --glob '!node_modules/**' --glob '!data/**'
```

## Example Style

Prioritize copyable examples over tests: examples should model the most token-efficient idioms we want agents to imitate.

- Keep quick starts minimal and runnable.
- Include expected output when it helps users verify a command.
- Prefer small local helpers for repeated CLI output, labels, and status lines.
- Do not hide the app behavior or Kujo bridge behavior behind broad abstractions.
- Clearly label any stale, legacy, generated, or expected-fail example that remains in the repo.
