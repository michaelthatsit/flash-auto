import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBenchmark, waitForFlash, type RunRow } from "../bench/run.ts";
import type { LabeledItem } from "../bench/labels.ts";
import { fromProbs, type Classifier } from "../src/types.ts";

const item = (id: string): LabeledItem => ({
	id,
	prompt: `prompt ${id}`,
	kind: "opener",
	source: "session",
	level: "low",
	reason: "r",
	split: "test",
	handwritten: false,
});
const fake = (name: "flash" | "decima", ms = 0) => {
	let calls = 0;
	const c: Classifier = {
		name,
		classify: async () => {
			calls++;
			if (ms) await new Promise((r) => setTimeout(r, ms));
			return fromProbs({ off: 0, low: 1, medium: 0, xhigh: 0 }, ms);
		},
	};
	return { c, calls: () => calls };
};
const outFile = () => join(mkdtempSync(join(tmpdir(), "bench-")), "out.jsonl");
const rows = (f: string): RunRow[] =>
	readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const noSleep = { sleep: async () => {} };

test("warm-up call is discarded", async () => {
	const flash = fake("flash");
	const f = outFile();
	await runBenchmark({ items: [item("a"), item("b")], condition: "idle", outFile: f, flash: flash.c, decima: fake("decima").c, isFlashRunning: async () => true });
	assert.equal(flash.calls(), 3);
	assert.equal(rows(f).length, 2);
});

test("pauses until flash returns", async () => {
	let n = 0;
	const f = outFile();
	const res = await runBenchmark({
		items: [item("a")],
		condition: "idle",
		outFile: f,
		flash: fake("flash").c,
		decima: fake("decima").c,
		isFlashRunning: async () => ++n > 2,
		waitOpts: noSleep,
	});
	assert.deepEqual(res.missing, []);
	assert.equal(rows(f).length, 1);
});

test("gives up after maxWaitMs", async () => {
	assert.equal(await waitForFlash(async () => false, { intervalMs: 10, maxWaitMs: 30, sleep: async () => {} }), false);
	const f = outFile();
	writeFileSync(f, "");
	const res = await runBenchmark({
		items: [item("a")],
		condition: "idle",
		outFile: f,
		flash: fake("flash").c,
		decima: fake("decima").c,
		isFlashRunning: async () => false,
		waitOpts: { intervalMs: 10, maxWaitMs: 30, sleep: async () => {} },
	});
	assert.deepEqual(res.missing, ["a"]);
	assert.equal(rows(f).length, 0);
});

test("resume skips complete rows", async () => {
	const f = outFile();
	const done = fromProbs({ off: 0, low: 1, medium: 0, xhigh: 0 }, 1);
	writeFileSync(f, JSON.stringify({ itemId: "a", condition: "idle", flash: done, decima: done }) + "\n");
	const res = await runBenchmark({ items: [item("a"), item("b")], condition: "idle", outFile: f, flash: fake("flash").c, decima: fake("decima").c, isFlashRunning: async () => true });
	assert.equal(res.skipped, 1);
	assert.equal(res.written, 1);
	assert.deepEqual(rows(f).map((r) => r.itemId), ["a", "b"]);
});

test("loadActive recorded", async () => {
	let active = true;
	const f = outFile();
	const decima: Classifier = {
		name: "decima",
		classify: async () => {
			const c = fromProbs({ off: 0, low: 1, medium: 0, xhigh: 0 }, 1);
			active = false;
			return c;
		},
	};
	await runBenchmark({
		items: [item("a"), item("b")],
		condition: "busy",
		outFile: f,
		flash: fake("flash").c,
		decima,
		isFlashRunning: async () => true,
		load: { isActive: () => active, stop: async () => {} },
	});
	assert.deepEqual(rows(f).map((r) => r.loadActive), [true, false]);
});

test("both run concurrently", async () => {
	const f = outFile();
	const start = performance.now();
	await runBenchmark({ items: [item("a")], condition: "idle", outFile: f, flash: fake("flash", 100).c, decima: fake("decima", 100).c, isFlashRunning: async () => true });
	// warm-up (100 ms) + one item with both in parallel (~100 ms)
	assert.ok(performance.now() - start < 280);
});

test("gapMs pauses between items, not before the first", async () => {
	const slept: number[] = [];
	await runBenchmark({
		items: [item("a"), item("b"), item("c")],
		condition: "idle",
		outFile: outFile(),
		flash: fake("flash").c,
		decima: fake("decima").c,
		isFlashRunning: async () => true,
		gapMs: 45_000,
		sleep: async (ms) => void slept.push(ms),
	});
	assert.deepEqual(slept, [45_000, 45_000]);
});

test("runExtra writes deem rows and resumes", async () => {
	const { runExtra } = await import("../bench/run.ts");
	const f = outFile();
	const deem: Classifier = { name: "deem", classify: async () => fromProbs({ off: 0, low: 1, medium: 0, xhigh: 0 }, 700) };
	const first = await runExtra({ items: [item("a")], condition: "idle", outFile: f, classifier: deem });
	const second = await runExtra({ items: [item("a"), item("b")], condition: "idle", outFile: f, classifier: deem });
	assert.deepEqual([first.written, second.written, second.skipped], [1, 1, 1]);
	const lines = readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	assert.deepEqual(lines.map((l) => [l.itemId, l.deem.level]), [["a", "low"], ["b", "low"]]);
});
