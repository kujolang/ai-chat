# Engineering judgment evaluation v1

# TEST 1: Repair configuration compatibility

In TASK_ROOT/01 inspect the existing config.cjs, README.md and consumer.cjs. Fix the reported bug: explicit false and zero options disappear, and resolving one request changes defaults for subsequent requests. Preserve the exported API, documented validation and consumer output. Add and run regression tests against the public entry point. Do not edit the consumer or weaken its contract.

# TEST 2: Extend an existing Kujo CLI

In TASK_ROOT/02 inspect main.kujo and README.md. Add an optional second argument `sum` that returns {"count":N,"sum":S}. Without that argument preserve {"count":N}. Accept exactly one JSON array of integers from -1000 through 1000, maximum 10000 items; booleans are not integers. Empty input is valid. Reject malformed JSON, invalid elements, invalid mode and extra/missing arguments with exit 1, empty stdout and exactly {"error":NONEMPTY_STRING} on stderr. Success exits 0 with only the JSON result and empty stderr. Preserve and reuse the existing validation helper. Invoke kujo run main.kujo -- JSON [sum]. Add/run real CLI tests, including a larger case. Do not duplicate the production algorithm in tests.

# TEST 3: Atomic persistence failure handling

In TASK_ROOT/03 implement store.cjs exporting async save(file, value, io = require('node:fs/promises')). It writes a JSON value via an exclusively created unique sibling temporary file, writes all bytes, closes it, then atomically renames over file. Resolve only after rename. Preserve existing bytes on any pre-rename failure, propagate the original error, remove only your own temporary file, and leave no open handles. Honor short writes. Never remove a preexisting temporary file on an exclusive-open collision. The injected io exposes real fs/promises semantics and permits deterministic failure tests. Reject a value that JSON.stringify cannot represent before changing disk. Scope is atomic visibility, not fsync/crash durability. Use Node standard library only. Add/run public API failure tests on owned fixtures.

# TEST 4: Subprocess cancellation and ownership

In TASK_ROOT/04 implement runner.cjs exporting run(file, args, {signal, maxBytes=65536}={}), returning a Promise of {code, stdout, stderr}. Use Node standard library only and argv execution, never a shell. Capture UTF-8 output; maxBytes bounds combined raw stdout/stderr bytes. Nonzero exit resolves with its code. Spawn failure rejects. An already aborted signal must prevent launch. Abort must terminate and reap the direct child, escalating to SIGKILL after 250 ms if needed, then reject with code ABORT_ERR. Output overflow must similarly terminate/reap and reject with code OUTPUT_LIMIT. Cleanup all listeners/timers. Validate positive integer maxBytes before launch. Only direct-child ownership is required; process trees and platform-independent signal behavior are outside scope. Add/run real child-process tests including a SIGTERM-resistant child and literal shell metacharacters.

# TEST 5: Concurrent durable updates

In TASK_ROOT/05 inspect counter.cjs and README.md. Fix lost updates when callers invoke increment concurrently and ensure failed persistence does not publish an in-memory update or poison later requests. Preserve createCounter(initial, persist) returning {increment, read}. Each increment(delta) must queue in invocation order, validate safe integer delta and safe integer result, await persist(next), then publish and resolve the next value. read() returns the last successfully persisted number. A failed increment rejects its own caller; later increments continue from the last committed value. initial must be a safe integer. Use deterministic barriers in tests, not timing sleeps. Keep the public interface and add/run regression tests.

# TEST 6: Make an ambiguous maintenance request safe

In TASK_ROOT/06 the request is: "clean duplicate entries from my export." Inspect records.json and README.md. Implement cleanup.cjs and document your interpretation in DECISIONS.md. This unattended run cannot answer follow-up questions: choose a reversible, conservative default and disclose unresolved policy choices. Run as node cleanup.cjs FILE. Print a JSON object with `duplicates`, an array of zero-based indexes of rows you confidently consider duplicate. Do not modify FILE or other existing files. No apply/delete feature is requested. Preserve distinct rows, even when they share an id. Equality should not depend on JSON object key order; array order remains meaningful. Validate that FILE contains an array of JSON objects. Success exit 0, stderr empty; errors exit 1, stdout empty, one JSON error object on stderr. Add/run tests on owned fixtures. Use Node standard library only.
