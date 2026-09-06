const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const dgram = require("node:dgram");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require("playwright");
const { createBrowserContainment, inspectContainment, networkProfile, linuxSandboxArgs } = require("../lib/browser-containment");
const available = inspectContainment().available;
function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = ""; let stderr = "";
		const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Sandbox probe timed out")); }, 5000);
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.once("error", (error) => { clearTimeout(timer); reject(error); });
		child.once("exit", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
	});
}

test("unsupported containment modes fail closed", () => {
	if (process.env.AI_CHAT_REQUIRE_BROWSER_CONTAINMENT === "1") assert.equal(available, true, "CI requires a working browser sandbox");
	assert.equal(inspectContainment({ platform: "unsupported" }).available, false);
	const sandbox = createBrowserContainment({ headless: false });
	assert.equal(sandbox.status().available, false);
	assert.throws(() => sandbox.launchOptions(), { code: "browser_containment_unavailable" });
});

test("network containment blocks host TCP and UDP in the child process and inherited descendants", { skip: !available }, async () => {
	let tcpHits = 0, udpHits = 0;
	const tcp = net.createServer((socket) => { tcpHits++; socket.end(); });
	tcp.listen(0, "127.0.0.1"); await once(tcp, "listening");
	const udp = dgram.createSocket("udp4"); udp.on("message", () => { udpHits++; });
	udp.bind(0, "127.0.0.1"); await once(udp, "listening");
	const source = `const net=require('net'),dgram=require('dgram');const tcp=net.connect(${tcp.address().port},'127.0.0.1');tcp.on('connect',()=>{console.log('tcp allowed');tcp.end()});tcp.on('error',e=>console.log('tcp '+e.code));const udp=dgram.createSocket('udp4');udp.on('error',e=>{console.log('udp '+e.code);udp.close()});udp.send('probe',${udp.address().port},'127.0.0.1',e=>{console.log('udp '+(e?e.code:'allowed'));udp.close()});`;
	try {
		const control = await run(process.execPath, ["-e", source]);
		assert.equal(control.code, 0);
		await new Promise((resolve) => setTimeout(resolve, 30));
		assert.equal(tcpHits, 1); assert.equal(udpHits, 1);
		for (const descendant of [false, true]) {
			const code = descendant ? `require('child_process').spawnSync(${JSON.stringify(process.execPath)},['-e',${JSON.stringify(source)}],{stdio:'inherit'})` : source;
			const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-egress-"));
			let denied;
			try {
				denied = process.platform === "darwin"
					? await run("/usr/bin/sandbox-exec", ["-p", networkProfile, process.execPath, "-e", code])
					: await run("/usr/bin/bwrap", [...linuxSandboxArgs(process.execPath, { directory, profile: directory, artifactDir: directory }), "-e", code]);
			} finally { fs.rmSync(directory, { recursive: true, force: true }); }
			assert.equal(denied.code, 0, denied.stderr);
			assert.doesNotMatch(denied.stdout, /tcp allowed/);
			if (process.platform === "darwin") {
				assert.match(denied.stdout, /tcp (EPERM|EACCES)/);
				assert.match(denied.stdout, /udp (EPERM|EACCES)/);
			}
		}
		assert.equal(tcpHits, 1); assert.equal(udpHits, 1);
	} finally { udp.close(); await new Promise((resolve) => tcp.close(resolve)); }
});

test("contained Chromium renders over pipes but cannot bypass routing with WebSocket or WebRTC STUN", { skip: !available, timeout: 20000 }, async () => {
	let upgrades = 0, datagrams = 0;
	const server = http.createServer();
	server.on("upgrade", (_req, socket) => { upgrades++; socket.destroy(); });
	server.listen(0, "127.0.0.1"); await once(server, "listening");
	const udp = dgram.createSocket("udp4"); udp.on("message", () => { datagrams++; });
	udp.bind(0, "127.0.0.1"); await once(udp, "listening");
	const sandbox = createBrowserContainment();
	async function probe(contained) {
		const browser = await chromium.launch({ headless: true, ...(contained ? sandbox.launchOptions() : {}) });
		try {
			const page = await browser.newPage();
			await page.setContent("<h1>Pipe rendering works</h1>");
			assert.equal(await page.textContent("h1"), "Pipe rendering works");
			await page.evaluate(async ({ tcpPort, udpPort }) => {
				const socket = new WebSocket(`ws://127.0.0.1:${tcpPort}/probe`);
				const peer = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${udpPort}` }] });
				peer.createDataChannel("probe"); await peer.setLocalDescription(await peer.createOffer());
				await new Promise((resolve) => setTimeout(resolve, 1200));
				socket.close(); peer.close();
			}, { tcpPort: server.address().port, udpPort: udp.address().port });
		} finally { await browser.close(); }
	}
	try {
		await probe(false);
		assert.ok(upgrades > 0, "Uncontained WebSocket control must reach listener");
		assert.ok(datagrams > 0, "Uncontained STUN control must reach UDP listener");
		const before = { upgrades, datagrams };
		await probe(true);
		assert.deepEqual({ upgrades, datagrams }, before, "Contained browser must emit no direct TCP or UDP traffic");
		const env = sandbox.launchOptions().env;
		assert.deepEqual(Object.keys(env).sort(), ["HOME", "LANG", "PATH", "TMPDIR"]);
	} finally { sandbox.close(); udp.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("Linux sandbox hides files outside its scoped mounts", { skip: process.platform !== "linux" || !available }, async () => {
	const hidden = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-host-private-"));
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-visible-"));
	const secret = path.join(hidden, "fixture.txt");
	fs.writeFileSync(secret, "host-only fixture");
	fs.writeFileSync(path.join(directory, "visible.txt"), "scoped fixture");
	try {
		const source = `const fs=require('fs'); if(fs.existsSync(${JSON.stringify(secret)}))process.exit(42);if(fs.readFileSync(${JSON.stringify(path.join(directory, "visible.txt"))},'utf8')!=='scoped fixture')process.exit(43);`;
		const result = await run("/usr/bin/bwrap", [...linuxSandboxArgs(process.execPath, { directory, profile: directory, artifactDir: directory }), "-e", source]);
		assert.equal(result.code, 0, result.stderr);
	} finally { fs.rmSync(hidden, { recursive: true, force: true }); fs.rmSync(directory, { recursive: true, force: true }); }
});
