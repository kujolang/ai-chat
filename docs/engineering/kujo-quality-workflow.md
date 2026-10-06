# Kujo quality workflow

The workflow improves grounding and verification, not the model's underlying
training. It does not establish frontier parity or certify production readiness.

## Runtime-grounded context and reusable patterns

For a latest user request mentioning Kujo or a `.kujo` file, with `local_kujo`
authorized, AI Chat supplies a bounded repository-owned task guide. It selects
relevant guide topics without copying request or tool text into trusted
instructions. Other providers and languages retain their existing paths.
The guide is reconstructed for worker rounds, survives context compaction, and
is omitted during reviewer/final phases. It adds at most 2,400 characters per
worker request. This is a character budget, not a token claim.

`lib/kujo-development.js` is the authoritative small example corpus: core,
arguments, collections, timing, JSON, exceptions, atomic persistence, type checks,
structured validation, CLI errors and whole-row replacement. `local_kujo guide` probes the actual permitted executable
before returning a version-qualified example. Type checks, CLI errors, whole-row replacement and validation currently require
1.7.0; 1.5.0 failed that example's VM execution. Existing examples remain available
on their previously verified versions. Verification applies to these examples,
not every program or backend. Use matching documentation for APIs not covered.

Run `KUJO_REFERENCE_BIN=/absolute/qualified/kujo node scripts/verify-kujo-reference.js`
after any corpus change. It checks compilation and exact stdout, stderr and exit status in an
owned temporary directory. Do not add generated benchmark answers to this corpus.
New examples need provenance, a minimal general-purpose operation, explicit
supported versions, executable assertions and rejection/failure cases where
relevant. Fine-tuning a hosted Ollama model requires a separate supported training
and deployment path; this repository does not have one. Retrieval comes first.

## Evidence and diagnosis

`local_kujo run/benchmark` inserts the CLI `--` separator. Supply only literal
script arguments (`args: ["[]"]` for one JSON array), not an additional separator.
Explicit `--` arguments are preserved, never silently removed.

`local_kujo` accepts optional `verification_paths` (at most 16 unique paths relative
to cwd). List known imports and test/config inputs. The existing workspace and
sensitive-file restrictions apply. The tool hashes the entry file and declared
files before and after execution. A changed/missing file invalidates success;
benchmark trials stop when the manifest changes. Review inventories expose hashes.
This does not discover undeclared imports, detect temporary edits restored before
capture, or certify behavior. Shell-only tests still require source inspection.

The immutable engineering contract links requested invariants to executable
receipts after the latest recorded write. Later observed changes to declared-file
hashes invalidate earlier evidence, including edits made outside local_file_write. Syntax checks alone do not count.
Negative test harnesses should assert expected rejection and exit zero themselves.
After two consecutive failures in a tool/category, bounded diagnostics request a
minimal reproduction. After five, they request a compact blocker/verified-state
summary and an evidence-based next check. Successful execution resets the streak.
These notices never retry, change runtime, extend timeouts or bypass permissions.
The worker and reviewer guidance also call for appropriate collection complexity,
representative scaling checks where relevant, and avoiding duplicated implementations.
These are advisory checks, not a static complexity analyzer.
The advisory reviewer must inspect partial-write handling and state publication,
not merely successful rename. Reviews are still fallible, including correlated
mistakes from the same model.

## Independent acceptance and measurement

Freeze acceptance assets outside the builder's task directory before generation:

```js
const fs = require('node:fs');
const { acceptanceManifest } = require('./lib/acceptance-integrity');
fs.writeFileSync('/tmp/acceptance.json', JSON.stringify(acceptanceManifest([
  '/absolute/path/to/verifier.js', '/absolute/path/to/calibration-fixture.js'
])));
```

Pass `--acceptance-manifest /tmp/acceptance.json` to `scripts/run-benchmark-suite.js`.
It validates before generation, between tasks and at completion, records hashes,
and marks a changed/deleted/symlink-replaced asset invalid. Before grading, call
`assertAcceptanceUnchanged` again. Keep the trusted manifest outside model context.
This detects persistent tampering; it is not filesystem isolation. With unrestricted
shell access the builder can access more than its instructed directory. Strong
isolation requires a separately permissioned/containerized runner and controller.
Do not report a contaminated run as an independent pass.

Keep acceptance implementations out of model context. Calibrate oracles with a
known-good implementation and deliberate defects before measuring generated code.
Existing judgment-transfer and short-write calibration tests provide both positive
and negative controls. Grade generated files without repairing them. Preserve
failures and source hashes. A successful stream is not task completion.

Compare matched tasks, runtime, budget and settings. Report acceptance rate,
per-case failures, tokens, tool calls, elapsed time and review outcome separately.
Use fresh holdouts for quality claims; repeated public tasks measure reliability
and can encourage overfitting. Frontier comparisons require the same specification,
independent oracle and run conditions. Never infer parity from compilation or a
single successful round. Production judgment requires broader unseen tasks and
human review of design and failure behavior.


## Observed runtime limitation

On the pinned 1.7.0 binary with SHA-256
`2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`,
[nested index assignment](reproductions/nested-index-assignment.kujo) passes
`kujo check`, but the default VM exits 4 with `Stack underflow`; the interpreter
exits 4 with `Complex index assignment not yet supported`. Switching backends
therefore does not fix this program. The `nested_collections` guide demonstrates
verified whole-row replacement. Guides disclose the limitation; no automatic
rewrite or replay occurs. This needs a Kujo compiler/runtime follow-up, not an
AI Chat transport workaround. Requalify exact binaries after upstream changes.

## Controlled efficiency variants

The opt-in compact reference (`KUJO_GROUNDING_MODE=compact`) replaces the legacy
2,400-character topic guide with at most 2,200 characters of trusted syntax and
known runtime limitations. One authorized runtime probe supplies the version;
unrecognized versions receive no trusted examples. Numeric `sort` is now an
executable corpus example verified on 1.7.0. Longer examples remain on demand.

`KUJO_VERIFICATION_BATCH_ENABLED=1` exposes explicit CLI case batches, including
expected rejections. Per-case raw evidence stays in the encrypted journal; the
model sees bounded assertions and result references. Fewer model tool calls do not
mean fewer child processes. Report both. Argument, output, permissions and total
execution-budget limits still apply; there is no automatic retry.

`ENGINEERING_REVIEW_MODE=selective` routes deterministic evidence gaps directly to
the worker before the semantic review. It focuses that review on final changes,
requirements and decisive evidence. It deliberately retains a semantic review when
only model-authored tests exist: receipt success cannot establish test adequacy.
All repairs share the existing two-pass/five-minute review budget.

The fresh collection oracle (`scripts/verify-kujo-collections.js`) checks real CLI
entry points for consecutive runs, numeric frequencies and sorted union. Its tests
calibrate it against an independently written reference and defective variants.
It separately measures 200/800/3200-element inputs, three trials each. Timing
ratios are diagnostic evidence, not hardware-sensitive CI gates. Inspect final
source for algorithmic complexity and duplicated production implementations;
passing behavioral cases alone does not grade maintainability.

## Allocation performance reference (experimental)

`KUJO_ALLOCATION_GUIDANCE=1` makes the `allocation` guide available and adds a short
allocation hint to compact grounding. It does not transform generated code.
Performance guidance requires the exact SHA-256 pin and default backend recorded
in `lib/kujo-allocation-reference.js`. Other binaries/backends get an explicit
unqualified-performance notice; version-matched example correctness is separate
from a speed claim. Full compact context still stays within 2,200 characters.

The general pattern uses a bounded capacity from validated input, allocates
`range(0, capacity)` **inside a function**, fills single-level indices, and returns
`slice(out, 0, used)`. Never return unused placeholder elements; do not use nested
index assignment. For large inputs, repeated functional `push` can copy the growing
array on the qualified runtime. Global-scope indexed assignment is also materially
slower than the verified function-local pattern. This is runtime-specific evidence,
not a blanket rule for other languages or Kujo builds.

Reproduce with `node scripts/measure-kujo-array-growth.js /absolute/qualified/kujo`.
It checks complete output equality for 200/800/3200 items, three process trials each,
for append/indexed construction at global and function scope. Fixed pure workloads
and a per-process deadline keep the experiment bounded. Model benchmark results
must be reported separately; a fast hand-written probe is not proof the model will
apply the pattern or improve its final source.

Focused review also retains a compact index of up to 64 parent tool receipts,
including failed and custom operations, so omitted historical payloads do not hide
shell/script mutations. Child case references remain in the parent verification
result. The reviewer must inspect potentially mutating activity; an incomplete
activity index forces an inconclusive outcome. This index is not a filesystem
snapshot or proof that all writes were discovered.

With engineering contracts enabled, six consecutive successful complete file reads
that repeat the same contents of at most two files now produce one progress notice
per execution. The notice asks the worker to use existing evidence or state a
concrete blocker. Changed content, pagination, intervening activity, and reviewer
reads do not trigger it. Evidence remains available; the notice does not block
reads, grant writes, replay operations, or change task budgets. Its emitted state
survives resume through the existing diagnostic checkpoint. This addresses a
measured read-only loop; it does not guarantee that a model will follow the notice.

## Independent development-feedback experiment

The maintenance controller in `scripts/run-kujo-maintenance-evaluation.js` can
feed bounded, controller-owned counterexamples to an explicitly selected model
before final grading. It preserves each pre-repair candidate and grades different
holdout cases without revealing those results. The generic state machine lives in
`lib/verified-repair.js`; it stops on budget limits, incomplete execution or changed
acceptance assets. Completed check evidence is saved before requesting another
model pass. It does not automatically run arbitrary repository tests in ordinary
chats or grant new tool permissions.

`local_kujo guide` adds three small 1.7.0-qualified examples: `presence` (explicit
false/zero versus missing fields), `staged_validation` (all transitions checked
before publication), and `quoted_text` (one lossless CSV cell). They are on-demand
examples, not full task solutions or a guarantee of correctness. The selected
binary must still be qualified; no global prompt growth/default promotion is made.
See [maintenance workflow](../../benchmarks/DEVELOPMENT.md#kujo-maintenance-with-independent-repair-feedback)
for the provider-neutral experiment and calibration commands.

### Repeated-read recovery and runtime facts

The local-development tool loop now deduplicates unchanged complete read results
at six consecutive reads and stops at twelve if no other tool progress occurs.
This applies independently of optional engineering contracts/review. The latest
full evidence remains in provider context; immutable originals remain accessible
through `tool_result_read`. A stopped attempt is incomplete, not successful, and
requires explicit operator resume. See the API contract for exclusions and state.

Offline replay of a saved execution is available without inference:

```sh
node scripts/replay-read-progress.js /path/to/saved-execution.json
```

The file must contain `execution.checkpoint.messages` and `receipts`. Output is
counts only; it does not print private model reasoning or predict token savings.

The on-demand `types` guide now demonstrates `is_bool` and `len(keys(value))`.
The known literal-dictionary length warning is scoped to the exact reproduced
binary SHA and default backend, and only to relevant requested guide topics.
This mitigates a runtime pitfall; it does not patch the sibling Kujo runtime or
justify claims that all dictionaries lack `len` or booleans lack a predicate.
