function createAdmissionController({ maxInflight, maxQueue, queueTimeoutMs, nowMs }) {
	let active = 0;
	const queue = [];

	function snapshot() {
		return {
			active,
			queued: queue.length,
			max_inflight: maxInflight,
			max_queue: maxQueue,
			queue_timeout_ms: queueTimeoutMs
		};
	}

	function drain() {
		while (active < maxInflight && queue.length > 0) {
			const next = queue.shift();
			if (!next || next.settled) {
				continue;
			}
			next.settled = true;
			active += 1;
			next.resolve({
				waitMs: Math.max(0, nowMs() - next.enqueuedAt),
				release: releaseFactory()
			});
		}
	}

	function releaseFactory() {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			active = Math.max(0, active - 1);
			drain();
		};
	}

	async function acquire({ signal } = {}) {
		signal?.throwIfAborted();
		if (active < maxInflight) {
			active += 1;
			return { waitMs: 0, release: releaseFactory() };
		}
		if (queue.length >= maxQueue) {
			const error = new Error("Benchmark queue is full. Retry after in-flight benchmark responses finish.");
			error.code = "benchmark_saturated";
			throw error;
		}
		return await new Promise((resolve, reject) => {
			const entry = {
				enqueuedAt: nowMs(),
				resolve,
				reject,
				settled: false
			};
			queue.push(entry);
			const timeout = queueTimeoutMs > 0
				? setTimeout(() => {
					if (entry.settled) return;
					entry.settled = true;
					const index = queue.indexOf(entry);
					if (index >= 0) queue.splice(index, 1);
					const error = new Error(`Benchmark queue wait exceeded ${queueTimeoutMs}ms.`);
					error.code = "benchmark_queue_timeout";
					entry.reject(error);
				}, queueTimeoutMs)
				: null;
			const onAbort = () => {
				if (entry.settled) return;
				entry.settled = true;
				const index = queue.indexOf(entry);
				if (index >= 0) queue.splice(index, 1);
				entry.reject(signal.reason);
			};
			const wrappedResolve = (value) => {
				signal?.removeEventListener("abort", onAbort);
				if (timeout) clearTimeout(timeout);
				resolve(value);
			};
			const wrappedReject = (error) => {
				signal?.removeEventListener("abort", onAbort);
				if (timeout) clearTimeout(timeout);
				reject(error);
			};
			entry.resolve = wrappedResolve;
			entry.reject = wrappedReject;
			signal?.addEventListener("abort", onAbort, { once: true });
			if (signal?.aborted) onAbort();
			drain();
		});
	}

	return { acquire, snapshot };
}

module.exports = { createAdmissionController };
