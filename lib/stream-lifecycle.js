// A disconnected client is not a cancellation: mobile clients may reconnect
// after the server has persisted the result. Stop uses an explicit control call.
function createStreamRegistry({ maxActive = 32, heartbeatMs = 15000 } = {}) {
	const active = new Map();
	const pendingCancellations = new Map();
	const drained = new Set();
	let closing = false;
	function open(id, response, { heartbeat = true, cancelOnDisconnect = false } = {}) {
		if (closing) throw failure("server_shutting_down", "The server is shutting down; resume after it restarts.");
		for (const [key, expiresAt] of pendingCancellations) if (expiresAt <= Date.now()) pendingCancellations.delete(key);
		if (pendingCancellations.has(id)) {
			pendingCancellations.delete(id);
			throw failure("stream_cancelled", "Generation was cancelled before it started.");
		}
		if (active.has(id)) throw failure("stream_already_running", "This request is already running.");
		if (active.size >= maxActive) throw failure("stream_capacity", "The server has reached its active response limit. Retry when a response finishes.");
		const controller = new AbortController();
		const entry = { controller, cancelled: false, checkpoint: null };
		active.set(id, entry);
		const heartbeatTimer = heartbeat ? setInterval(() => {
			if (!response.destroyed && !response.writableEnded && !response.writableNeedDrain) {
				response.write(": heartbeat\n\n");
			}
		}, heartbeatMs) : null;
		heartbeatTimer?.unref?.();
		const stopHeartbeat = () => {
			clearInterval(heartbeatTimer);
			if (cancelOnDisconnect && !response.writableEnded) cancel(id);
		};
		response.once("close", stopHeartbeat);
		return {
			signal: controller.signal,
			controller,
			get cancelled() { return entry.cancelled; },
			onShutdown(checkpoint) { entry.checkpoint = checkpoint; },
			close() {
				clearInterval(heartbeatTimer);
				response.off("close", stopHeartbeat);
				if (active.get(id) === entry) active.delete(id);
				if (active.size === 0) { for (const resolve of drained) resolve(); drained.clear(); }
			}
		};
	}
	function cancel(id) {
		const entry = active.get(id);
		if (!entry) {
			// Stop can arrive before the streaming POST finishes admission.
			pendingCancellations.set(id, Date.now() + 30000);
			while (pendingCancellations.size > maxActive * 4) pendingCancellations.delete(pendingCancellations.keys().next().value);
			return false;
		}
		entry.cancelled = true;
		entry.controller.abort(failure("stream_cancelled", "Generation was cancelled."));
		return true;
	}
	function close({ timeoutMs = 15000 } = {}) {
		closing = true;
		for (const [id, entry] of active) {
			entry.checkpoint?.();
			cancel(id);
		}
		pendingCancellations.clear();
		if (active.size === 0) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const complete = () => { clearTimeout(timer); resolve(); };
			const timer = setTimeout(() => { drained.delete(complete); reject(failure("shutdown_timeout", "Active work did not drain; durable receipts require recovery on restart.")); }, timeoutMs);
			drained.add(complete);
		});
	}
	return { open, cancel, size: () => active.size, close };
}

function failure(code, message) {
	return Object.assign(new Error(message), { code, retryable: code === "stream_capacity" });
}

module.exports = { createStreamRegistry };
