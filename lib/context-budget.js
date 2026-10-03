const { receiptOutcome } = require("./receipt-outcome");
const { receiptPrefix, fileReadFingerprint, coalesceFileReads, decodeCompletePage, normalizeReceipts, coalesceRecoveredFacts } = require("./receipt-context");
// Conservative byte-based input allowance, including structured protocol and
// schemas. This is deliberately not presented as a provider tokenizer count.
const defaultWindow = 65536;
function validWindow(value) { return Number.isSafeInteger(value) && value >= 1024 && value <= 4000000; }
function contextPolicy(provider, model, configured = {}, metadata = {}) {
	const key = `${provider}:${model}`;
	const record = metadata[key];
	const explicit = configured[key] ?? configured[provider];
	const value = explicit ?? record?.window_tokens ?? configured.default ?? defaultWindow;
	const window = Number(value);
	if (!validWindow(window)) throw failure("Invalid configured model context window.");
	return { window_tokens: window, source: configured[key] !== undefined ? key : configured[provider] !== undefined ? provider : record ? record.source : configured.default !== undefined ? "configured_default" : "conservative_default" };
}

// Read only bounded, dated numeric metadata. Descriptions and instructions in a
// catalog never enter the model prompt. A stale or malformed cache is optional.
function loadContextMetadata(filePath, { codex = false, now = Date.now(), warn = () => {} } = {}) {
	if (!filePath) return {};
	try {
		const fs = require("node:fs");
		if (fs.statSync(filePath).size > 8 * 1024 * 1024) throw Error("oversized");
		const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (Array.isArray(data.models) && !data.models.some(model => model?.context_window !== undefined)) return {};
		const fetched = Date.parse(data.fetched_at);
		if (!Number.isFinite(fetched) || fetched > now + 300000 || now - fetched > 30 * 86400000 || !Array.isArray(data.models)) throw Error("invalid or stale");
		const entries = {};
		for (const model of data.models.slice(0, 4096)) {
			if (!model || typeof model !== "object") continue;
			const provider = codex ? "codex" : model.provider;
			const name = codex ? model.slug : model.model;
			if (typeof provider !== "string" || !/^[a-z0-9_-]{1,64}$/.test(provider) || typeof name !== "string" || !name || name.length > 160) continue;
			if (!validWindow(model.context_window)) continue;
			const percent = codex && Number.isFinite(model.effective_context_window_percent) ? model.effective_context_window_percent : 100;
			if (percent <= 0 || percent > 100) continue;
			const window = Math.floor(model.context_window * percent / 100);
			if (!validWindow(window)) continue;
			entries[`${provider}:${name}`] = { window_tokens: window, source: `${codex ? "codex_model_cache" : "model_metadata"}:${new Date(fetched).toISOString()}` };
		}
		return entries;
	} catch { warn("[context] Optional context metadata is unavailable, invalid, oversized or older than 30 days; using configured limits or the conservative default."); return {}; }
}
function estimateContext(messages, tools) {
	// Per-message framing and a fixed envelope reserve are counted separately.
	return Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(tools || [])) + messages.length * 64 + 1024;
}
const freshEvidenceTools = new Set(["tool_result_read", "local_file_read", "skill_read", "skill_file_read"]);

function budgetContext(messages, tools, { window_tokens, output_tokens, envelope_tokens = 0 }) {
	if (!Number.isSafeInteger(envelope_tokens) || envelope_tokens < 0) throw failure("Invalid request envelope reservation.");
	const available = window_tokens - output_tokens - envelope_tokens;
	const before = estimateContext(messages, tools);
	if (available < 1024) throw failure("The output reservation leaves no usable input context. Reduce max_tokens or configure the model's actual context window.");
	let removed = 0;
	let compactedCalls = 0;
	normalizeReceipts(messages);
	// Retire obsolete standalone reasoning before throwing away observed facts.
	// The current assistant continuation and every tool-call group stay intact.
	const latestAssistant = messages.findLastIndex(message => message.role === "assistant");
	for (let i = latestAssistant - 1; i >= 0 && estimateContext(messages, tools) > available; i--) {
		const message = messages[i];
		if (message.role === "assistant" && !message.tool_calls && !String(message.content || "").trim()
			&& ["thinking", "reasoning", "reasoning_content"].some(key => typeof message[key] === "string" && message[key].length)) {
			messages.splice(i, 1);
			removed++;
		}
	}

	// Retrieval results are ranked. Keep complete source excerpts (including code)
	// rather than cutting strings or discarding every citation. Journal receipts
	// retain the full result; only this provider-bound copy is reduced.
	for (const message of messages) {
		if (estimateContext(messages, tools) <= available) break;
		if (message.role !== "tool") continue;
		let result;
		try { result = JSON.parse(message.content); } catch { continue; }
		if (!result?.ok || !Array.isArray(result.citations) || !result.citations.every(citation => typeof citation?.text === "string" && typeof citation?.path === "string")) continue;
		let changed = false;
		while (result.citations.length > 1 && estimateContext(messages, tools) > available) {
			result.citations.pop();
			result.count = result.citations.length;
			result.omitted_citations = (Number(result.omitted_citations) || 0) + 1;
			result.compacted = true;
			message.content = JSON.stringify(result);
			changed = true;
		}
		if (changed) compactedCalls++;
	}
	// Collapse entire completed protocol groups; never leave orphaned tool IDs.
	for (let i = 0; estimateContext(messages, tools) > available && i < messages.length; i++) {
		const message = messages[i];
		if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
		// A recovered page must reach the model before it can be compacted again.
		const freshReadBatch = message.tool_calls.some(call => freshEvidenceTools.has(call.function?.name)) && !messages.slice(i + 1).some(m => Array.isArray(m.tool_calls));
		let end = i + 1;
		while (end < messages.length && messages[end].role === "tool") end++;
		const results = messages.slice(i + 1, end);
		if (results.length !== message.tool_calls.length) continue;
		const native = message.tool_calls.every((call, index) => !call.id && Number.isInteger(call.function?.index)
			&& !results[index].tool_call_id && results[index].tool_name === call.function?.name);
		const callIds = message.tool_calls.map((call) => native ? String(call.function.index) : call.id);
		const resultById = new Map(results.map((result, index) => [native ? callIds[index] : result.tool_call_id, result]));
		if (new Set(callIds).size !== callIds.length || resultById.size !== callIds.length || callIds.some((id) => !id || !resultById.has(id))) continue;
		if (freshReadBatch) {
			// Keep every fresh evidence page and the provider tool-call protocol,
			// but do not grant unrelated results in the batch an unlimited budget.
			for (const [index, call] of message.tool_calls.entries()) {
				if (estimateContext(messages, tools) <= available) break;
				if (freshEvidenceTools.has(call.function?.name)) continue;
				const toolMessage = resultById.get(callIds[index]);
				let result;
				try { result = JSON.parse(toolMessage.content); } catch { continue; }
				if (!result || typeof result !== "object" || result.compacted === true) continue;
				const compact = { compacted: true, message: "Bounded outcome excerpt; use saved_result_ref for missing evidence.",
					...(typeof result.ok === "boolean" ? {ok: result.ok} : {}),
					...(result.saved_result_ref ? {saved_result_ref: result.saved_result_ref} : {}),
					...receiptOutcome(result, call.function?.arguments) };
				const replacement = JSON.stringify(compact);
				if (replacement.length < toolMessage.content.length) { toolMessage.content = replacement; compactedCalls++; }
			}
			continue;
		}
		const receipts = message.tool_calls.map((call, index) => {
			let result;
			try { result = JSON.parse(resultById.get(callIds[index]).content); } catch { result = null; }
			const fingerprint = fileReadFingerprint(call.function?.name, result, call.function?.arguments);
			const recovered = call.function?.name === "tool_result_read" ? decodeCompletePage(result) : null;
			return { ...(fingerprint ? { read_fingerprint: fingerprint } : {}), call_id: call.id || result?.saved_result_ref || String(call.function?.index ?? index), tool: call.function?.name, ...(typeof result?.ok === "boolean" ? { returned_ok: result.ok } : {}), ...(call.function?.name === "tool_result_read" && result?.result_ref
				? { result_ref: result.result_ref, source_tool: result.tool, offset: result.offset, next_offset: result.next_offset }
				: result?.saved_result_ref ? { result_ref: result.saved_result_ref } : {}), ...(result?.error?.code ? { error_code: String(result.error.code).slice(0, 80) } : {}), ...(recovered ? { complete_source: true } : {}), ...receiptOutcome(recovered || result, call.function?.arguments) };
		});
		const replacement = { role: "assistant", content: receiptPrefix + JSON.stringify(receipts) };
		if (JSON.stringify(replacement).length >= JSON.stringify(messages.slice(i, end)).length) continue;
		messages.splice(i, end - i, replacement);
		compactedCalls += receipts.length;
	}
	// Consecutive receipt groups need one instruction envelope, not one per
	// provider round. Preserve every receipt and its order; never discard evidence.
	for (let i = 1; estimateContext(messages, tools) > available && i < messages.length;) {
		const previous = messages[i - 1], current = messages[i];
		if ([previous, current].every(message => message.role === "assistant" && !message.tool_calls && typeof message.content === "string" && message.content.startsWith(receiptPrefix))) {
			try {
				const left = JSON.parse(previous.content.slice(receiptPrefix.length));
				const right = JSON.parse(current.content.slice(receiptPrefix.length));
				if (Array.isArray(left) && Array.isArray(right)) {
					previous.content = receiptPrefix + JSON.stringify([...left, ...right]);
					messages.splice(i, 1);
					continue;
				}
			} catch { /* Not a generated receipt envelope; leave it unchanged. */ }
		}
		i++;
	}
	// A saved-result page is immutable within this execution. Multiple reads of
	// the exact same page need one outcome, while retaining every retrieval ID.
	// Never fold shell, write, live read or error receipts into another action.
	for (const message of messages) {
		if (message.role !== "assistant" || message.tool_calls || !String(message.content || "").startsWith(receiptPrefix)) continue;
		let receipts;
		try { receipts = JSON.parse(message.content.slice(receiptPrefix.length)); } catch { continue; }
		if (!Array.isArray(receipts)) continue;
		const pages = new Map(), retained = [];
		for (const receipt of receipts) {
			const isPage = receipt?.tool === "tool_result_read" && typeof receipt.call_id === "string"
				&& (receipt.read_call_ids === undefined || (Array.isArray(receipt.read_call_ids) && receipt.read_call_ids.includes(receipt.call_id) && receipt.read_call_ids.every(id => typeof id === "string")))
				&& receipt.returned_ok === true && typeof receipt.result_ref === "string"
				&& typeof receipt.source_tool === "string" && Number.isSafeInteger(receipt.offset)
				&& (receipt.next_offset === null || Number.isSafeInteger(receipt.next_offset));
			const key = isPage ? JSON.stringify([receipt.result_ref, receipt.source_tool, receipt.offset, receipt.next_offset]) : null;
			const original = key === null ? null : pages.get(key);
			if (original) {
				original.read_call_ids = [...(original.read_call_ids || [original.call_id]), ...(receipt.read_call_ids || [receipt.call_id])];
				if (!original.outcome && receipt.outcome) original.outcome = receipt.outcome;
			} else {
				retained.push(receipt);
				if (key !== null) pages.set(key, receipt);
			}
		}
		message.content = receiptPrefix + JSON.stringify(retained);
	}
	const recoveredFacts = coalesceRecoveredFacts(messages);
	const foldedFileReads = coalesceFileReads(messages);
	// Detailed outcomes are useful but optional. Under severe pressure remove
	// older read excerpts and duplicated inputs before recent action evidence.
	// This fallback must still fit requests that the identity-only format could fit.
	if (estimateContext(messages, tools) > available) {
		const details = [];
		for (const message of messages) {
			if (message.role !== "assistant" || message.tool_calls || !String(message.content || "").startsWith(receiptPrefix)) continue;
			let receipts;
			try { receipts = JSON.parse(message.content.slice(receiptPrefix.length)); } catch { continue; }
			if (!Array.isArray(receipts)) continue;
			for (const receipt of receipts) {
				for (const key of ["outcome", "input"]) {
					if (receipt && Object.hasOwn(receipt, key)) details.push({ message, receipts, receipt, key, rank: key === "input" ? 0 : receipt.tool === "local_file_read" || receipt.tool === "local_file_list" || receipt.tool === "skill_read" || receipt.tool === "skill_file_read" ? 1 : 2, order: details.length });
				}
			}
		}
		details.sort((a, b) => a.rank - b.rank || a.order - b.order);
		for (const detail of details) {
			if (estimateContext(messages, tools) <= available) break;
			delete detail.receipt[detail.key];
			detail.message.content = receiptPrefix + JSON.stringify(detail.receipts);
		}
	}
	// Keep all system instructions, the initial user request and newest user
	// request. Durable explicit constraints are a separate protected system block.
	while (estimateContext(messages, tools) > available) {
		const firstUser = messages.findIndex((m) => m.role === "user");
		const lastUser = messages.findLastIndex((m) => m.role === "user");
		const index = messages.findIndex((m, i) => m.role !== "system" && i !== firstUser && i !== lastUser && m.role !== "tool" && !m.tool_calls);
		if (index < 0) throw failure("Fixed instructions, selected schemas and protected user requests exceed this model's input budget.");
		// Execution receipts are safer than losing the identity of completed work.
		if (String(messages[index].content || "").startsWith("Completed tool-call receipts")) {
			const other = messages.findIndex((m, i) => i > index && m.role !== "system" && i !== firstUser && i !== lastUser && m.role !== "tool" && !m.tool_calls && !String(m.content || "").startsWith("Completed tool-call receipts"));
			if (other < 0) throw failure("Execution receipts cannot fit safely in the remaining model context.");
			messages.splice(other, 1);
		} else messages.splice(index, 1);
		removed++;
	}
	return { before_upper_bound: before, after_upper_bound: estimateContext(messages, tools), input_allowance: available, output_reservation: output_tokens, envelope_reservation: envelope_tokens, compacted_calls: compactedCalls, recovered_facts: recoveredFacts, folded_file_reads: foldedFileReads, removed_messages: removed, estimator: "utf8_bytes_plus_framing_upper_bound" };
}
function failure(message) { return Object.assign(new Error(message), { code: "context_budget_exceeded", retryable: false }); }
module.exports = { contextPolicy, loadContextMetadata, estimateContext, budgetContext };
