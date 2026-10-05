#!/usr/bin/env node
// Independent process oracle. Never reads or edits the candidate's source.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function cases() {
 const rows = [
  { input: [], expected: [] },
  { input: [[5, 8], [1, 3], [3, 5]], expected: [[1, 8]] },
  { input: [[0, 1000000], [2, 3], [0, 1000000]], expected: [[0, 1000000]] },
  { input: [[4, 4], [2, 2]], expected: [[2, 2], [4, 4]] }
 ];
 // Deterministic generated coverage; identical seed across comparisons.
 let seed = 971;
 for (let i = 0; i < 20; i++) {
  const input = Array.from({ length: i }, () => { seed = (seed * 48271) % 2147483647; const start = seed % 100; return [start, start + seed % 7]; });
  const expected = [];
  for (const pair of input.map(x => [...x]).sort((a,b) => a[0]-b[0] || a[1]-b[1])) {
   const last = expected.at(-1);
   if (last && pair[0] <= last[1]) last[1] = Math.max(last[1], pair[1]); else expected.push(pair);
  }
  rows.push({ input, expected });
 }
 for (const input of [null, {}, [1], [[1]], [[1, 2, 3]], [[true, 2]], [[0, false]], [[-1, 0]], [[0, 1000001]], [[2, 1]], [[0.5, 1]], [['0', 1]], [[0, null]], [[0, 1], [3, 2]]]) rows.push({ input, invalid: true });
 rows.push({ raw: '{broken', invalid: true });
 return rows;
}
function evaluate(invoke) {
 const results = cases().map((row, i) => {
  try {
   const r = invoke(row.raw ?? JSON.stringify(row.input));
   if (r.error || r.signal) throw Error('Process did not complete normally');
   if (row.invalid) {
    if (r.status !== 1 || r.stdout.trim()) throw Error('Invalid input must exit 1 without stdout');
    const e = JSON.parse(r.stderr); if (typeof e.error !== 'string' || !e.error.trim() || Object.keys(e).length !== 1) throw Error('Expected one error field');
   } else {
    if (r.status !== 0 || r.stderr.trim()) throw Error('Valid input must exit 0 without stderr');
    if (JSON.stringify(JSON.parse(r.stdout)) !== JSON.stringify(row.expected)) throw Error('Wrong merged intervals');
   }
   return { case: i + 1, passed: true };
  } catch (e) { return { case: i + 1, passed: false, error: e.message }; }
 });
 return { checks: results.length, passed: results.filter(r => r.passed).length, results };
}
if (require.main === module) {
 const [file, binary] = process.argv.slice(2);
 if (!file || !binary) throw Error('Usage: node scripts/verify-kujo-intervals.js FILE KUJO_BINARY');
 const report = evaluate(input => spawnSync(binary, ['run', path.resolve(file), '--', input], { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 }));
 console.log(JSON.stringify(report, null, 2)); process.exitCode = report.passed === report.checks ? 0 : 1;
}
module.exports = { cases, evaluate };
