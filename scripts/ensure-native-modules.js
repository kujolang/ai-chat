const { execFileSync } = require("child_process");

function requireBetterSqlite3() {
	const Database = require("better-sqlite3");
	const db = new Database(":memory:");
	db.close();
}

function isNativeAbiMismatch(error) {
	const message = String((error && error.message) || "");
	return (
		error &&
		error.code === "ERR_DLOPEN_FAILED" &&
		message.includes("NODE_MODULE_VERSION") &&
		message.includes("better_sqlite3.node")
	);
}

try {
	requireBetterSqlite3();
} catch (error) {
	if (!isNativeAbiMismatch(error)) {
		throw error;
	}

	console.warn("Rebuilding better-sqlite3 for the active Node.js runtime...");
	execFileSync("npm", ["run", "rebuild:native"], {
		stdio: "inherit"
	});
	requireBetterSqlite3();
}
