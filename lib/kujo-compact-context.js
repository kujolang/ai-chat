const {allocationContext}=require('./kujo-allocation-reference');
const MAX_COMPACT_CHARS = 2200;
function compactKujoContext(guide, { verificationEnabled = false, allocationGuidance = false, resultRef = '' } = {}) {
 const version = /^kujo\s+(\d+\.\d+\.\d+)\s*$/i.exec(guide?.runtime?.version || '')?.[1];
 const backend = ['default', 'interpreter'].includes(guide?.runtime?.backend) ? guide.runtime.backend : 'unknown';
 const header = `Kujo runtime snapshot: ${version || 'unverified'}, backend ${backend}. This qualifies the reference examples, not arbitrary programs.`;
 if (!guide?.ok || version !== '1.7.0') return { role: 'system', content: header + '\nA compact reference is not qualified for this runtime. Use local_kujo guide and matching documentation; do not infer APIs from other languages.' };
 const lines = [header,
 'Verified 1.7.0 patterns: func f(n) { return n * n }; let x := 1; mut i := 0; while i < 3 { i += 1 }. No guessed built-ins.',
 'JSON: parse_json(text), to_json(value). Type predicates is_array, is_dict, is_int, is_string return booleans; is_int(true) is false. has_key(object, "key") returns numeric 0/1: compare to 1.',
 'Arrays: mut xs := [1, 2]; xs = push(xs, 3). Numeric sorting: sort([3, 1, 2]). Do not use array + array. Nested index assignment rows[0][1] = x is unsupported; replace the whole row: let row := rows[0]; rows[0] = [row[0], x].',
 'CLI: args() contains script arguments. local_kujo adds -- itself; use args:["[]"], never add a separator unless it is an intended literal argument. print emits stdout; eprint(to_json({"error":"invalid"})); exit(1) emits an error. Catch parse failures with try { ... } except e { ... }.',
 'Persistence: read_file(path), write_file_atomic(path, text, true). Validate before mutation; publish visible state only after the write succeeds. Test failure on owned fixtures. This does not certify concurrent writes or crash durability.',
 verificationEnabled
  ? 'Verification: local_kujo operation=verify runs 1–32 explicit CLI cases in one call. Cases declare id, args, exit_code and stdout_json (JSON text), exact stdout/stderr, or stderr_error:true. Unspecified streams must be empty. Expected rejections count as passing checks. Use the actual entry point, include imports/tests in verification_paths, and recover failed case result_ref with tool_result_read. No automatic retries.'
  : 'Check and run the actual entry point; negative-test harnesses should assert expected rejection and exit zero themselves.',
 'For large CLI inputs, use a small local_shell harness that spawns the actual entry point with generated args. Do not copy production algorithms into tests; helper-only checks do not verify the CLI.',
 'Long examples remain available via local_kujo guide. Consult them only for missing details; runtime discovery above already completed.'
 ];
 if (allocationGuidance) lines.push(allocationContext(guide.runtime));
 if (resultRef && /^[A-Za-z0-9_:-]{1,128}$/.test(resultRef)) lines.push(`Runtime receipt: ${resultRef}.`);
 const content = lines.join('\n');
 if (content.length > MAX_COMPACT_CHARS) throw Error('Compact Kujo reference exceeds its budget');
 return { role:'system', content };
}
module.exports = { compactKujoContext, MAX_COMPACT_CHARS };
