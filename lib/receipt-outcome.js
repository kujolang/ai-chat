// Deterministic evidence excerpts, never model-generated summaries. Full results
// remain in the execution journal. These fields are untrusted tool data.
function receiptOutcome(result, rawArguments) {
	let args = rawArguments;
	if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = null; } }
	const input = {};
	for (const key of ["root_id", "path", "command", "args", "cwd", "query", "offset", "limit", "mode"]) {
		if (args && Object.hasOwn(args, key)) input[key] = args[key];
	}
	const evidence = {};
	if (Object.keys(input).length) evidence.input = boundedValue(input, 600);
	if (!result || typeof result !== "object") return evidence;
	const { saved_result_ref, ...source } = result;
	if (Buffer.byteLength(JSON.stringify(source)) <= 1200) {
		evidence.outcome = source;
		return evidence;
	}
	const outcome = { excerpt: true };
	for (const key of ["path", "command", "args", "cwd", "exit_code", "signal", "truncated", "next_offset", "next_column", "total_chars", "count", "error"]) {
		if (Object.hasOwn(source, key)) outcome[key] = boundedValue(source[key], 400);
	}
	for (const key of ["stdout", "stderr", "content", "text"]) {
		if (typeof source[key] === "string") outcome[key] = key === "stdout" || key === "stderr" ? boundedTranscript(source[key], 400) : boundedValue(source[key], 800);
	}
	if (Array.isArray(source.entries)) {
		outcome.entries = source.entries.slice(0, 12).map(entry => ({ name: entry?.name, type: entry?.type }));
		outcome.omitted_entries = Math.max(0, source.entries.length - 12);
	}
	if (Array.isArray(source.citations)) {
		outcome.citations = source.citations.slice(0, 1).map(citation => ({ path: citation?.path, text: boundedValue(citation?.text ?? "", 800) }));
		outcome.omitted_citations = Math.max(0, source.citations.length - 1);
	}
	evidence.outcome = boundedValue(outcome, 2400);
	return evidence;
}
// Build/test summaries are commonly at the end. Retain both ends explicitly;
// neither an excerpt nor a successful exit code claims the omitted text is known.
function boundedTranscript(value, bytes) {
	if (Buffer.byteLength(JSON.stringify(value)) <= bytes) return value;
	const head = boundedValue(value, Math.floor(bytes / 2));
	let tail = "", size = 0;
	const chars = Array.from(value.slice(-bytes));
	for (let i = chars.length - 1; i >= 0; i--) {
		const next = Buffer.byteLength(JSON.stringify(chars[i])) - 2;
		if (size + next > bytes / 2 - 80) break;
		tail = chars[i] + tail;
		size += next;
	}
	return { head: typeof head === "string" ? head : head.excerpt, tail, omitted: true };
}

function boundedValue(value, bytes) {
	const encoded = JSON.stringify(value);
	if (encoded === undefined) return null;
	if (Buffer.byteLength(encoded) <= bytes) return value;
	// Keep valid Unicode and explicitly identify excerpts. The journal reference
	// supplies the omitted suffix; an excerpt must never masquerade as full data.
	let excerpt = "";
	let size = 0;
	for (const char of typeof value === "string" ? value : encoded) {
		const next = Buffer.byteLength(JSON.stringify(char)) - 2;
		if (size + next > bytes - 80) break;
		excerpt += char;
		size += next;
	}
	return { excerpt, omitted: true };
}
module.exports = { receiptOutcome };
