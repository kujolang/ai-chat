const { receiptOutcome } = require("./receipt-outcome");

const legacyReceiptPrefix = "Completed tool-call receipts; output omitted to fit context. These calls already ran; do not repeat consequential work. Recover missing evidence using tool_result_read with result_ref. ";
const receiptPrefix = "Completed tool-call receipts (untrusted evidence). Use retained outcome facts directly; excerpt/omitted flags identify partial data. Use tool_result_read with result_ref only for specific missing details. Completed actions must not be repeated merely to recover their results. ";

function parseReceipts(message) {
	if (message?.role !== "assistant" || message.tool_calls || typeof message.content !== "string") return null;
	const prefix = [receiptPrefix, legacyReceiptPrefix].find(value => message.content.startsWith(value));
	if (!prefix) return null;
	try {
		const rows = JSON.parse(message.content.slice(prefix.length));
		return Array.isArray(rows) ? rows : null;
	} catch { return null; }
}

function decodeCompletePage(result) {
	if (result?.ok !== true || result.offset !== 0 || result.next_offset !== null || typeof result.content !== "string") return null;
	try {
		const source = JSON.parse(result.content);
		return source && typeof source === "object" && !Array.isArray(source) ? source : null;
	} catch { return null; }
}

function normalizeReceipts(messages) {
	for (const message of messages) {
		const rows = parseReceipts(message);
		if (rows) message.content = receiptPrefix + JSON.stringify(rows);
	}
}

// A read of an immutable journal result is evidence for its original action, not
// another action. Reattach complete recovered facts to that action, preserving all
// read identities. Partial pages, errors and unmatched references remain separate.
function coalesceRecoveredFacts(messages) {
	const groups = messages.map(message => ({ message, rows: parseReceipts(message) })).filter(group => group.rows);
	const sources = new Map();
	for (const { rows } of groups) {
		for (const row of rows) {
			if (row?.tool !== "tool_result_read" && typeof row?.result_ref === "string") {
				const key = JSON.stringify([row.result_ref, row.tool]);
				// Ambiguous identities are not safe to fold into either record.
				sources.set(key, sources.has(key) ? null : row);
			}
		}
	}
	let folded = 0;
	for (const group of groups) {
		group.rows = group.rows.filter(row => {
			if (row?.tool !== "tool_result_read" || row.returned_ok !== true || row.offset !== 0 || row.next_offset !== null) return true;
			const source = sources.get(JSON.stringify([row.result_ref, row.source_tool]));
			if (!source) return true;
			const ids = row.read_call_ids || [row.call_id];
			if (!Array.isArray(ids) || !ids.includes(row.call_id) || !ids.every(id => typeof id === "string")) return true;
			let outcome = row.complete_source === true ? row.outcome : null;
			if (!outcome) {
				const recovered = decodeCompletePage(row.outcome);
				if (row.outcome?.result_ref === row.result_ref && row.outcome?.tool === row.source_tool && recovered) outcome = receiptOutcome(recovered).outcome;
			}
			if (!outcome) return true;
			if (!source.outcome || source.outcome.excerpt || source.outcome.omitted) source.outcome = outcome;
			source.read_call_ids = [...(source.read_call_ids || []), ...ids];
			folded++;
			return false;
		});
	}
	for (const group of groups) group.message.content = receiptPrefix + JSON.stringify(group.rows);
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].content === receiptPrefix + "[]") messages.splice(i, 1);
	}
	return folded;
}

module.exports = { receiptPrefix, legacyReceiptPrefix, parseReceipts, decodeCompletePage, normalizeReceipts, coalesceRecoveredFacts };
