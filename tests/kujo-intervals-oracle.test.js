const { test } = require('node:test'); const assert = require('node:assert/strict');
const { cases, evaluate } = require('../scripts/verify-kujo-intervals');
function reference(text) {
 try {
  const input = JSON.parse(text);
  if (!Array.isArray(input) || input.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isInteger(n) || n < 0 || n > 1000000) || p[0] > p[1])) throw Error('invalid');
  // Independent reference using connected-component expansion, not the oracle's sweep.
  let groups = input.map(p => [...p]); let changed = true;
  while (changed) { changed = false; outer: for (let i=0;i<groups.length;i++) for(let j=i+1;j<groups.length;j++) {
   if (groups[i][0] <= groups[j][1] && groups[j][0] <= groups[i][1]) { groups[i]=[Math.min(groups[i][0],groups[j][0]),Math.max(groups[i][1],groups[j][1])];groups.splice(j,1);changed=true;break outer; }
  } }
  return { status: 0, stdout: JSON.stringify(groups.sort((a,b)=>a[0]-b[0])), stderr: '' };
 } catch { return { status: 1, stdout: '', stderr: '{"error":"invalid"}' }; }
}
test('interval oracle accepts an independent implementation and rejects defective behavior', () => {
 const good = evaluate(reference); assert.equal(good.passed, cases().length);
 for (const mutant of [() => ({status:0,stdout:'[]',stderr:''}), () => ({status:1,stdout:'',stderr:'bad'}), () => ({status:null,signal:'SIGTERM',stdout:'',stderr:''}), text => reference(text.replace(/true/g,'1'))]) {
  const result = evaluate(mutant); assert.ok(result.passed < result.checks);
 }
});
