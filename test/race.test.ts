import { test } from "node:test";
import assert from "node:assert/strict";
import { BUDGET_MS, raceClassify, resolveRace } from "../src/race.ts";
import { fromProbs, type Classification, type Classifier } from "../src/types.ts";

const ok = (level: "off" | "medium" | "xhigh", latencyMs: number) =>
	fromProbs({ off: level === "off" ? 1 : 0, low: 0, medium: level === "medium" ? 1 : 0, xhigh: level === "xhigh" ? 1 : 0 }, latencyMs);
const fail = (latencyMs: number): Classification => ({ ok: false, error: "http", detail: "x", latencyMs });

test("budget is 500 ms", () => assert.equal(BUDGET_MS, 500));

test("flash within budget wins", () => {
	assert.deepEqual(resolveRace(ok("xhigh", 210), ok("off", 20)), { source: "flash", level: "xhigh", addedDelayMs: 210 });
});

test("late flash falls back to decima at the budget", () => {
	assert.deepEqual(resolveRace(ok("xhigh", 650), ok("off", 20)), { source: "decima", level: "off", addedDelayMs: 500 });
});

test("early flash failure releases decima immediately", () => {
	assert.deepEqual(resolveRace(fail(15), ok("medium", 25)), { source: "decima", level: "medium", addedDelayMs: 25 });
});

test("both fail → none", () => {
	assert.deepEqual(resolveRace(fail(15), fail(25)), { source: "none", level: null, addedDelayMs: 500 });
});

test("raceClassify does not wait for a slow flash", async () => {
	const after = (ms: number, c: Classification, name: "flash" | "decima"): Classifier => ({
		name,
		classify: (_input, signal) =>
			new Promise((resolve) => {
				const t = setTimeout(() => resolve(c), ms);
				signal?.addEventListener("abort", () => {
					clearTimeout(t);
					resolve({ ok: false, error: "timeout", detail: "aborted", latencyMs: ms });
				});
			}),
	});
	const start = performance.now();
	const out = await raceClassify(after(2000, ok("xhigh", 2000), "flash"), after(10, ok("off", 10), "decima"), { prompt: "x" });
	assert.ok(performance.now() - start < 650);
	assert.equal(out.source, "decima");
	assert.equal(out.level, "off");
});
