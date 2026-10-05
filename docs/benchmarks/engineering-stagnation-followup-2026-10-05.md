# Bounded unchanged-read follow-up

While baseline task 6 of the engineering judgment comparison was running, the
controller observed over 100 successful reads alternating between the same
README.md and records.json, with no write or shell execution. Saved complete tool
results included the actual contents, not omitted-output receipts. AI Chat's
existing engineering diagnostics considered only failed local_shell/local_kujo
calls, so they did not intervene. This supports a missing progress diagnostic;
it does not establish why the provider/model kept repeating the requests.

The patch in `lib/engineering-diagnostics.js` hashes the last six complete read
results. If all six repeat at most two workspace/path/range/content signatures,
with at least three occurrences each, it emits one static advisory. It never
promotes file contents into trusted instructions, strips results, blocks tools,
changes permissions or repeats work. Any intervening activity, changed content,
incomplete page or review phase prevents this trigger. The existing six-notice
limit and durable diagnostic state apply.

The original baseline/guided/frontier servers retain their already-loaded code
throughout the three-arm comparison. After those arms finish, run the original
unguided cleanup task once more in a fresh directory against the patched benchmark
server. Keep the same model, allowance and 15-minute deadline. Count delivery,
independent checks, calls, reported tokens, and whether the notice actually fired.
No further retries or prompt edits to force a pass. A successful new run without
an emitted notice is not evidence that the notice improved model behavior.
Deterministic fixtures separately prove detection, result preservation, reset
conditions, phase gating, untrusted-text exclusion and resume deduplication.
