# Kujo maintenance quality experiment — October 5, 2026

Status: six-task baseline and guided comparison complete; separate bounded
transport follow-up running. Repository verification passed.

## Comparison result and assessment

**No overall quality improvement is demonstrated.** There are specific useful
changes in the generated artifacts, but the guided arm lost a delivery, retained
an unchanged migration seed, and used substantially more reported tokens and
calls. These are two single-sample arms, not enough to attribute the difference
causally to guidance or to rank model families. No frontier model was tested.

| Measurement | Baseline | Patterns + bounded feedback |
| --- | ---: | ---: |
| Initial model attempts | 6 | 6 |
| Completed, independently verified deliveries | 5/6 | 4/6 |
| Development groups passed on saved artifacts | 13/13 | 11/13 |
| Hidden holdout groups passed on saved artifacts | 59/59 | 51/59 |
| Total independent groups passed | 72/72 | 62/72 |
| New controller repair requests | 0 | 0 |
| Tool calls | 305 | 570 |
| Provider rounds | 226 | 365 |
| Reported input tokens | 12,543,603 | 21,406,785 |
| Reported output tokens | 520,099 | 473,276 |
| Total reported tokens | 13,063,702 | 21,880,061 |
| Reported cached input tokens | 9,479,680 | 17,449,600 |
| Attempts with complete usage accounting | 5/6 | 4/6 |
| Summed model-request elapsed time | 68m 31.693s | 63m 56.959s |
| Mean assigned-task artifact score, missing work = 0 | 2.625/4 | 2.250/4 |
| Mean edited-artifact score, unfinished migration excluded | 2.625/4 | 2.700/4 |
| Mean delivered-artifact score only | 2.650/4 | 2.750/4 |

The guided arm used **67.5% more reported tokens and 86.9% more tool calls**.
Tokens include repeated/cached context; they are not unique context or a dollar
bill. Incomplete attempts make reported usage a lower bound. Elapsed times are
receipts, not a controlled speed benchmark, and the rapid failed read loop lowers
the guided arm's time without delivering useful work.

Saved-artifact checks include posthoc frozen checks on baseline stock and guided
pagination/migration. They do not convert failed deliveries into successes.
Baseline stock's HTTP 413 left correct saved code. Guided pagination left correct
code but exceeded its 15-minute deadline. Guided migration never edited the seed:
0/2 development and 2/10 holdout cases pass by inherited behavior only.

### Source quality, with evidence

Each cell is the mean of compatibility, maintainability, failure handling and test
adequacy, each anchored 0–4. These are unblinded editorial assessments, not
objective developer ranks or professional certification. The accompanying JSON
contains all four component scores, source hashes and concrete review evidence.

| Task | Baseline | Guided | Evidence that matters |
| --- | ---: | ---: | --- |
| Configuration | 3.00 | 3.00 | Both preserve false/zero/empty; comparable case-table coverage. |
| Pagination | 2.25 | 2.50 (partial) | Shorter slice-based implementation and a boundary harness; broad error catch and weak substring assertions remain. Guided delivery timed out. |
| Stock adjustments | 2.50 (partial) | 2.50 | Both validate each transition; guided version adds unnecessary JSON copying and lacks a replayable behavior suite. Baseline delivery hit HTTP 413. |
| Migration | 3.00 | 0.00 | Baseline has real CLI/idempotence/boundary tests. Guided seed is unchanged after a repeated-read loop. |
| Atomic save | 2.25 | 2.75 | Guided version uses explicit allowed keys and distinct errors, plus reset/postcondition checks; intermediate CLI case payload is not retained for direct replay. |
| CSV | 2.75 | 2.75 | Guided version retains CLI cases and a real 1000/1001-row harness, but makes false/overbroad runtime claims in its documentation. |

The assigned-task means translate to **6.56/10 versus 5.63/10**. Looking only at
edited artifacts gives **6.56/10 versus 6.75/10**; delivered-only scores give
**6.63/10 versus 6.88/10**. Those selective improvements are small, omit different
failed tasks, and do not establish a meaningful general quality gain. No item
scored 4 in any dimension. This remains useful supervised implementation work,
with inconsistent testing/documentation judgment and unacceptable autonomous
reliability for an unreviewed production workflow.

The CSV Go harness was independently rerun and passed all 15 printed assertions.
A separate pinned-runtime probe `print(is_bool(true))` prints `true`, exit 0,
contradicting its generated claim that the predicate is unavailable. Its cited
probe file contains a different dictionary-enumeration test. Its blanket
`len(dict)` assertion also conflates literal and parsed representations, as the
cross-repository reproduction below shows. Candidate files were not manually
corrected to improve grades.

The existing in-app engineering review is distinct from the new development
repair controller. Baseline review outcomes are pass/pass/not-requested/
inconclusive/pass/pass. Guided outcomes are inconclusive/pending/pass/
not-requested/inconclusive/pass, with one existing review repair in pagination
and atomic save. An inconclusive review is not a pass. All completed candidates
passed development checks immediately, so **the new controller was not exercised
live**; its deterministic tests establish boundaries, not a demonstrated model
quality benefit.

### Promotion decision and next comparison

Keep the new patterns and repair harness opt-in. Keep the verified proxy-byte
fix active. Do not add another global instruction stack or advertise
frontier-level quality from these results. The next useful reliability experiment
is a bounded non-progress controller, using the captured repeated-read failure
and changed-content/range exceptions, rather than another warning alone.

For an eventual GLM/DeepSeek comparison, run both on the **same fixed AI Chat
build**, the same exact Kujo binary, fresh candidate roots and the frozen protocol.
Record each explicit model/profile selection, all failed attempts, source quality
and cost; use multiple repetitions before promoting a default. These old-build
arms are not a clean cross-model comparator for a later fixed-build DeepSeek run.
No DeepSeek requests or profile changes were made here. Scores from earlier
mixed-language corpora are historical context, not directly comparable grades.

Observed scope limits: baseline stock listed the parent data directory; baseline
migration attempted parent listings and listed workspace root; baseline CSV read
the allowed Kujo runtime setup documentation. No receipt showed oracle or other
candidate file contents being read. Guided file operations remained within their
owned candidate paths. This audit does not turn prompt restrictions into an OS
sandbox or certify the absence of every possible information leak.

## Scope and method

This follow-up implements the three next steps from the engineering judgment
comparison: bounded repairs driven by independent development checks,
runtime-qualified small language patterns, and unfamiliar Kujo maintenance tasks.
It does not promote another global prompt or claim frontier-level performance.
The repair controller is an opt-in experiment API; ordinary UI chats do not
automatically execute these task-specific acceptance checks.

The preregistered [protocol](../../benchmarks/kujo-maintenance-protocol.md) uses six
new tasks: configuration values, pagination, ordered stock adjustments, idempotent
migration, atomic settings publication, and lossless CSV export. The baseline and
guided arms use GLM 5.3 Flash through the same Watchdog / Ollama Cloud profile.
Both retain compact grounding, allocation guidance, batch verification and the
existing engineering review. Only the guided arm receives selected pattern text
and up to two development-driven repairs. New guide topics are available to both
arms; this measures supplied context, not exclusive tool access.

There are 13 development cases and 59 distinct holdout cases, calibrated against
independent correct implementations and defective legacy seeds. These are 72
case groups, not 72 independent engineering assignments. Initial guided and
post-repair results are paired observations, not independent rounds. Holdout
results never enter model repair feedback. All initial deliveries, failed
attempts and repair costs count; no transport retry is used to force a pass.

Kujo 1.7.0 default backend is pinned to SHA-256
`2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0`.
Sixteen reference examples passed 32 compile/run checks before generation.
New maintenance patterns are not represented as qualified on older runtimes or
the interpreter backend. Acceptance assets and candidate snapshots are hashed.
Prompt boundaries and hashes are not an operating-system filesystem sandbox.

Raw receipts, model artifacts and snapshots remain in the ignored directory
`data/kujo-maintenance-20261005/`; they are not included in this report because
they can contain private local paths and model reasoning. The [sanitized result artifact](kujo-maintenance-2026-10-05.json)
records measured outcomes and source evidence only.

## Delivered changes and compatibility

- `lib/verified-repair.js`: bounded development-driven repair controller, original
  deadline, acceptance integrity checks, and snapshots before each repair.
- `lib/kujo-maintenance-reference.js`, `lib/kujo-development.js`: qualified
  presence, staged-validation and quoted-text topics, with backend restrictions.
- `scripts/run-kujo-maintenance-evaluation.js`,
  `scripts/verify-kujo-maintenance.js`, benchmark seeds and independent test
  controls: provider-neutral experiment and real CLI/disk acceptance checks.
- `lib/context-budget.js`, `lib/server-runtime.js`: exact serialized request-size
  budget alongside model context, with explicit pre-dispatch errors and telemetry.

Existing provider profiles, account credentials, model selections, public chat
contracts and persistence formats are preserved. The additive request-byte
configuration and error are documented in `.env.example`, `SETUP_AND_INSTALL.md`
and `docs/API_CONTRACT.md`. No dependencies were added. Production chat does not
silently run benchmark repair prompts. The benchmark examples are not universal
language guarantees; they are qualified for the pinned default runtime only.

## Verification and environment

Before model dispatch, local TCP connectivity intermittently failed, including a
standalone Python process connecting to its own loopback listener. The affected
existing HTTP/browser/action/OAuth tests were not evidence of model-generated
code defects. The root cause was not established; no firewall or VPN settings
were changed. A graceful idle application restart did not immediately fix it.
Connectivity later recovered, and three authenticated application health calls
succeeded before benchmark dispatch. Failed setup attempts dispatched no model
requests and were excluded from model cost.

Verification receipts (Node 22.17.0, pinned `KUJO_REFERENCE_BIN`):

| Check | Result |
| --- | --- |
| Reference qualification | 16 examples, 32 checks passed |
| Focused controller, oracle and guide tests | 24 passed |
| Initial serial full suite | Interrupted during loopback incident; not a pass |
| First bounded full suite during incident | 681 passed, 15 failed, 1 skipped |
| Full suite after loopback recovery, before byte-limit fix | 697 passed, 0 failed, 1 existing platform skip; 698 total |
| Full suite with byte-limit fix | 702 passed, 0 failed, 1 existing platform skip; 703 total |

Exact final full-suite command:

```sh
PATH=/Users/robertdevore/.nvm/versions/node/v22.17.0/bin:$PATH \
KUJO_REFERENCE_BIN="$PWD/data/toolchains/kujo-2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0" \
node --test --test-concurrency=4 --test-timeout=120000 tests/*.test.js
```

The skipped test requires Linux mount isolation. The recovery suite took
66,168.988382 ms; the byte-limit suite took 60,379.00678 ms; these are verification receipts, not speedup claims. The recovery suite overlapped
the beginning of baseline task 1 and the later suite overlapped baseline work, so benchmark latency is not a controlled
throughput comparison. Verbose logs are preserved at
`/tmp/ai-chat-maintenance-{controls-final,recovered-full-tests}.log` and the earlier
`full-tests` / `bounded-full-tests` variants.

## Cross-model reproduction

The controller takes an explicit provider profile and model identifier. The same
frozen protocol can be repeated in fresh owned directories for DeepSeek; no
DeepSeek run or profile change is part of this experiment. See
[development benchmark instructions](../../benchmarks/DEVELOPMENT.md).

## Request-size defect found and fixed during the experiment

Baseline stock task 3 ended on HTTP 413 at provider round 40. AI Chat's audit
record reports a 530,495-byte request, a 95 ms rejection, and a 71-byte JSON-like
response. Read-only Watchdog telemetry identifies request row 8149 at the matching
time as `json_parse_limit`: “JSON body exceeds configured parse limit: 524288”.
The model's discovered context window was 1,048,576 tokens; AI Chat had no separate
proxy-body budget. This is a verified transport integration defect, not a claim
that the stock code failed or GLM exhausted its documented token window.

Commit `6909cf6` adds an independent serialized-body budget to the existing
context compactor. Managed Watchdog routes default to 524,288 bytes, configurable
through `WATCHDOG_MAX_REQUEST_BYTES` and a benchmark-specific override. Operators
must match the smaller actual Watchdog parse/proxy limit. It preserves the model
window/output allowance and saved receipt references; it neither enlarges
Watchdog limits nor automatically replays failed work. Unfit protected content
fails locally before dispatch. Direct Ollama connections with Watchdog telemetry
are unaffected. HTTP 413 errors now explain the request-size boundary without
exposing provider response contents.

Six focused regressions pass, covering the observed request size, Unicode/JSON
escaping, exact byte boundaries, protected input rejection without dispatch,
stream/JSON envelopes, and direct-transport exclusion. The full 703-test suite
passes with one existing platform skip. No Watchdog repository files or settings
were changed.

Both comparison arms continue in the same already-running Node process loaded
at `4d28a5b`; it is not restarted between arms. Therefore this fix is **not**
credited with changing either arm's result. The corpus, guidance and acceptance
assets remain frozen, and the new code is verified separately. Incomplete
candidates retain failed-delivery status even when posthoc frozen checks pass.

The idle interactive LaunchAgent was gracefully restarted after verification.
Authenticated health, providers, state and offline chat smoke checks passed on
port 4174. Its health reports the new 524,288-byte cap; all seven provider profiles
match their pre-restart hash and the experiment-start hash. The benchmark process
on port 4198 was not restarted.

### Bounded transport follow-up (specified before execution)

After both arms finish, run stock task 3 once in a fresh directory against the
fixed server at `6909cf6`. Reuse its original baseline contract and defective seed,
with only the owned path changed: same model/profile, 12,000 response allowance,
15-minute deadline, no new guidance and no retry. Apply the same frozen checks
afterward; show no development or holdout counterexamples to this follow-up model.
Record whether the byte guard actually compacts a request. A new delivery without
a triggered guard is not live evidence that the guard caused success; deterministic
regression coverage still proves the boundary. Report its cost and outcome
separately, never as a replacement baseline pass or a new six-task round.

## Cross-repository finding: dictionary length parity

During source review, contradictory generated notes prompted a separate runtime
probe. On the pinned Kujo 1.7.0 binary, this program prints `true` and then exits 4
with `KUJOVM001` under the default backend:

```kujo
let value := {"x": 1}
print(is_dict(value))
print(len(value))
```

Changing the initializer to `parse_json("{\"x\":1}")` prints `true` and `1`, exit
0. Both forms pass under `--interpreter`. The current Kujo checkout at
`0d22cc0ec18785a3bb13aad85a3a4528e6f17adf` has a release binary with the same SHA;
the mismatch reproduces there too. This does not prove that the binary was built
from that exact source commit.

Code evidence: `kujo/src/interpreter/native_functions/type_ops.rs` recognizes
`Value::FixedDict` in `is_dict`, and `collections.rs` handles it in `keys`, but the
native `len` match omits it. That omission is the code-supported root-cause
candidate. Kujo needs a dictionary-representation parity fix and default/backend
regression tests. No sibling source was modified. `len(keys(value))` passed all
four literal/parsed × default/interpreter probes as a scoped workaround.

The [sanitized reproduction receipt](kujo-dictionary-length-2026-10-06.json)
records exact results. These probes do not change either benchmark arm or enter
its model context. Guided pagination's `len(input)` operates on parsed JSON and
passes its independent cases; the literal-dictionary defect is not a reason to
mark that CLI incorrect. Conversely, the baseline models' broad claim that
`len(dict)` is unavailable was too general. This discrepancy can mislead runtime
exploration, but it does not explain every model-quality or efficiency weakness.

Follow-up is recorded in SignalBox project `kujo`: capture
`cap_aae9dff8-feb7-41fe-809c-252572c67d93`, signal
`sig_5b813fc7-aba1-42c3-8462-f62e8cdeb118`. Exact retrieval and concept search
confirmed persistence. Existing AI Chat loop-cost and isolation findings are not
duplicated; resolved transport work and routine verification are not captures.

## Repeated-read control limitation

Guided migration made 294 complete, successful file reads of the same two
unchanged files, with distinct call IDs, without editing the seed. The existing
unchanged-read advisory was present once in the checkpoint; it triggered but did
not interrupt this loop. The attempt consumed 9,517,851 reported tokens before
HTTP 413, with incomplete usage accounting. File results were neither absent nor
truncated. This supports a failure of the advisory to prevent this occurrence,
not a claim about GLM's internal cause or a cancellation leak. The separate byte
cap controls transport size; it does not guarantee forward progress.

[Sanitized loop evidence](kujo-maintenance-loop-2026-10-06.json) accompanies the
report. New counterevidence is stored as SignalBox capture
`cap_82933ab0-9bfa-49dc-85a5-60776a24e990`, related to the existing
`sig_98880f28-8e05-4b8d-8092-7fd0915204ae`; no duplicate Signal was created.
A future non-progress control needs explicit bounds, changed-file/range exceptions,
transparent termination, and a held-out live test. Another advisory alone is not
an evidence-backed remedy.
