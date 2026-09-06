// Bound upstream bytes while reading, before decoding/parsing or allocating a
// complete response. Used by external JSON adapters with smaller output limits.
async function readBoundedResponse(response, maxBytes, code) {
	const tooLarge = () => Object.assign(new Error(`Upstream response exceeded the ${maxBytes}-byte limit.`), { code, retryable: false });
	if (!response.body || typeof response.body.getReader !== "function") {
		// Compatibility with injected transports; real fetch responses use the
		// streaming path below.
		const text = await response.text();
		if (Buffer.byteLength(text) > maxBytes) throw tooLarge();
		return text;
	}
	const reader = response.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) throw tooLarge();
			chunks.push(Buffer.from(value));
		}
		return Buffer.concat(chunks, size).toString("utf8");
	} catch (error) {
		if (typeof reader.cancel === "function") await Promise.resolve(reader.cancel()).catch(() => {});
		throw error;
	} finally {
		reader.releaseLock?.();
	}
}

module.exports = { readBoundedResponse };
