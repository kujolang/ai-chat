const assert = require("node:assert/strict");
const { test } = require("node:test");
const { isRecoverableNativeBindingError } = require("../scripts/ensure-native-modules");

test("native startup recognizes missing and ABI-mismatched better-sqlite3 bindings", () => {
	assert.equal(isRecoverableNativeBindingError(new Error(
		"Could not locate the bindings file: better_sqlite3.node"
	)), true);
	assert.equal(isRecoverableNativeBindingError(Object.assign(new Error(
		"better_sqlite3.node was compiled against a different NODE_MODULE_VERSION"
	), { code: "ERR_DLOPEN_FAILED" })), true);
	assert.equal(isRecoverableNativeBindingError(new Error("database is corrupt")), false);
});
