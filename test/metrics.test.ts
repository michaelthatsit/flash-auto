import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, filterItems, percentile } from "../bench/metrics.ts";
import type { RunRow } from "../bench/run.ts";
import type { LabeledItem } from "../bench/labels.ts";
import type { Level } from "../src/levels.ts";
import { fromProbs, type Classification } from "../src/types.ts";

const pred = (level: Level, conf: number, latencyMs = 10): Classification => {
	const rest = (1 - conf) / 3;
	const probs = { off: rest, low: rest, medium: rest, xhigh: rest };
	probs[level] = conf;
	return fromProbs(probs, latencyMs);
};
const item = (id: string, level: Level, extra: Partial<LabeledItem> = {}): LabeledItem => ({
	id, prompt: id, kind: "opener", source: "session", level, reason: "", split: "test", handwritten: false, ...extra,
});
const row = (itemId: string, flash: Classification, decima: Classification, extra: Partial<RunRow> = {}): RunRow => ({
	itemId, condition: "idle", flash, decima, loadActive: false, promptVersion: { flash: "f", decima: "d" }, at: "", ...extra,
});
const map = (...items: LabeledItem[]) => new Map(items.map((i) => [i.id, i]));

test("over-thinking miss", () => {
	const m = computeMetrics([row("a", pred("xhigh", 0.9), pred("xhigh", 0.9))], map(item("a", "medium")), "flash");
	assert.equal(m.over, 1);
	assert.equal(m.under, 0);
	assert.equal(m.meanDistance, 1);
	assert.equal(m.withinOne, 1);
	assert.equal(m.exact, 0);
});

test("under-thinking miss and confusion cell", () => {
	const m = computeMetrics([row("a", pred("off", 0.9), pred("off", 0.9))], map(item("a", "xhigh")), "decima");
	assert.equal(m.under, 1);
	assert.equal(m.meanDistance, 3);
	assert.equal(m.confusion.xhigh.off, 1);
});

test("ECE for two 0.9-confidence items, one right", () => {
	const m = computeMetrics(
		[row("a", pred("low", 0.9), pred("low", 0.9)), row("b", pred("low", 0.9), pred("low", 0.9))],
		map(item("a", "low"), item("b", "medium")),
		"flash",
	);
	assert.ok(Math.abs(m.ece - 0.4) < 1e-9);
	assert.equal(m.exact, 0.5);
});

test("nearest-rank p95", () => {
	assert.equal(percentile(Array.from({ length: 20 }, (_, i) => (i + 1) * 10), 0.95), 190);
});

test("busy rows without load are excluded", () => {
	const m = computeMetrics(
		[row("a", pred("low", 0.9), pred("low", 0.9), { condition: "busy", loadActive: false })],
		map(item("a", "low")),
		"flash",
	);
	assert.equal(m.n, 0);
});

test("race takes decima when flash is over budget", () => {
	const m = computeMetrics([row("a", pred("xhigh", 0.9, 650), pred("low", 0.9, 20))], map(item("a", "low")), "race");
	assert.equal(m.exact, 1);
	assert.equal(m.flashShare, 0);
	assert.deepEqual(m.calibration, []);
	assert.equal(m.latency.p50, 500);
});

test("flash parse error counts as an error and drops the item from accuracy everywhere", () => {
	const bad: Classification = { ok: false, error: "parse", detail: "", latencyMs: 5 };
	const rows = [row("a", bad, pred("low", 0.9)), row("b", pred("low", 0.9), pred("low", 0.9))];
	const items = map(item("a", "xhigh"), item("b", "low"));
	assert.equal(computeMetrics(rows, items, "flash").errors.parse, 1);
	for (const arm of ["flash", "decima", "race"] as const) {
		const m = computeMetrics(rows, items, arm);
		assert.equal(m.answered, 1, arm);
		assert.equal(m.exact, 1, arm);
	}
});

test("filterItems by kind and handwritten", () => {
	const items = [item("a", "low"), item("b", "low", { kind: "follow-up" }), item("c", "low", { handwritten: true })];
	assert.deepEqual(filterItems(items, { kind: "follow-up" }).map((i) => i.id), ["b"]);
	assert.deepEqual(filterItems(items, { includeHandwritten: false }).map((i) => i.id), ["a", "b"]);
});

test("deem arm scores the deem column", () => {
	const m = computeMetrics([row("a", pred("off", 0.9), pred("off", 0.9), { deem: pred("medium", 0.8, 900) })], map(item("a", "medium")), "deem");
	assert.equal(m.answered, 1);
	assert.equal(m.exact, 1);
	assert.equal(m.latency.p50, 900);
});

test("race-deem falls back to deem when flash is late", () => {
	const m = computeMetrics([row("a", pred("xhigh", 0.9, 650), pred("off", 0.9), { deem: pred("low", 0.8, 300) })], map(item("a", "low")), "race-deem");
	assert.equal(m.exact, 1);
	assert.equal(m.flashShare, 0);
});

test("deem arms skip rows without a deem result", () => {
	const m = computeMetrics([row("a", pred("low", 0.9), pred("low", 0.9))], map(item("a", "low")), "deem");
	assert.equal(m.answered, 0);
});
