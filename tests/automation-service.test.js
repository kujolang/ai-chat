const assert = require("node:assert/strict");
const { test } = require("node:test");

const { nextScheduledAt } = require("../lib/automation-service");

test("daily automation does not run twice during a repeated DST wall-clock hour", () => {
	const schedule = {
		repeat: "daily",
		time: "01:30",
		timezone: "America/New_York",
		weekday: 0
	};
	const firstOccurrence = Date.parse("2026-11-01T05:30:00.000Z");
	const next = nextScheduledAt(schedule, firstOccurrence);

	assert.equal(new Date(next).toISOString(), "2026-11-02T06:30:00.000Z");
});
