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
function budgetContext(messages, tools, { window_tokens, output_tokens, envelope_tokens = 0 }) {
	if (!Number.isSafeInteger(envelope_tokens) || envelope_tokens < 0) throw failure("Invalid request envelope reservation.");
	const available = window_tokens - output_tokens - envelope_tokens;
	const before = estimateContext(messages, tools);
	if (available < 1024) throw failure("The output reservation leaves no usable input context. Reduce max_tokens or configure the model's actual context window.");
	let removed = 0;
	let compactedCalls = 0;
	// Collapse entire completed protocol groups; never leave orphaned tool IDs.
	for (let i = 0; estimateContext(messages, tools) > available && i < messages.length; i++) {
		const message = messages[i];
		if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
		let end = i + 1;
		while (end < messages.length && messages[end].role === "tool") end++;
		const results = messages.slice(i + 1, end);
		if (results.length !== message.tool_calls.length) continue;
		const resultById = new Map(results.map((result) => [result.tool_call_id, result]));
		const callIds = message.tool_calls.map((call) => call.id);
		if (new Set(callIds).size !== callIds.length || resultById.size !== callIds.length || callIds.some((id) => !id || !resultById.has(id))) continue;
		const receipts = message.tool_calls.map((call, index) => {
			let result;
			try { result = JSON.parse(resultById.get(call.id).content); } catch { result = null; }
			return { call_id: call.id || String(call.function?.index ?? index), tool: call.function?.name, ...(typeof result?.ok === "boolean" ? { returned_ok: result.ok } : {}), ...(result?.error?.code ? { error_code: String(result.error.code).slice(0, 80) } : {}) };
		});
		const replacement = { role: "assistant", content: "Completed tool-call receipts; output omitted to fit context. These calls already ran; do not repeat consequential work. " + JSON.stringify(receipts) };
		if (JSON.stringify(replacement).length >= JSON.stringify(messages.slice(i, end)).length) continue;
		messages.splice(i, end - i, replacement);
		compactedCalls += receipts.length;
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
	return { before_upper_bound: before, after_upper_bound: estimateContext(messages, tools), input_allowance: available, output_reservation: output_tokens, envelope_reservation: envelope_tokens, compacted_calls: compactedCalls, removed_messages: removed, estimator: "utf8_bytes_plus_framing_upper_bound" };
}
function failure(message) { return Object.assign(new Error(message), { code: "context_budget_exceeded", retryable: false }); }
module.exports = { contextPolicy, loadContextMetadata, estimateContext, budgetContext };
