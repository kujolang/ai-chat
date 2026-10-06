# GLM builder → OpenAI reviewer versus OpenAI-only implementation

This is a new workflow comparison, not another arm of the earlier GLM guidance
experiment. Prepare and run it from the AI Chat repository root with Node 22.
No model requests occur during preflight.

## Question and arms

Does a lower-budget first draft reduce **frontier tokens needed for comparable
final work**, without lowering completion, correctness or independently assessed
source quality?

For each of the six existing maintenance specifications:

1. **Direct:** the selected OpenAI model implements from the original seed and
   tests its own result.
2. **Hybrid draft:** GLM implements the same task from a separate original seed.
   Save an immutable snapshot and independently check it.
3. **Hybrid upgrade:** if GLM delivered, copy its files into a fresh workspace and
   give the same OpenAI model a fresh session to inspect, correct and test them.
   Ask it to retain `REVIEW.md` with findings, changes and remaining limitations.

Alternate direct-first/hybrid-first order across tasks. Run sequentially; never
feed either arm the other's answer. Both frontier stages have the same requested
15-minute deadline and 12,000 response allowance. Provider-native harnesses may
interpret/ignore generation settings differently; this is a **workflow** comparison,
not a controlled comparison of base models. Both OpenAI arms use the same route.
Hybrid intentionally adds a separate 15-minute builder budget. Its total latency
and all builder tokens count; there is no equal-total-compute claim.

The app's optional engineering-review/contract overlay is disabled only inside
this isolated experiment. The explicit OpenAI upgrade is the review treatment;
each implementer is still asked to run tests. Native Codex's own harness remains
active. Production review settings remain untouched.

All arms receive the same requirements and runtime-qualified patterns. Reuse the
frozen 13 development and 59 holdout groups. Development observations alone may
enter the compact handoff; hidden checks, private reasoning and builder chat
history never do. Preserve full raw evidence outside the prompt. No repair loop,
transport retry or automatic resume is used. A failed builder is graded but does
not launch an upgrade. A correct partial file never counts as delivery.
If a timed-out client leaves execution running, or receipts show uncertain tools,
the runner requests cancellation and aborts the comparison before snapshotting or
grading mutable files. Raw evidence remains; no uncertain action is replayed.

## Configured lanes and preparation

The checked-in [config](kujo-hybrid.example.json) selects models actually listed
in this installation on October 6, 2026:

- GLM `glm-5.3-flash:cloud`, profile `Watchdog / Ollama Cloud`.
- OpenAI `gpt-5.6-sol`, profile `Watchdog / Codex`.

These names are local configuration evidence, not public availability or pricing
claims. Profile IDs/names and models are explicit and editable. The same runner
can later compare another builder model. Initial automatic isolation supports
managed Watchdog and Codex profiles: credentials stay with their existing external
services. ChatGPT-plan connection tokens and API keys are not copied from live
databases. That would need separate explicit setup before those routes can be used.
The owned benchmark child explicitly uses Codex `workspace-write`; production
sandbox settings are unchanged. Both models receive the exact qualified executable
path rather than relying on whichever `kujo` happens to be on PATH.

The live AI Chat instance must already be reachable (default port4174), Codex
must already be authenticated, and the intended Watchdog proxy must be running.
`lsof` must be available with permission to inspect local listener ownership.
Preflight checks the configured catalogs, one proxy listener and the exact Kujo
binary's 16 examples/32 checks; it does not test model entitlement or consume a
model request. The pinned binary below is the one used in previous local runs.

```bash
nvm use
node scripts/run-hybrid-benchmark.js \
  --config benchmarks/kujo-hybrid.example.json \
  --kujo data/toolchains/kujo-2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0 \
  --kujo-sha256 2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0 \
  --preflight
```

When ready, replace `--preflight` with:

```bash
--run --root data/kujo-hybrid-round-1
```

Use a fresh root for each repeat. Eighteen possible **stages** can make many more
than eighteen provider calls, and the nominal stage budgets total up to 4.5 hours.
Runtime qualification/independent checks add overhead. Provider timeouts or failed
builders can shorten the run; this is not an improvement by itself.

The runner starts and owns a separate AI Chat process on an OS-assigned free port,
with a new database and no copied chats/automations. It seeds only selected managed
profiles and settings; it never writes live state, starts/stops Watchdog, or copies
provider secrets. It shuts down its own child on completion/failure. Keep the code
and proxy stable while running. Source/acceptance hashes are checked before/after
stages; listener PIDs are also checked every five seconds during generation. A conflict,
restart or source change invalidates the run and preserves evidence. PID monitoring
cannot detect every routing/config change inside an unchanged proxy process.

Owned directories and instructions are **not an OS sandbox**. Codex has its native
workspace/permission boundary; other tools have AI Chat's configured boundary.
Do not claim sealed holdouts or use this runner for untrusted third-party code.

## Evidence, quality and acceptance

Each root retains `report.json`, `quality-review.json`, prompts, server/runner logs,
execution evidence, immutable per-stage snapshots and acceptance hashes. Raw
execution records may contain private paths/model reasoning; keep the root under
ignored `data/` and publish only sanitized summaries.

`report.json` separates builder, frontier-direct, frontier-upgrade and combined
hybrid input/output/cached tokens, tools and elapsed time. Missing usage remains
incomplete. The matched savings ratio is null unless both frontier stages have
complete accounting and verified deliveries. Report all assigned-task failures
alongside matched results; do not hide survivorship bias or infer subscription
allowance/dollar savings from tokens alone. Aborted comparisons are invalid even
if a partial summary contains a savings ratio.

An independent reviewer must fill `quality-review.json` by reading all three saved
artifacts and actual test assertions. Use the existing anchored 0–4 dimensions:
compatibility, maintainability, failure handling and test adequacy. Record concrete
before/after defects, scope of edits, regression evidence and gaps. The OpenAI
reviewer's self-assessment is evidence to inspect, not the grade. Zero for missing
implementation; grade saved partial artifacts separately from delivery. Do not
convert test pass rate to a source-quality score.

A promising result requires comparable final correctness **and source quality**,
no lost deliveries, and lower measured frontier work after every repair cost is
included. Report overall hybrid tokens/time as well. One six-task run is a pilot;
use fresh directories and repeated runs before adopting this as a default. No
frontier-parity, savings, or better-quality claim exists until live results and
independent review support it.

## Preparation receipt — October 6, 2026

- Preflight passed for the configured GLM/Codex lanes and single live Watchdog
  listener; **zero model requests dispatched**.
- Isolated instance startup, profile seeding and shutdown passed without writing
  live state. Eight focused regression tests passed, covering handoff exclusions,
  failure accounting, immutable drafts, alternating order, infrastructure abort,
  settled-execution checks and owned-server lifecycle.
- Full suite: `KUJO_REFERENCE_BIN=PINNED_BINARY node --test --test-concurrency=4
  --test-timeout=120000 tests/*.test.js` — 723 tests, 722 passed, zero failed,
  one existing platform skip. Log: `/tmp/hybrid-full-final.log`.
- Live model comparison and independent source grading have **not** run. This
  receipt verifies the experiment setup, not a savings or quality result.

The isolated child also opts into benchmark-only Codex instruction overrides:
`project_doc_max_bytes=0`, `skills.include_instructions=false`, and a scoped
`developer_instructions` value. These prevent personal AGENTS/skill instructions
from adding memory, publishing, or unrelated work to the measurement. They do
not replace Codex's base instructions or sandbox. Interactive instances ignore
the opt-in flag. These are documented in the [official Codex config schema](https://learn.chatgpt.com/docs/config-schema.json).
Prompt boundaries still are not OS isolation; inspect execution evidence for
out-of-scope reads before treating a run as valid.

Each stage uses `--fresh-chats` and a distinct title prefix. Existing benchmark
chat reuse is disabled for this comparison; a reused response is rejected before
grading. Ordinary benchmark resumptions keep their existing behavior.
