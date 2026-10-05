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
structured validation and CLI errors. `local_kujo guide` probes the actual permitted executable
before returning a version-qualified example. Type checks, CLI errors and validation currently require
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
