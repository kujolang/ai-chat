const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// Seatbelt applies to the browser process and its descendants. No IP or Unix
// sockets are allowed. Playwright communicates through inherited pipes, while
// checked HTTP is fetched by the parent and fulfilled through request routing.
const networkProfile = "(version 1)(allow default)(deny network*)";
let seatbeltAvailable;
let bubblewrapAvailable;
function inspectContainment({ headless = true, platform = process.platform } = {}) {
	if (!["darwin", "linux"].includes(platform)) return { available: false, backend: null, reason: "browser_network_containment_unavailable" };
	if (!headless) return { available: false, backend: null, reason: "browser_network_containment_requires_headless" };
	if (platform === "darwin") {
		if (seatbeltAvailable === undefined) {
			const probe = spawnSync("/usr/bin/sandbox-exec", ["-p", networkProfile, "/usr/bin/true"], { timeout: 2000, stdio: "ignore" });
			seatbeltAvailable = !probe.error && probe.status === 0;
		}
		if (!seatbeltAvailable) return { available: false, backend: null, reason: "browser_network_containment_unavailable" };
	} else {
		if (bubblewrapAvailable === undefined) {
			const probe = spawnSync("/usr/bin/bwrap", ["--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-net", "--unshare-uts", "--new-session", "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev", "--", "/usr/bin/true"], { timeout: 2000, stdio: "ignore" });
			bubblewrapAvailable = !probe.error && probe.status === 0;
		}
		if (!bubblewrapAvailable) return { available: false, backend: null, reason: "bubblewrap_user_namespace_unavailable" };
	}
	try {
		// Version-coupled to the installed Playwright registry; a missing export or
		// executable fails closed instead of silently launching another browser.
		const { registry } = require("playwright-core/lib/coreBundle").registry;
		const executable = registry.findExecutable("chromium-headless-shell").executablePath();
		fs.accessSync(executable, fs.constants.X_OK);
		return { available: true, backend: platform === "darwin" ? "macos-seatbelt" : "linux-bubblewrap", executable, reason: null };
	} catch { return { available: false, backend: null, reason: "contained_headless_shell_unavailable" }; }
}

function createBrowserContainment(options = {}) {
	const inspected = inspectContainment(options);
	let directory;
	function launchOptions() {
		if (!inspected.available) throw Object.assign(new Error("An enforced browser network sandbox is unavailable."), { code: "browser_containment_unavailable" });
		if (!directory) {
			directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-chat-browser-sandbox-"));
			fs.chmodSync(directory, 0o700);
			let script;
			if (inspected.backend === "macos-seatbelt") script = `#!/bin/sh\nexec /usr/bin/sandbox-exec -p ${shellQuote(networkProfile)} ${shellQuote(inspected.executable)} "$@"\n`;
			else {
				const args = linuxSandboxArgs(inspected.executable, { directory, profile: "__PROFILE__", artifactDir: options.artifactDir || directory, pipeTransport: true });
				const command = args.map((arg) => arg === "__PROFILE__" ? '\"$profile\"' : shellQuote(arg)).join(" ");
				script = `#!/bin/sh\nprofile=''\nfor arg in "$@"; do case "$arg" in --user-data-dir=*) profile="\${arg#--user-data-dir=}";; esac; done\n[ -n "$profile" ] || exit 64\nexec /usr/bin/bwrap ${command} "$@" 0<&3 1>&4 3<&- 4>&-\n`;
			}
			fs.writeFileSync(path.join(directory, "launch"), script, { mode: 0o700 });
		}
		return {
			executablePath: path.join(directory, "launch"),
			// Do not pass provider secrets, proxy credentials, or process-specific
			// loader variables into a process that handles hostile web content.
			env: { HOME: inspected.backend === "linux-bubblewrap" ? directory : os.homedir(), TMPDIR: inspected.backend === "linux-bubblewrap" ? "/tmp" : os.tmpdir(), PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8" }
		};
	}
	return {
		status: () => ({ available: inspected.available, backend: inspected.backend, reason: inspected.reason, direct_network: inspected.available ? (inspected.backend === "linux-bubblewrap" ? "isolated_namespace" : "denied") : "unavailable", filesystem_isolated: inspected.backend === "linux-bubblewrap" }),
		launchOptions,
		close() { if (directory) { fs.rmSync(directory, { recursive: true, force: true }); directory = null; } }
	};
}
function linuxSandboxArgs(executable, { directory, profile, artifactDir, pipeTransport = false }) {
	const args = ["--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-net", "--unshare-uts", "--die-with-parent", "--new-session"];
	for (const entry of ["/usr", "/lib", "/lib64", "/etc/fonts", "/etc/ld.so.cache", "/etc/localtime"]) {
		if (fs.existsSync(entry)) args.push("--ro-bind", entry, entry);
	}
	args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/run", "--ro-bind", path.dirname(executable), path.dirname(executable));
	for (const entry of new Set([directory, profile, artifactDir])) args.push("--bind", entry, entry);
	args.push("--chdir", directory, "--");
	// Bubblewrap closes extra descriptors. Carry the two Playwright pipes over
	// stdin/stdout, then restore fd 3/4 inside the namespace.
	if (pipeTransport) args.push("/usr/bin/sh", "-c", 'exec 3<&0 4>&1; exec "$@"', "ai-chat-browser");
	args.push(executable);
	return args;
}
function shellQuote(value) { return "'" + String(value).replaceAll("'", "'\\''") + "'"; }
module.exports = { createBrowserContainment, inspectContainment, networkProfile, linuxSandboxArgs };
