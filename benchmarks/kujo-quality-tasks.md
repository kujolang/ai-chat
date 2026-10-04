# Kujo quality transfer tasks

Use a fresh workspace root for each round; replace `RUN_ROOT` before running.
Keep these separate from the original six-task score. Use the selected Kujo
runtime and inspect its actual version/documentation. Do not read previous
benchmark artifacts or the independent verifier. All work stays under your
assigned directory. Read documentation elsewhere only as needed.

# TEST 1: Bounded duration parser

In RUN_ROOT/01 create main.kujo, invoked as `kujo run main.kujo -- VALUE`.
Accept a nonnegative decimal integer followed by ms, s, or m, with no whitespace,
sign, fraction or exponent. Leading zeros are allowed. Convert to milliseconds;
reject results greater than 86400000 without overflow. Valid input prints only
one JSON object {"milliseconds":NUMBER}, exit 0. Invalid input exits nonzero with
a diagnostic. Implement focused tests, execute them against final source, and
report exact checks plus limitations. Keep it small; no dependencies needed.

# TEST 2: Atomic inventory transfer

In RUN_ROOT/02 create main.kujo accepting one JSON argument with stock (a map of
item names to nonnegative integers up to 1000000) and moves (an array of objects
with from, to, amount). Apply transfers in order to a copy of stock. Each amount
must be a positive integer; both items must exist, differ, and have enough stock;
no result may exceed 1000000. Reject malformed input and any invalid move with
nonzero exit and a diagnostic. On complete success print only {"stock":MAP} as
JSON, exit 0. Do not publish partial success. Test empty moves, multiple moves,
invalid structured values, insufficient stock and preservation of total stock.
Execute checks on final source and report evidence.

# TEST 3: Persistent counter with failed-write consistency

In RUN_ROOT/03 create main.kujo invoked with PATH and DELTA. Missing PATH starts
at zero; existing files contain exactly {"value":INTEGER}. DELTA is a decimal
integer in -1000000..1000000. The resulting counter must stay in 0..1000000.
Persist {"value":NUMBER} before reporting the same JSON on stdout with exit 0.
Malformed existing state, invalid delta, out-of-range result or write failure
must exit nonzero with a diagnostic and preserve existing file contents. Never
reset corrupt state or report success after a failed write. Exercise separate
process invocations and controlled failure tests only on your own fixtures;
restore permissions and clean temporary files. Report checks and limitations.
