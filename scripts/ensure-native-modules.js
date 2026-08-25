const { execFileSync } = require("child_process");

function requireBetterSqlite3() {
	const Database = require("better-sqlite3");
	const db = new Database(":memory:");
	db.close();
}

function isRecoverableNativeBindingError(error) {
	const message = String((error && error.message) || "");
	return (
		Boolean(error) &&
		(
			(
				error.code === "ERR_DLOPEN_FAILED" &&
				message.includes("NODE_MODULE_VERSION") &&
				message.includes("better_sqlite3.node")
			) || (
				message.includes("Could not locate the bindings file") &&
				message.includes("better_sqlite3.node")
			)
		)
	);
}

function ensureNativeModules() {
	try {
		requireBetterSqlite3();
	} catch (error) {
		if (!isRecoverableNativeBindingError(error)) {
			throw error;
		}

		console.warn("Rebuilding better-sqlite3 for the active Node.js runtime...");
		execFileSync("npm", ["run", "rebuild:native"], {
			stdio: "inherit"
		});
		requireBetterSqlite3();
	}
}

if (require.main === module) {
	ensureNativeModules();
}

module.exports = { ensureNativeModules, isRecoverableNativeBindingError };
