# Engineering judgment transfer tasks

Use the assigned fresh directory only. Do not inspect earlier benchmark artifacts,
other tasks' answers, or verifier implementations. Focused runtime documentation
and local_kujo guide topics are allowed. Keep the implementation small. Execute
checks against final source, report evidence and limits, and leave source/tests.

# TEST 1: Exact decimal batch total

In RUN_ROOT/01 create main.kujo accepting one JSON array argument of decimal
strings. Each string must match nonnegative digits, a dot, and exactly two digits;
no sign, whitespace, exponent, NaN, or infinity. Leading zeros are allowed. Each
amount is at most 9999999999999.99. Sum exact integer cents, never floating-point
money, and reject a total above 9000000000000000 cents before losing precision or
overflowing. Empty arrays total zero. Success prints exactly {"cents":INTEGER}
on stdout and exits 0. Invalid input exits exactly 1, stdout empty, with one JSON
object {"error":NONEMPTY_STRING} on stderr. Include boundary/aggregate tests,
execute them, and show exact evidence. Invoke as kujo run main.kujo -- JSON.

# TEST 2: Atomic batch score store

In RUN_ROOT/02 create main.kujo invoked as kujo run main.kujo -- PATH JSON.
PATH stores exactly {"scores":OBJECT}; missing PATH starts with empty scores.
JSON is an array of {"name":STRING,"delta":INTEGER}, applied in order to a copy.
Names match [a-z][a-z0-9_]{0,15}; deltas are integers from -1000 to 1000. Missing
names start at 0. Every resulting score must stay within 0..1000000. Existing
state must satisfy the same name/score rules; malformed or corrupt state is an
error, never reset. On success persist atomically before printing exactly the
new {"scores":OBJECT}, exit 0. Any invalid operation or failed write must preserve
original bytes, exit exactly 1, stdout empty and one {"error":NONEMPTY_STRING}
on stderr. Validate the entire batch before publishing a state change. Tests
must include separate process invocations, a late invalid operation, corrupt
state, and a forced write failure only on owned fixtures. Restore permissions.

# TEST 3: Persistent entry service with failed-write consistency

In RUN_ROOT/03 create server.js using Node standard library only. Invoke
node server.js --file PATH --port 0; bind 127.0.0.1 and emit one startup JSON line
{"port":NUMBER}. Store {"entries":OBJECT}, initially empty when absent. Each value
is a string of at most 128 characters. Keys match [a-z][a-z0-9_]{0,31}.
GET /entries returns the current {"entries":OBJECT}. POST /entries accepts exactly
{"key":STRING,"value":STRING}, inserts/replaces it durably, returns the same
complete representation with status 200. Invalid JSON/shape/key/value returns
400. Other routes return 404. Existing corrupt state must prevent startup, never
be overwritten. A failed write returns 500 and must leave both GET-visible state
and disk unchanged; a later valid request must still work. Concurrent successful
updates must not lose entries. Use safe atomic persistence, clear error handling,
bounded input, deterministic tests, and cleanup. Test real child processes,
restart, and controlled write failure on owned fixtures; no changes to live data.
