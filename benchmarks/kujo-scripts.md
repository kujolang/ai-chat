# TEST 1: Integer statistics

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an integer array. Return {"count":N,"sum":S,"min":MIN,"max":MAX}; min and max are null for an empty array.

# TEST 2: Stable deduplication

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an integer array. Return each distinct value once, preserving its first occurrence order.

# TEST 3: Sorted frequency table

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an integer array. Return [value,count] pairs in ascending numeric value order.

# TEST 4: Prefix sums

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an integer array. Return cumulative sums, one per input element. Empty input returns [].

# TEST 5: Signed array rotation

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input has exactly keys values (an integer array) and steps (an integer -1000..1000). Rotate values right by steps; negative steps rotate left. Empty values returns [].

# TEST 6: Run length encoding

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an integer array. Return [value,count] pairs for adjacent equal-value runs, preserving run order. Separated repeats remain separate runs.

# TEST 7: Merge closed intervals

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an array of at most 100 [start,end] pairs. Both endpoints are integers -1000..1000 with start <= end. Return intervals sorted by start, merging overlapping or touching endpoints (e.g. [1,2] and [2,3]); do not merge [1,2] and [3,4].

# TEST 8: Vector dot product

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input has exactly keys left and right, each an integer array of equal length. Return their scalar dot product. Two empty arrays return 0.

# TEST 9: Balanced parentheses

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input is an ASCII string of at most 100 characters containing only ( and ). Return {"balanced":BOOLEAN,"max_depth":N}. max_depth is the maximum running opening-minus-closing count, with a floor of zero, even for unbalanced strings. balanced is true only if no prefix goes negative and final count is zero.

# TEST 10: Bounded sequential ledger

## Prompt

Write one complete standalone Kujo 1.7.0 script. Return ONLY one fenced kujo code block. No tools, packages, file access, networking or subprocesses. This is a single-draft code-generation benchmark; there is no repair turn.
The script is invoked as kujo run main.kujo -- JSON, with exactly one JSON argument. Success exits 0, stdout contains only the JSON result, and stderr is empty. Rejections exit exactly 1, leave stdout empty, and emit one JSON object containing only a nonempty error string to stderr. Reject malformed JSON, missing/extra arguments, wrong shapes/types and out-of-range values. Integer arrays have at most 100 entries, each an actual integer in -1000..1000; booleans are not integers. Validate before emitting output.
Verified language guide: func f(x) { return x }; let x := 1; mut n := 0; n += 1; reassignment uses =. Loops: for v in values { ... }; while condition { ... }. Arrays/dicts use []/{} and indexing. Append with values = push(values,item). Nested index assignment is unsupported; replace the whole row. Builtins: args(), len(), keys(), has_key(obj,key) returning 0/1, is_int(), is_array(), is_dict(), is_string(), parse_json(), to_json(), to_string(), sort(), print(), eprint(), exit(). true/false/null, &&, ||, !, %, comparisons work. Catch parse failures using try { ... } except e { ... }. args() excludes the script name. String indexing returns one-character strings for ASCII. Count object keys with len(keys(obj)).

Task: Input has exactly keys initial (integer 0..1000) and deltas (an integer array). Apply deltas in order; reject if ANY intermediate balance leaves 0..1000, even if final balance would be valid. Return {"balance":FINAL,"history":ARRAY_OF_POST_DELTA_BALANCES}.
