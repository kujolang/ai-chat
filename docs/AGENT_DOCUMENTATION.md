# AI Chat documentation index

Use this index for questions about AI Chat. Read the relevant manual before answering or changing the app. Unrelated tasks do not require reading these manuals.

Paths below are relative to the AI Chat repository. Discover the workspace through the advertised local tools; do not assume the current project is AI Chat. If read tools are listed as deferred, load them through `tool_discover`. Follow local read continuation coordinates when output is truncated.

| Task | Start here | Implementation reference when needed |
| --- | --- | --- |
| Understand the app or provider choices | `README.md` | `lib/server-runtime.js` |
| Install, configure providers, or schedule automations | `SETUP_AND_INSTALL.md`, `.env.example` | `server.js`, `lib/server-runtime.js` |
| Understand tools, skills, permissions, or browser access | `docs/LOCAL_AGENT_CAPABILITIES.md` | `lib/tool-runtime.js` |
| Integrate an API client or diagnose streaming | `docs/API_CONTRACT.md` | `lib/server-runtime.js`, `public/app.js` |
| Set up or troubleshoot Kujo execution | `docs/KUJO_EXECUTION_SETUP.md` | `bridge_chat.kujo` |
| Diagnose invalid tool arguments | `docs/TOOL_CALL_REPAIR.md` | `lib/tool-runtime.js` |
| Configure access controls, audit retention, or deployment security | `docs/SECURITY_OPERATIONS.md`, `docs/SECURITY_HARDENING_CHECKLIST.md` | `.env.example`, `lib/server-runtime.js` |
| Prepare or verify a release | `docs/RELEASE_CHECKLIST.md` | `package.json`, `.github/workflows/ci.yml` |
| Understand recovery, saved notes, or context limits | `docs/API_CONTRACT.md`, `docs/RELIABILITY_ROADMAP_IMPLEMENTATION.md` | `lib/execution-journal.js`, `lib/continuity-store.js`, `lib/context-budget.js` |
| Evaluate artifact uploads or stored-agent designs | `docs/ARTIFACT_AND_AGENT_DESIGN.md` | `lib/server-runtime.js`, `public/app.js`; verify proposals against current code |
| Run or interpret tool repair benchmarks | `docs/TOOL_CALL_REPAIR.md`, `docs/TOOL_CALL_REPAIR_BENCHMARK.md` | `scripts/tool-repair-fixture-benchmark.js`, `scripts/run-benchmark-suite.js` |
| Change agent instructions | `SYSTEM_PROMPT.md`, `SETUP_AND_INSTALL.md` | `lib/server-runtime.js` |
| Change repository code or examples | `AGENTS.md`, relevant manual above | `bridge_chat.kujo`, relevant source and tests |

Read only the task-relevant manuals and their required references. Read applicable contributor instructions completely. Tests provide contract evidence; they are not the canonical teaching examples.

Documentation describes supported behavior. Advertised tools, configured permissions, and observed results determine what this request can actually do. A skill cannot grant access to repository files outside its skill folder. See [documentation access setup](../SETUP_AND_INSTALL.md#ai-chat-documentation-access) when manuals are unavailable.

Use `.env.example` for configuration names and placeholders. Setup questions do not require reading real secrets. Cite the manual path or section supporting an app-specific answer. If implementation or observed behavior differs, report that discrepancy explicitly. Reports and roadmaps describe evidence at a point in time or planned work; verify them before presenting a feature as shipped.

The server reads `SYSTEM_PROMPT.md` at startup. Restart it after changing the prompt. Editing this index alone changes what an agent reads next; it does not add tools, change permissions, or enforce model compliance.

## Evidence and document status

Use operational manuals for supported contracts and inspect the current implementation when behavior is uncertain. `docs/ARTIFACT_AND_AGENT_DESIGN.md` mixes current behavior with future proposals. `docs/RELIABILITY_ROADMAP_IMPLEMENTATION.md` records acceptance status, including incomplete work. `docs/PRODUCTION_HARDENING.md` is an engineering snapshot; later implementation records may supersede its findings.

Model evaluation, benchmark segment, and cost reports under `docs/` describe the recorded run and date. Discover the relevant report with `local_file_list`; do not assume a historical price or ranking is current. `docs/TOOL_CALL_REPAIR_BENCHMARK.md` reports deterministic fixture estimates, not live provider billing or real-model completion evidence. Preserve that distinction when comparing agents or recommending configurations.

## Manual routing checks

After restarting, use a profile with the local read tools enabled:

| Request | Expected behavior |
| --- | --- |
| Which permissions do AI Chat tools need? | Read the capability manual; distinguish support from current access. |
| How do I configure a provider? | Consult setup and `.env.example`; do not request real credentials. |
| How does the streaming API finish a response? | Consult the API contract and cite the relevant section. |
| Can I resume every interrupted run? | Consult the API contract and acceptance record; state remaining limits. |
| Does AI Chat support stored agents and file uploads? | Read the design document and verify which parts are implemented. |
| Do these benchmark token counts prove provider savings? | Check the report method and date; distinguish estimates from reported usage. |
| Write a short invitation. | Complete the writing task without reading AI Chat manuals. |
| An app question with local read tools unavailable | Identify the inaccessible source and any uncertainty; do not invent a read. |

These are behavioral checks for the selected model, not guarantees enforced by the prompt.
