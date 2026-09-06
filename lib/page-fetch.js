const { parse } = require("parse5");
const { gunzipSync, inflateSync, brotliDecompressSync } = require("zlib");
const { createReadOnlyHttpClient } = require("./browser-runtime");
const maxBytes = 1024 * 1024;
const omittedTags = new Set(["script", "style", "template", "noscript", "iframe", "svg", "canvas", "head"]);
const blockTags = new Set(["p", "div", "section", "article", "main", "header", "footer", "nav", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "td", "pre", "blockquote"]);

function createPageFetchRuntime(options = {}) {
	const client = createReadOnlyHttpClient({ ...options, maxResourceBytes: maxBytes });
	const active = new Set();
	let closing = false;
	async function execute(args, context = {}) {
		if (closing) throw failure("web_fetch_cancelled", "Page extraction is shutting down.");
		if (!args || typeof args.url !== "string" || args.url.length > 4096) throw failure("invalid_tool_arguments", "web_fetch requires an HTTP(S) URL of at most 4,096 characters.");
		const maxChars = args.max_chars === undefined ? 16000 : args.max_chars;
		if (!Number.isInteger(maxChars) || maxChars < 256 || maxChars > 30000) throw failure("invalid_tool_arguments", "max_chars must be between 256 and 30,000.");
		const controller = new AbortController();
		const signal = AbortSignal.any([controller.signal, ...(context.signal ? [context.signal] : []), AbortSignal.timeout(options.timeoutMs || 15000)]);
		active.add(controller);
		let onAbort;
		try {
			signal.throwIfAborted();
			const cancellation = new Promise((_, reject) => {
				onAbort = () => reject(signal.reason);
				signal.addEventListener("abort", onAbort, { once: true });
			});
			const response = await Promise.race([client.safeRequest(args.url, { method: "GET", headers: { accept: "text/html, text/plain;q=0.9", "user-agent": "AI-Chat-Page-Reader/1" } }, 0, signal), cancellation]);
			signal.throwIfAborted();
			if (response.status < 200 || response.status >= 300) throw failure("web_fetch_upstream_failed", `Page returned HTTP ${response.status}.`);
			const type = String(response.headers["content-type"] || "").toLowerCase();
			if (!/^text\/(html|plain)(?:;|$)/.test(type)) throw failure("web_fetch_content_type", "Page extraction supports HTML and plain text. Use a suitable document tool for other formats.");
			let bytes = response.body;
			const encoding = String(response.headers["content-encoding"] || "identity").toLowerCase();
			if (encoding !== "identity") {
				const decoder = { gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync }[encoding];
				if (!decoder) throw failure("web_fetch_encoding", "The page uses an unsupported content encoding.");
				try { bytes = decoder(bytes, { maxOutputLength: maxBytes }); }
				catch { throw failure("web_fetch_output_limit", "The compressed page is invalid or exceeds the extraction limit."); }
			}
			const charset = /charset\s*=\s*["']?([a-z0-9_-]+)/i.exec(type)?.[1] || "utf-8";
			let source;
			try { source = new TextDecoder(charset, { fatal: true }).decode(bytes); }
			catch { throw failure("web_fetch_encoding", "The page text encoding could not be decoded reliably."); }
			const extracted = type.startsWith("text/html") ? extractHtml(source, response.final_url) : { title: "", text: source, links: [] };
			const result = {
				ok: true, url: response.final_url, title: extracted.title, text: truncateText(extracted.text, maxChars), links: extracted.links,
				truncated: extracted.text.length > maxChars, fetched_at: new Date().toISOString(),
				provenance: { backend: "http-static", source_type: "page", final_url: response.final_url, source_domain: new URL(response.final_url).hostname, content_is_untrusted: true, redirect_count: response.redirect_count },
				rendering: { performed: false, may_be_needed: extracted.text.trim().length < 80, hint: "Static text only. If content is missing or visual/interactive evidence is needed, use available browser tools; no browser was started." }
			};
			while (Buffer.byteLength(JSON.stringify(result)) > 96 * 1024) {
				result.truncated = true;
				if (result.links.length) result.links.pop();
				else result.text = truncateText(result.text, Math.floor(result.text.length * 0.8));
			}
			return result;
		} catch (error) {
			if (signal.aborted) throw failure(signal.reason?.name === "TimeoutError" ? "web_fetch_timeout" : "web_fetch_cancelled", "Page extraction timed out or was cancelled.");
			if (String(error.code || "").startsWith("browser_")) throw failure(error.code.replace("browser_", "web_fetch_"), error.message.replaceAll("browser", "page").replaceAll("Browser", "Page"));
			if (error.code && String(error.code).startsWith("web_fetch_")) throw error;
			throw failure("web_fetch_failed", "The page request failed.");
		} finally {
			if (onAbort) signal.removeEventListener("abort", onAbort);
			active.delete(controller);
		}
	}
	return { execute, close() { closing = true; for (const controller of active) controller.abort(); }, status: () => ({ available: !closing, backend: "http-static", max_response_bytes: maxBytes, max_result_bytes: 96 * 1024 }) };
}

function extractHtml(source, baseUrl) {
	const document = parse(source);
	const stack = [{ node: document, hidden: false }];
	const text = [];
	const links = [];
	const seen = new Set();
	let title = "";
	while (stack.length) {
		const { node, hidden } = stack.pop();
		const tag = node.tagName;
		const attrs = Object.fromEntries((node.attrs || []).map((attr) => [attr.name, attr.value]));
		if (tag === "title" && !title) title = truncateText((node.childNodes || []).map((child) => child.value || "").join(""), 500);
		const skip = hidden || omittedTags.has(tag) || Object.hasOwn(attrs, "hidden") || attrs["aria-hidden"] === "true" || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style || "");
		if (!skip && node.nodeName === "#text") text.push(node.value);
		if (!skip && blockTags.has(tag)) text.push("\n");
		if (!skip && tag === "a" && attrs.href && links.length < 20) {
			try {
				const url = new URL(attrs.href, baseUrl);
				if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2000 && !seen.has(url.href)) { seen.add(url.href); links.push({ url: url.href }); }
			} catch { /* Non-navigable link. */ }
		}
		for (const child of [...(node.childNodes || [])].reverse()) stack.push({ node: child, hidden: skip });
	}
	return { title, text: text.join("").replace(/[\t \r]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim(), links };
}
function truncateText(text, limit) { return text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, ""); }
function failure(code, message) { return Object.assign(new Error(message), { code, retryable: false }); }
module.exports = { createPageFetchRuntime, extractHtml };
