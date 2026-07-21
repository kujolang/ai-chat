const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(projectRoot, "public", "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(projectRoot, "public", "app.css"), "utf8");
const htmlSource = fs.readFileSync(path.join(projectRoot, "public", "index.html"), "utf8");

test("header ID controls expose explicit copied feedback and neutral Watchdog styling", () => {
	assert.match(appSource, /button\.dataset\.copyFeedback = "Copied"/);
	assert.match(appSource, /navigator\.clipboard\.writeText\(traceId\)/);
	assert.match(cssSource, /\.workspace-top \.copy-confirmed::after/);
	assert.doesNotMatch(cssSource, /\.chat-watchdog-btn\.icon-only\s*\{[^}]*#77b9ff/s);
	assert.doesNotMatch(htmlSource, /id="chat-watchdog-trace"/);
});

test("pane controls render a disclosure menu with hover and keyboard delete affordances", () => {
	assert.match(appSource, /data-action="toggle-pane-menu"/);
	assert.match(appSource, /class="pane-menu-dropdown/);
	assert.match(appSource, /class="pane-menu-delete btn ghost icon-only"/);
	assert.match(cssSource, /\.pane-menu-row:hover \.pane-menu-delete\.icon-only/);
	assert.match(cssSource, /\.pane-menu-row:focus-within \.pane-menu-delete\.icon-only/);
	assert.match(htmlSource, /id="toggle-pane-info-btn"[^>]*tooltip-delayed/);
	assert.match(htmlSource, /id="toggle-usage-summary-btn"[^>]*tooltip-delayed/);
});
