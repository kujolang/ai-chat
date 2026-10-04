function taskDeadline(value) {
 if (value === undefined || value === null) return null;
 if (!Number.isSafeInteger(value) || value <= 0) throw new Error('task_deadline_ms must be a positive UTC epoch-millisecond integer.');
 return value;
}
function taskBudgetMessage(deadline, now = Date.now()) {
 if (!deadline) return null;
 const remaining = Math.max(0, deadline - now);
 return { role: 'system', content: `Caller task deadline: ${Math.ceil(remaining / 1000)} seconds remain. This is an advisory external deadline, not a new tool permission or timeout extension. Reserve at least the final 20% of your remaining budget for verification and delivery. For pure benchmarks, calibrate a small input first; estimate all requested trials before scaling. Reduce workload if trials plus verification will not fit. Do not start more work when the deadline has elapsed; report completed evidence and unfinished checks honestly. Never replay consequential commands automatically.` };
}
module.exports = { taskDeadline, taskBudgetMessage };
