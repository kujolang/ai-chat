# Kujo documentation head-start experiment — October 3, 2026

**Targeted guidance reduced observed discovery/context overhead in this pair,
but did not demonstrate better correctness.** Both control and guided treatment
completed the Kujo/Go task, passed their first Kujo syntax check, and independently
passed seven boundary cases in both languages. The guided response still made
unsupported measurement claims.

## What this says about model knowledge

We cannot inspect this model's training corpus or establish whether it saw Kujo
before training. The earlier F run's invented builtins and failed syntax probes
are evidence of unreliable language recall; they do not prove missing training
data. E, G and this pair also show that the model can produce correct Kujo on its
first try after consulting references. Local documentation and compiler feedback
can compensate for uncertain recall.

Earlier Go CSV weaknesses are a different problem: non-finite amounts, overflow,
header validation and output escaping are requirements/edge-case issues. They
occurred in a widely used language too. More Kujo documentation alone should not
be expected to fix those, nor the model's unsupported benchmark interpretations.

## Design and controls

Starting application checkout: `d916745845ca6fcca6d2b74d7bfd3c45b8b598c3` on main;
production application source still `c7e001f`. No app, settings, provider, runtime,
permission or system-prompt changes; no server restart.

One sequential pair, using only the existing development **task 2**, not two
full six-task suites:

- A/control: original Kujo/Go prime-counting prompt, fresh `exhaustion-contexta/02`.
- B/treatment: same prompt plus the inline [Kujo starting guide](../../benchmarks/context-guidance/kujo-start.md), fresh `exhaustion-contextb/02`.

Both prompts prohibit reading prior generated answers; documentation reads are
allowed. Both use Watchdog / Ollama Cloud, `deepseek-v4.1-flash:cloud`, local-dev
tools, 6,000 requested output tokens, concurrency one, one attempt, a 1,200,000ms
runner deadline and the existing 1,048,576-token context override. The guide adds
exact local doc paths, official URLs, verified syntax/builtin facts and advice to
check symbols instead of guessing. It contains no prime solution or new advice
about interpreting timing measurements.

The [predeclared protocol](../../benchmarks/context-guidance/protocol.json) records
rubric and source SHA-256 hashes. The guide/protocol were created before results
were graded. Independent executions and the full application test suite ran only
after both model timing sequences finished. No generated code was manually fixed.

The existing prompt already says to read documentation; this tests better
orientation, not access versus no access. This bundled intervention does not
isolate inline examples from precise paths or links. One pair, fixed order,
changing provider/host load and model-selected algorithms/workloads prevent a
general causal or statistical claim. No numeric subjective quality grade was
invented after seeing results.

## Results

| Measure | A: ordinary prompt | B: documented head start |
|---|---:|---:|
| Independently completed task | 1/1 | 1/1 |
| First Kujo syntax check | Pass | Pass |
| Boundary cases, each language | 7/7 | 7/7 |
| Kujo syntax/builtin execution failures | 0 | 0 |
| Failed tool receipts | 0 | 1, recovered |
| Tool receipts | 50 | 35 |
| Provider rounds | 33 | 27 |
| Local file reads | 7 | 2 |
| Reported input tokens | 1,291,547 | 568,008 |
| Reported output tokens | 14,529 | 10,420 |
| Reported total tokens | 1,306,076 | 578,428 |
| Final tool-result context characters | 123,021 | 46,745 |
| Whole-run elapsed | 111.126 s | 110.145 s |
| Genuine trials / correct medians | 5 each / yes | 5 each / yes |
| Runner retries / terminal errors | 0 / 0 | 0 / 0 |

B used **727,648 fewer reported tokens (55.7%)**, 15 fewer receipts (30%) and
five fewer file reads. Its final tool-result context was 76,276 characters smaller.
These are observed differences in this pair, not expected savings for every task.
Usage sums repeated inputs across rounds; cache detail/cost was not available.
Context character counts are not token counts. Neither run compacted tool context.

A located the specification/library plus three language examples and read the
library repeatedly. B used two targeted reads at the supplied paths with `rg`
queries. Both consulted actual local sources before writing code. B still did
some directory discovery; it did not blindly trust only the inline facts.

B incorrectly invoked `./` with the binary path as an argument, received
`local_shell_failed`, then invoked the binary correctly. This was a shell-call
mistake, not a Kujo-language error or terminal harness failure. Its final assertion
that no errors occurred overlooks that recovered failure.

## Independent correctness and timing review

Both programs produce counts 0/0/1/2/2/15/168 for limits
0/1/2/3/4/49/1000, respectively. All fourteen executions per arm exit 0.
Actual receipts confirm initial 1,000 agreement, separate Go compilation, workload
scaling/warmup and five successful recorded trials per language.

A uses trial division over every candidate divisor, with internal `time_us()`
Kujo timing and Go `time.Since`. At 50,000, both count 5,133 primes:

- Kujo microseconds: 1,161,304; 1,089,493; 1,069,748; 1,034,088; 1,070,994.
  Median **1,070,994 µs**.
- Go microseconds: 10,851; 10,301; 14,635; 12,864; 10,986.
  Median **10,986 µs**.
- First/repeated build shell durations: 1,017.280 / 303.199 ms.

B skips even divisors and uses internal `current_timestamp()` milliseconds for
Kujo and `time.Since(...).Milliseconds()` for Go. At 200,000, both count 17,984:

- Kujo milliseconds: 5,141; 8,885; 9,893; 6,326; 5,599. Median **6,326 ms**.
- Go milliseconds: 63; 94; 83; 90; 93. Median **90 ms**.
- Build shell duration: **673.105 ms**.

All listed medians match actual receipts. Programs implement equivalent algorithms
within each arm, but **A and B use different algorithms and workloads**. Near-equal
end-to-end latency does not measure equal work, and the language ratios are not
comparable across arms. The Kujo clocks are documented timestamp functions;
neither arm establishes a monotonic microbenchmark clock or controls host load.

A calls its repeated build warm, which is plausible after a first build but not
an instrumented cache measurement. B explicitly calls its build **uncached**
without clearing or measuring the Go build cache. B also attributes variation to
"interpreter overhead + host load" without evidence; runtime help identifies the
VM as the default, and no interpreter flag was used. Neither successful program
makes these causal explanations trustworthy. The guide improved orientation but
did not address measurement literacy.

## Documentation and MCP boundaries

Sources inspected locally:

- [Official docs](https://docs.kujolang.ai/), backed by sibling `docs.kujolang.ai`.
- [Language specification](https://github.com/kujolang/kujo/blob/main/docs/LANGUAGE_SPEC.md).
- [Standard library reference](https://github.com/kujolang/kujo/blob/main/docs/STANDARD_LIBRARY_REFERENCE.md).
- [Kujo MCP framework](https://github.com/kujolang/mcp), local `../mcp/README.md`.

The browser tool could not retrieve the public docs homepage during setup; source
claims were verified from local repositories, not assumed from a live website.
Hashes in the protocol identify the exact local reference files. Those docs say
current stable 1.7.0 while the installed runtime reports **1.5.0**. The tested
symbols work on this runtime, but future guidance must be version-aware rather
than assuming every symbol in newer docs exists locally. No runtime upgrade was
performed, because that would confound this comparison.

AI Chat's `lib/rag-runtime.js` exposes `documentation_query` as configured HTTP
retrieval with citations. Neither arm invoked it; both used local file reads and
shell searches. This experiment therefore does **not** evaluate RAG quality or a
native MCP connection. The MCP repository is a framework, not an automatically
available language oracle. Providing its URL did not register additional tools.
Both arms had identical tools; native MCP execution remains untested here.

## Recommendation bounded by evidence

A compact, version-aware Kujo orientation guide is a promising way to reduce
unnecessary discovery. The reusable guide is saved for further tests; it has not
been injected into all AI Chat conversations or unrelated providers.

Before making it a default, use several fresh Kujo task families and repeated,
counterbalanced A/B order. Grade first-run syntax, independent edge cases, correct
API use, unsupported claims and task completion separately from latency/tokens.
A later independent arm can expose verified MCP/RAG capabilities to measure their
incremental value. Keep provider/model fixed to isolate context changes.

For Go/Node quality, use explicit behavioral acceptance tests and review checks;
more language links cannot substitute for financial validation or persistence
semantics. Current evidence supports "better starting context can reduce search
work," not "the model's training gap caused all earlier errors" or "MCP fixes
code quality."

## Evidence and verification

Run IDs: `dev-2026-10-03-exhaustion-contexta` and
`dev-2026-10-03-exhaustion-contextb`. Ignored raw runs/receipts are under
`data/benchmark-runs/`; generated programs under the matching
`data/dev-benchmark-2026-10-03-exhaustion-context*/02` directories.

[Sanitized metrics and independent checks](kujo-context-ab-2026-10-03.json).
[Reproduction instructions](../../benchmarks/context-guidance/README.md).

Reviewer commands after both runs:

- `kujo run primes.kujo N` plus `./primes N` (A) or `./primes_go N` (B), for
  N=0,1,2,3,4,49,1000 — 28 successful, correct executions.
- Python receipt assertions — five trials after warmup, correct medians,
  first syntax check success, writes confined to assigned directories, and
  no prior generated answer reads observed.
- `npm test` using Node 22 — 540 pass, one Linux-only skip, zero failures;
  log `/tmp/context-ab-app-tests.log`.
- `git diff --check` and JSON consistency — checked before commit.

No production code, settings or credentials are included in this change.
