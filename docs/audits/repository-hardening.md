# AI Chat repository hardening audit

## Repository and result

- Repository: `kujolang/ai-chat`; branch: `main`.
- Audit date: September 29, 2026; platform: macOS; Node: 22.17.0.
- Starting SHA: `7237a967a64cdce93f715e3b7471862b7b9d1d18` (clean).
- Ending implementation SHA: `1af884bacecd3268d2398db7da209aff8fed8f43`. The subsequent documentation commit records this report and its evidence; it changes no runtime behavior.
- Purpose: a local, authenticated, multi-provider chat application with durable SQLite state, optional tools and automations, native Codex, and explicit ChatGPT plan connections.
- Result: fixed reproducible correctness and resource-boundary problems, updated two affected dependencies, and reduced measured filesystem/serialization work. Existing provider selection, saved profiles and credential formats remain intact.

This was a direct source-and-test audit, not a completed Codex Security plugin scan or a production certification. The plugin could not start under this session's filesystem profile; the user explicitly requested direct review instead. No sibling repository was modified, no production database was migrated or vacuumed, and no live provider inference was used.

## Architecture and review coverage

| Surface | Implementation read and behavior checked | Boundary or conclusion |
|---|---|---|
| Startup/configuration | `server.js`, `.env.example`, `.nvmrc`, `package.json`, startup/native-module tests | Explicit environment takes precedence over `.env`; loopback defaults; native dependency ABI; port probing; shutdown and fatal errors. |
| HTTP/account boundary | `lib/server-runtime.js`: middleware, Host/Origin checks, rate buckets, upload routes, provider URL validation | One local App Access token, constant-time comparison, no multi-user authorization claim. Authentication precedes API body parsing. Default Host policy is permissive but a cross-origin request still requires the token; configured allowlists remain recommended for broader listeners. |
| State and credentials | State validation/write/change routes, `execution-journal.js`, `continuity-store.js`, `public/state-sync.js` | SQLite transactions and version checks; API-key encryption; encrypted journal/continuity; receipt-based replay; full-state replacement compatibility. Full-state save is intentionally retained for existing clients. |
| Providers and tools | Provider catalog/configuration, bridge dispatch, `bridge_chat.kujo`, tool dispatch and input repair, context budget/discovery | API keys remain server-side. The Kujo bridge receives the provider credential through its child environment. Neutral tool authorization still uses the request's advertised names. Tool repair does not authorize new capabilities. |
| Streaming and concurrency | `stream-lifecycle.js`, `sse-writer.js`, `admission-controller.js`, server JSON/SSE/Codex paths | Bounded SSE writer, explicit cancellation, detached-stream replay, queue cleanup, execution ownership, uncertain-effect reconciliation. Native output accumulation needed an explicit byte ceiling. |
| ChatGPT | `auth/chatgpt-oauth.js`, connection store/service, Responses adapter, OAuth/route/UI tests | State, nonce, PKCE, issuer/audience/signature checks; encrypted separate token store; refresh serialization; disconnect cancellation; binding epochs; no API-key fallback. Fixed byte accounting, without changing authorization or billing. |
| Browser and page reader | `browser-runtime.js`, `browser-containment.js`, `page-fetch.js`, containment/page/browser tests | Checked and socket-pinned DNS, redirect revalidation, read-only HTTP mediation, bounded decompression, scoped approvals and sessions. Kept repeated DNS validation rather than weakening existing rebinding checks for speculative speed. |
| Local/skill/action/RAG tools | `local-runtime.js`, `skill-runtime.js`, `action-runtime.js`, `rag-runtime.js`, tests | Scoped canonical paths, explicit write/shell switches, read-before-overwrite receipts, bounded adapter bodies, trusted loopback manifests, host-owned RAG configuration. Local shell is trusted host execution, not an OS sandbox. |
| Frontend | `public/app.js` rendering/auth/cache/automation paths, state/replay/stream modules, UI tests | Markdown HTML disabled and interpolated labels escaped; bearer token cache remains local-browser trust. Incremental state batching was repeatedly serializing its growing prefix. |
| Automations | `automation-service.js`, loopback SSE consumer, schedule and route tests | Explicit tools, durable chat/run receipts, timezone/DST handling, Sunday normalization, shutdown persistence and deletion races. |
| Tooling, dependencies and release | Backup/vacuum, smoke and benchmark scripts, weekly audit, CI workflows, lockfile and artifact guard | Node tests and dependency audit already gate CI. Kept native dependencies, pinned Actions, bridge examples and public CLI names. No established lint/typecheck/build step exists for this plain-JavaScript app. |

Related contracts inspected: AI SDK imports and bridge JSON, Watchdog request/trace metadata, configured RAG `/query`, loopback Hermes/xAI bridges, native Codex CLI, and manifest-backed action adapters (which can bridge MCP). No generic unrestricted MCP executor was added. Existing HTTP/SSE contracts are authoritative in `docs/API_CONTRACT.md`.

## Baseline

`npm test` before edits: **429 tests, 428 passed, zero failures, one skip**, 59,155.155 ms. The skip is the Linux-only sandbox filesystem test on macOS. Browser containment tests for the current platform passed.

`npm audit --omit=dev --json`: **two affected packages**, one high and one moderate; 129 production dependency entries. Installed `multer` was 2.2.0 and `markdown-it` was 14.3.0. This was a pre-existing dependency-audit failure, not a test-suite failure.

Benchmarks use the exact starting Git revision, synthetic files/state, one warmup and 30 measured samples. Output equality is asserted, not inferred. Temporary detailed logs are in `/tmp/ai-chat-hardening-20260929/`; the durable benchmark and verification receipt are linked below.

## Findings

| ID | Priority | Area | Finding and evidence | Action | Status |
|---|---|---|---|---|---|
| H01 | P1 | Dependencies | npm identified affected Multer/Markdown-it versions; frontend enables `linkify`, upload parser is an authenticated network surface. | Upgrade to Multer 2.4.0 and Markdown-it 14.3.2; regenerate lockfile and clean-install. | Fixed; audit zero. |
| H02 | P1 | Scheduling | `parseInt(weekday) || 1` maps valid Sunday zero to Monday. Regression fails against starting source. | Preserve finite zero for create/update. | Fixed. |
| H03 | P1 | Lifecycle/state | Automation work was not drained before SQLite close; deleting an in-flight chat could make both completion and failure persistence throw. | Track controllers/promises, abort loopback transport and drain; terminalize surviving history without recreating deleted chats. | Fixed; service and runtime tests. |
| H04 | P1 | Data integrity | Full-state replacement deletes then reinserts chats; `ON DELETE SET NULL` permanently erased surviving automation-history links. Test reproduced null before fix. | Snapshot and restore links only when the original chat ID survives, within the existing transaction. | Fixed. |
| H05 | P1 | Native resources | Codex accumulated stdout, stderr and parsed events without a total output ceiling. | Combined configurable byte budget; terminate and fail on overflow. | Fixed; both channels tested with multibyte output. |
| H06 | P1 | Responses transport | Character counts understated UTF-8 limits; a large chunk of small valid SSE records was rejected before parsing. Three new tests fail against starting adapter. | Count UTF-8 bytes per record/output and apply partial-buffer limit after parsing complete records. | Fixed; all three pass. |
| H07 | P1 | Upload/upstream resources | Multipart field count unbounded; transcription buffered an unlimited response; request timer stopped at headers and redirects were followed. | Bound fields/parts/body, retain deadline through response consumption, reject redirects. | Fixed; valid upload tests retained. |
| H08 | P1 | Startup/failure | Oversized/aborted health responses could leave the probe unsettled; inactivity timeout allowed trickling indefinitely; receive deadlines were disabled; uncaught errors only logged. | Settle all probe failures, enforce absolute deadline, retain Node receive limits and fatal exit defaults; format IPv6 URLs correctly. | Fixed; hostile-probe and fatal-exit tests. |
| H09 | P2 | Filesystem efficiency | Listing 10 of 2,000 files performed 2,000 stat calls. | Sort Dirents before selecting and stat only returned entries. | Fixed; same output, 10 stats. |
| H10 | P2 | Serialization efficiency | State batching serialized every growing prefix to measure each candidate. | Count each serialized array item's UTF-8 bytes once, preserving envelope/comma overhead. | Fixed; identical batches and bytes. |

These priorities describe engineering impact in a local app; they are not newly assigned CVSS scores. No P0 issue was demonstrated.

## Changes and regression proof

- **Dependencies:** `package.json` and `package-lock.json`; no replacement parser was written. Existing Markdown rendering/UI and transcription tests exercise the updated packages. The Multer upgrade removes `concat-stream`, `buffer-from`, and `typedarray` transitively.
- **Automation lifecycle and history:** `lib/automation-service.js`, `lib/server-runtime.js`; new tests in `tests/automation-service.test.js` and `tests/server-routes.test.js` verify Sunday create/update, cancellation plus persistence, new-admission refusal, deleted-chat behavior, pre-dispatch shutdown, retained history links and actual deletion. Schedule storage is unchanged. Previously saved Monday values cannot be distinguished from intentional Mondays and are not silently migrated.
- **Transport and native bounds:** `lib/server-runtime.js`, `lib/providers/chatgpt-responses.js`; existing successful/tool/partial-output paths remain covered, alongside excessive fields, stalled/oversized transcription bodies, native stdout/stderr overflow, Unicode limits and coalesced SSE events. A limit failure is explicit, not a silently truncated success.
- **Startup:** `server.js`, `tests/startup-port.test.js`; occupied-port tests cover oversized, aborted and trickled bodies. Injected post-listen exceptions/rejections must terminate with exit 1. Native fatal-error semantics replace log-and-continue; journal restart recovery remains the supported interruption path.
- **Efficiency:** `lib/local-runtime.js`, `public/state-sync.js`; tests assert sorted returned metadata and exact stat count, plus equality against the previous batching algorithm across Unicode, count limits and oversized individual records. `scripts/repository-hardening-benchmark.js` makes the comparison repeatable.
- **Documentation:** `.env.example`, `SETUP_AND_INSTALL.md`, `docs/API_CONTRACT.md`, this report and bounded evidence. No unrelated formatting sweep or module split was performed.

## Performance and efficiency

Measured on this host using `node scripts/repository-hardening-benchmark.js --baseline 7237a96`:

| Dimension/workload | Before | After | Proof/limit |
|---|---:|---:|---|
| File stats, 2,000 files, return 10 | 2,000 | 10 | Deterministic call count, identical listing. |
| Listing median / p95 | 38.174 / 44.579 ms | 6.445 / 8.530 ms | Synthetic local workload; sorting still inspects all names. |
| Batch 250 Unicode messages, median / p95 | 302.475 / 315.176 ms | 6.539 / 7.911 ms | Same batch sizes `[86,86,78]`. |
| Batch serialized bytes | 521,249 / 521,331 / 472,849 | Same | Deep equality and UTF-8 byte equality. |
| Production dependency entries | 129 | 126 | npm audit metadata; no new dependency. |
| Known affected dependency packages | 2 | 0 | Registry advisories at verification time. |
| Native output retention | Unbounded | 32 MiB wire-output budget by default | This is a configured bound, not measured total process RSS. |
| Transcription upstream buffering | Unbounded | 2 MiB | Tested overflow and post-header stall. |

The existing context benchmark was run before and after. Schema counts/bytes, conditional instructions, long-context character counts and compacted tool-result character counts are unchanged. Current initial schemas: 12 / 5,437 JSON bytes; long-context example: 164,377 to 11,017 characters; tool-result example: 120,566 to 21,866 characters. These reductions **already existed before this pass**. Its historical `f38043c` comparison must not be credited to this audit. No vendor-token or billing savings are claimed.

No meaningful binary/build measurement applies to this unbundled application. No CPU-profile, peak-RSS, live-model latency, provider cost or sustained-load improvement is claimed. Timing varies with hardware and background work; no wall-time threshold was added to CI.

## Security and failure review

The reviewed trust boundaries include the HTTP bearer token and origin, untrusted Markdown, network provider/tool output, OAuth callbacks and rotating credentials, local paths, subprocesses, tool schemas, external tool effects, and saved replay state. Fixed resource exhaustion paths and dependency advisories are listed above. Existing security, OAuth, network containment, tool authorization and persistence tests remain enabled.

Preserved limitations:

- This remains a local single-operator application. Local browser token compromise grants that operator's API access; OAuth tokens remain encrypted server-side. No multi-user isolation claim is made.
- `local_shell` and configured action adapters deliberately execute trusted capabilities. Executable allowlisting is not filesystem/network isolation. Local file validation cannot defend against every hostile ancestor-directory race; macOS browser containment denies networking but does not claim filesystem isolation. These are already documented deployment boundaries, not new guarantees.
- Arbitrary custom-provider hosts are operator-allowlisted HTTPS destinations, unlike browser tools' stronger per-connection DNS policy. Do not treat a custom-provider allowlist as authorization to use attacker-controlled DNS infrastructure.
- Existing audit-log retention, optional context metadata and large saved-history behavior were reviewed; no cache or retention redesign was introduced without representative operational measurements.
- Native output limits cannot prove that a subprocess performed no external action before termination. Preserve and reconcile uncertain receipts before resuming.

## Compatibility

| Contract | Result |
|---|---|
| HTTP routes, SSE event names, bridge invocation, tool schemas | Unchanged. |
| Saved profiles/models, Ollama/Grok/Watchdog routing, ChatGPT binding/billing, native Codex auth | Unchanged. |
| Database/file formats and encryption | Unchanged; no schema migration. |
| CLI command names | Unchanged; additive offline benchmark script. Startup now exits on unexpected fatal errors. |
| Environment | Additive `CODEX_MAX_OUTPUT_BYTES`, default 33,554,432, clamped 1,024–268,435,456. |
| Errors/limits | Multipart violations now use HTTP 400 `invalid_multipart`; existing file-size error retained. Native overflow explicitly fails. Transcription redirects and oversized bodies are rejected. |
| Schedules | Sunday zero fixed; existing stored values preserved. |
| External consumers | Ordinary payloads unchanged. Clients sending excessive multipart fields, providers redirecting transcription, or native runs emitting over the new configured bound must adjust deliberately. |

## Regression ratchets and developer experience

All 18 added cases are discovered by the existing `npm test` CI command. Existing CI also runs `npm audit --omit=dev`, installs Chromium, and requires Linux containment. Deterministic directory stat counts and byte-equivalent state batches guard the performance changes without flaky timing assertions. The benchmark accepts an explicit Git baseline and preserves concise, comparable JSON. Detailed logs stay in temporary evidence rather than model-visible output or production state.

Large `server-runtime.js` and `public/app.js` modules remain; splitting them merely for line count would add review churn. Known compatibility layers, provider shims, fixtures and scripts were preserved because their removal was not justified by consumer evidence. No safety prompts, schemas, policy text, errors or tool receipts were deleted for token savings.

## Remaining work and cross-repository follow-ups

- **P0/P1:** no unresolved defect demonstrated by this pass remains in its implemented changes.
- **P2 / needs more evidence:** the pre-existing eight-hour live mixed-provider soak remains incomplete. This offline pass does not certify all-day operation, live ChatGPT eligibility, or provider-account behavior. README already records that limitation.
- **Needs more evidence:** Linux containment was not executed on this macOS host; its existing CI gate remains. Long-term audit-log growth, giant local-file windows and very large saved histories warrant representative profiling before any retention or indexing redesign.
- **Not worth changing here:** broad source reformatting, speculative caches, provider-neutral interface redesign, or deleting ambiguous scripts/compatibility paths.
- **Cross-repository requirements:** none. Kujo, AI SDK, Watchdog, RAG, Hermes and Codex integrations require no coordinated change for these fixes. Actual installed Kujo/AI SDK were used only for offline smoke. No sibling write or hidden migration is required.

## Verification receipt

All commands used Node 22.17.0 (`PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH`). Full local logs: `/tmp/ai-chat-hardening-20260929/`. The durable [JSON receipt](evidence/2026-09-29/verification.json) and [benchmark results](evidence/2026-09-29/benchmark.json) contain no credentials or chat data.

| Command | Result |
|---|---|
| `git status --short; git branch --show-current; git rev-parse HEAD` | Clean starting `main`, SHA above. |
| `npm test` before edits | 428 passed, 1 platform skip, 0 failures. |
| `npm audit --omit=dev --json` before edits | Failed: 2 affected dependency packages. |
| `node scripts/hardening-benchmark.js` before/after | Passed; context payload sizes unchanged. |
| `npm install --ignore-scripts markdown-it@^14.3.1 multer@^2.4.0` | Resolved patched Markdown-it 14.3.2/Multer 2.4.0; 3 transitive packages removed. |
| `npm ci` | Passed; clean lockfile install. Optional `fsevents` install-script approval warning, not a failure; no approval policy changed. |
| `node --test tests/automation-service.test.js tests/local-runtime.test.js` | 31 passed. |
| `node --test tests/chatgpt-responses.test.js` | 12 passed; same three new boundary cases fail against starting adapter. |
| `node --test tests/state-sync.test.js` | Passed, including reference-algorithm equivalence. |
| `node --test tests/server-routes.test.js` during implementation | 146 passed at that point; later native/history cases included in final suite. |
| `node --test --test-name-pattern='full state replacement preserves automation' tests/server-routes.test.js` | Failed before link fix; passed after. |
| `node --test tests/startup-port.test.js` | Passed, including fatal-exit cases. |
| `node scripts/repository-hardening-benchmark.js --baseline 7237a96` | Passed before/after equality assertions; timings above. |
| `node docs/audits/evidence/2026-09-29/smoke-harness.cjs` | Passed offline smoke with and without browser requirement, plus backup and vacuum on disposable DB. This harness invokes `scripts/smoke-test.js`, `scripts/backup-db.js`, and `scripts/vacuum-db.js` with isolated paths. |
| `node scripts/tool-repair-fixture-benchmark.js` | Passed offline adversarial fixtures. |
| `node scripts/weekly-tool-audit.js --audit-log /tmp/ai-chat-hardening-20260929/tool-audit-fixture.log --output-dir /tmp/ai-chat-hardening-20260929/tool-audit` | Passed a synthetic completed-tool fixture; not a claim about production-log reliability. |
| `node --check` over tracked JavaScript and new benchmark | Passed. |
| `npm audit --omit=dev --json` after clean install | Passed, zero known vulnerabilities, 126 production dependency entries. |
| Final `npm test` | 447 tests: 446 passed, 1 Linux-only skip, 0 failures; 60,000.731 ms. |
| `git diff --check`; `bash .github/scripts/check-kujo-tool-artifacts.sh` | Passed. |

No build/lint/typecheck scripts exist to run. No live benchmark, remote inference, eight-hour soak, or sibling-repository test suite was run.

Dependency evidence: [Multer releases](https://github.com/expressjs/multer/releases), [Markdown-it releases](https://github.com/markdown-it/markdown-it/releases), [Markdown-it quadratic-path advisory](https://github.com/advisories/GHSA-253c-mchw-3w2r), [Multer multipart field advisory](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), and [Multer 2.4.0 fix advisory](https://github.com/advisories/GHSA-3pph-fpjx-jg34). Package versions and remaining advisory counts were verified against npm on the audit date.
