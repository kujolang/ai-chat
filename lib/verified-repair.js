// Controller-owned development feedback. Holdout outcomes never enter repair input.
// Callers own command authorization, candidate isolation and per-operation deadlines.
async function verifiedRepair({ development, holdout, repair, snapshot, assertIntegrity,
 now = Date.now, deadline, maxRepairs = 2, onProgress = async () => {} }) {
 if (!Number.isFinite(deadline) || !Number.isInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > 2) throw Error('Use a finite deadline and at most two repair passes');
 const attempts = [];
 let stopped = 'development_passed';
 for (let pass = 0; ; pass++) {
  assertIntegrity();
  if (now() >= deadline) { stopped = 'deadline'; break; }
  const checks = await development({deadline});
  assertIntegrity();
  const source = await snapshot(pass);
  const grade = await holdout({deadline});
  assertIntegrity();
  const attempt = {pass, development: checks, holdout: grade, source};
  attempts.push(attempt);
  await onProgress({attempts, stopped:'running', repaired:attempts.filter(a=>a.repair).length, verified:false});
  if (!checks.completed) { stopped = 'verification_incomplete'; break; }
  if (!checks.failures.length) break;
  if (pass >= maxRepairs || now() >= deadline) { stopped = pass >= maxRepairs ? 'repair_limit' : 'deadline'; break; }
  // Pass only development counterexamples, never grader internals or holdout results.
  const feedback = checks.failures.slice(0, 6).map(({id,input,expected,actual}) => ({id,input,expected,actual}));
  attempt.repair = await repair({feedback, pass: pass + 1, deadline});
  await onProgress({attempts, stopped:'running', repaired:attempts.filter(a=>a.repair).length, verified:false});
  assertIntegrity();
  if (!attempt.repair.completed) { stopped = 'repair_incomplete'; break; }
 }
 return {attempts, stopped, repaired: attempts.filter(a => a.repair).length,
  verified: stopped === 'development_passed' && attempts.length > 0 && attempts.at(-1).holdout.completed && !attempts.at(-1).holdout.failures.length};
}
module.exports = {verifiedRepair};
