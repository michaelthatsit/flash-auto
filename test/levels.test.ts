import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_DESCRIPTIONS } from "../src/levels.ts";
import { buildReadoutMessages } from "../src/flash.ts";
import { DECIMA_INSTRUCTIONS } from "../src/decima.ts";

test("level descriptions are the domain-neutral wording", () => {
	assert.deepEqual(LEVEL_DESCRIPTIONS, {
		off: "greeting, thanks, acknowledgement, or a quick fact or lookup",
		low: "a simple question or single-step task",
		medium: "a question or task that needs some looking into, a few steps, or comparing options",
		xhigh: "a hard problem: tricky debugging, planning or design with many moving parts, or careful multi-step reasoning or math",
	});
});

test("neither question mentions coding", () => {
	assert.doesNotMatch(buildReadoutMessages({ prompt: "x" })[0].content, /coding/);
	assert.doesNotMatch(DECIMA_INSTRUCTIONS, /coding/);
});
