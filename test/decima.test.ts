import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDecimaRequest, createDecimaClassifier, parseDecimaResponse } from "../src/decima.ts";
import { LEVEL_DESCRIPTIONS } from "../src/levels.ts";

const answer = (probabilities: Record<string, number>) =>
	Response.json({ answers: { level: { type: "choice", probabilities } } });

test("criteria are the level descriptions", () => {
	const req = buildDecimaRequest({ prompt: "hi" }) as any;
	assert.equal(req.model, "decima-small");
	assert.equal(req.questions.level.type, "choice");
	assert.deepEqual(req.questions.level.criteria, LEVEL_DESCRIPTIONS);
});

test("previous_assistant only when previous is set", () => {
	assert.deepEqual((buildDecimaRequest({ prompt: "hi" }) as any).state, { prompt: "hi" });
	assert.deepEqual((buildDecimaRequest({ prompt: "yes", previous: "Plan" }) as any).state, {
		previous_assistant: "Plan",
		prompt: "yes",
	});
});

test("probabilities parse", async () => {
	const fn = (async () => answer({ off: 0.1, low: 0.2, medium: 0.6, xhigh: 0.1 })) as unknown as typeof fetch;
	const c = await createDecimaClassifier({ fetch: fn }).classify({ prompt: "x" });
	assert.equal(c.ok && c.level, "medium");
});

test("missing xhigh → parse error", async () => {
	assert.equal(parseDecimaResponse({ answers: { level: { probabilities: { off: 1, low: 0, medium: 0 } } } }), null);
	const fn = (async () => answer({ off: 1, low: 0, medium: 0 })) as unknown as typeof fetch;
	const c = await createDecimaClassifier({ fetch: fn }).classify({ prompt: "x" });
	assert.equal(!c.ok && c.error, "parse");
});

test("connection refused → unavailable", async () => {
	const fn = (async () => {
		throw new TypeError("fetch failed");
	}) as typeof fetch;
	const c = await createDecimaClassifier({ fetch: fn }).classify({ prompt: "x" });
	assert.equal(!c.ok && c.error, "unavailable");
});
