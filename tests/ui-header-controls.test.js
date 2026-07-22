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

test("collapsed header keeps Copy Chat visible and expands actions in the requested order", () => {
	const actions = htmlSource.match(/<div class="workspace-actions">([\s\S]*?)<\/div>\s*<\/header>/)?.[1] || "";
	const controlIds = [
		"copy-chat-id-btn",
		"chat-watchdog-btn",
		"export-chat-btn",
		"open-pane-profiles-btn",
		"pane-controls"
	];
	const indexes = controlIds.map((id) => actions.indexOf(`id="${id}"`));
	assert.ok(indexes.every((index) => index >= 0));
	assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
	assert.doesNotMatch(htmlSource, /id="add-pane-btn"/);
	assert.match(appSource, /class="pane-menu-add" data-action="add-pane"/);
	assert.match(appSource, /paneInfoVisibleStorageKey = "ai_chat_pane_info_visible_v3"/);
	assert.match(appSource, /let paneInfoVisible = loadBooleanPreference\(paneInfoVisibleStorageKey, false\)/);
});

test("sidebar chrome and requested response labels use Departure Mono", () => {
	assert.doesNotMatch(htmlSource, /Space\+Grotesk|Space Grotesk/);
	assert.match(cssSource, /--sans: "Departure Mono", "IBM Plex Mono", monospace;/);
	assert.match(cssSource, /\.sidebar\s*\{[^}]*padding: 12px 0;/s);
	assert.match(cssSource, /\.chat-list\s*\{[^}]*padding: 0;/s);
	assert.match(cssSource, /\.brand-row h1\s*\{[^}]*font-family: var\(--display\);/s);
	assert.match(cssSource, /\.chat-group-title\s*\{[^}]*font-family: var\(--display\);/s);
	assert.match(cssSource, /\.message-disclosure-btn\s*\{[^}]*font: 11px\/1\.3 var\(--display\);/s);
	assert.match(cssSource, /\.thinking-label\s*\{[^}]*font-family: var\(--display\);/s);
	assert.match(cssSource, /\.save-status\s*\{[^}]*font-family: var\(--display\);/s);
	assert.match(cssSource, /\.composer-token-summary\s*\{[^}]*font-family: var\(--display\);/s);
	assert.match(cssSource, /\.modal-head h2\s*\{[^}]*font-family: var\(--display\);/s);
	assert.match(cssSource, /\.search-chat-item-title,[\s\S]*?\.usage-stat-label,[\s\S]*?font-family: var\(--display\);/);
});

test("pane list and user identity settings expose the requested labels", () => {
	assert.match(appSource, /paneMenuOpen \? "Hide panes list" : "Panes list"/);
	assert.match(htmlSource, /id="settings-user-name"[^>]*maxlength="120"/);
	assert.doesNotMatch(htmlSource, /SYSTEM_PROMPT\.md/);
});

test("scheduled automation and compact tool controls replace placeholder actions", () => {
	assert.match(htmlSource, /id="automation-editor"/);
	assert.match(htmlSource, /id="automation-repeat"/);
	assert.match(htmlSource, /id="automation-timezone"/);
	assert.doesNotMatch(htmlSource, /data-automation-action="new-chat"/);
	assert.match(htmlSource, /id="toggle-tool-presets-btn"/);
	assert.match(htmlSource, /id="tool-preset-dropdown" class="tool-preset-dropdown hidden"/);
	assert.match(cssSource, /button\s*\{\s*font-family: var\(--display\);/s);
});

test("modal close controls and project add affordance use compact mono glyphs", () => {
	assert.doesNotMatch(htmlSource, /modal-close-icon[\s\S]{0,400}<circle/);
	assert.match(htmlSource, /class="modal-close-icon"[\s\S]{0,160}<span aria-hidden="true">×<\/span>/);
	assert.match(htmlSource, /id="add-project-folder-btn"[\s\S]{0,200}<span aria-hidden="true">\+<\/span>/);
	assert.match(cssSource, /\.project-folder-add-btn\s*\{[^}]*opacity: 0;[^}]*pointer-events: none;/s);
	assert.match(cssSource, /\.projects-title-control:hover \.project-folder-add-btn/);
});

test("live narration renders inside the themed thinking block", () => {
	assert.match(appSource, /const thinkingText = message\.streaming\s*\? String\(message\.live_narration/);
	assert.doesNotMatch(appSource, /class="message-live-narration"/);
	assert.match(cssSource, /\.message-thinking \.message-content-block\s*\{[^}]*font-family: var\(--display\);/s);
});
