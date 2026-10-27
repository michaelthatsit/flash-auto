import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClassifierInput } from "../src/input.ts";
import { fromProbs } from "../src/types.ts";

test("short prompt passes through", () => {
	assert.deepEqual(buildClassifierInput("hi"), { prompt: "hi" });
});

test("previous keeps last 600 chars", () => {
	const input = buildClassifierInput("ok", "x".repeat(1000) + "END");
	assert.equal(input.previous?.length, 600);
	assert.ok(input.previous?.endsWith("END"));
});

test("long prompt keeps head and tail", () => {
	const { prompt } = buildClassifierInput("H" + "m".repeat(5000) + "T");
	assert.ok(prompt.length <= 1000 + "\n…\n".length);
	assert.ok(prompt.startsWith("H"));
	assert.ok(prompt.endsWith("T"));
	assert.ok(prompt.includes("\n…\n"));
});

test("empty previous is dropped", () => {
	assert.equal("previous" in buildClassifierInput("x", "   "), false);
});

test("fromProbs normalises", () => {
	const c = fromProbs({ off: 1, low: 1, medium: 2, xhigh: 0 }, 5);
	assert.equal(c.ok, true);
	if (!c.ok) return;
	assert.equal(c.level, "medium");
	assert.equal(c.confidence, 0.5);
	assert.equal(c.latencyMs, 5);
});
