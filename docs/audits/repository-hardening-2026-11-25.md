# AI Chat hardening, 2026-11-25

Baseline `b59b6e6`. Reviewed server startup and shutdown, state and attachment storage, request parsing and auth boundaries, chat stream lifecycle, provider fixture routing, browser containment, and the Node dependency lock. Used temporary SQLite data, isolated loopback listeners, and fixture credentials.

| Finding | Change and verification |
| --- | --- |
| Terminal SSE chunks could fill the writer's byte budget even when Node's queue was below its high-water mark. A failed overflow callback could also leave the response attached. | `4624f99` waits for committed socket writes and detaches the response on overflow even if checkpointing throws. Both new regressions fail on baseline and pass with the fix. |
| One failed shutdown checkpoint could prevent cancellation of other active streams. | `6d397d8` isolates checkpoint failures, aborts and drains every active stream, and records only the count of failed checkpoints. The new regression fails on baseline and passes with the fix. |
| Attachment metadata queries selected large encrypted blobs unnecessarily. | `6af8e65` projects metadata for create/list and binary reference paths and retrieves the ciphertext only where the caller needs it. The store test verifies the projections and preserves binary download and text resolution behavior. |
| The HTTP parser dependency graph had two high and two moderate registry advisories. | `8d04e21` resolves Express 4.22.3, body-parser 1.20.9, qs 6.16.2, and Multer 2.5.0. The final complete lock audit reports zero advisories. [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828), [Multer advisory](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [qs advisory](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) |

Node 22.23.4 smoke passed against a clean SQLite database using AI SDK `d69c472` and local Kujo 1.10.0. Health, provider catalog, initial state, and offline fixture chat returned HTTP 200. Browser-dependent local results are limited by the macOS host and its installed Chrome build. The Linux CI matrix installs pinned Playwright Chromium and requires the browser isolation checks.
