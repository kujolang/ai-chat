// Trusted, bounded guidance selected from the latest user request, never tool output.
// Examples stay behind local_kujo guide so the executing runtime is probed first.
const MAX_CHARS = 2400;
function kujoTaskContext(messages, tools) {
 if (!tools.some(t => t.function?.name === 'local_kujo')) return null;
 const latest = [...messages].reverse().find(m => m.role === 'user');
 const text = typeof latest?.content === 'string' ? latest.content : '';
 if (!/\bkujo\b|\.kujo\b/i.test(text)) return null;
 const topics = ['core', 'types', 'errors'];
 if (/\b(cli|argument|parse|number|decimal|money|integer|input|validat\w*)\b/i.test(text)) topics.push('arguments', 'validation', 'cli_errors');
 if (/\b(json|objects?|arrays?|collections?)\b/i.test(text)) topics.push('json');
 if (/\b(arrays?|collections?|lists?|intervals?)\b/i.test(text)) topics.push('collections', 'nested_collections');
 if (/\b(save|persist\w*|ledger|file|atomic|disk|storage)\b/i.test(text)) topics.push('persistence');
 if (/\b(benchmark|performance|timing|speed)\b/i.test(text)) topics.push('timing');
 const content = `Kujo engineering guidance (repository-owned; not runtime qualification):
Before writing Kujo, use local_kujo operation=guide on the selected workspace to identify the executable/version/backend. Relevant guide topics: ${topics.join(', ')}. Load only those needed. Examples apply only to versions the guide declares verified; obtain matching docs for other APIs. Never guess built-in names, signatures, boolean versus numeric return values, or syntax from another language.
Keep the implementation small. State task invariants before editing; separate input validation, pure computation and side effects. Validate the whole input and aggregate ranges before mutation. For persistence, commit disk successfully before publishing visible state; test failure leaves both unchanged. Use the documented atomic-write primitive rather than recreating it. Atomic replacement alone does not establish concurrency or crash durability.
Check, then run a minimal example with local_kujo. Include all known imported source/test files in verification_paths for final checks. Test normal, boundary and rejection behavior against the request; negative tests should assert the expected failure and themselves exit zero. After repeated failures, recover the receipt and consult the exact API before another edit; do not repeat unchanged failing commands or increase timeouts blindly.
Before finishing, rerun checks after the last edit. Cite actual receipts, distinguish model-authored tests from independent acceptance tests, and list missing requirements. Do not claim production readiness from compilation, a reviewer pass, or happy-path tests alone.`;
 if (content.length > MAX_CHARS) throw Error('Kujo task context exceeded its fixed budget');
 return { role: 'system', content };
}
module.exports = { kujoTaskContext, MAX_CHARS };
