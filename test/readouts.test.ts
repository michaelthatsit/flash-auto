import { test } from "node:test";
import assert from "node:assert/strict";
import { readoutMetrics, renderReadouts } from "../bench/readouts.ts";
import { fromProbs } from "../src/types.ts";
import type { RunRow } from "../bench/run.ts";
import type { LabeledItem } from "../bench/labels.ts";

const item = (id: string, level: LabeledItem["level"], handwritten = false): LabeledItem => ({ id, prompt: id, kind: "opener", source: "session", level, reason: "", handwritten, split: "test" });
const row = (itemId: string, level: LabeledItem["level"] | null): RunRow => ({
	itemId,
	condition: "idle",
	flash: level ? fromProbs({ off: 0, low: 0, medium: 0, xhigh: 0, [level]: 1 }, 120) : { ok: false, error: "parse", detail: "", latencyMs: 90 },
	// Decima was not running for the other-engine readout runs: every row carries its failure.
	decima: { ok: false, error: "unavailable", detail: "fetch failed", latencyMs: 1 },
	loadActive: false,
	promptVersion: { flash: "x", decima: "y" },
	at: "",
});

test("readoutMetrics scores the readout on the items it answered, whatever Decima did", () => {
	const items = new Map([item("a", "off"), item("b", "medium"), item("c", "xhigh")].map((i) => [i.id, i]));
	const m = readoutMetrics([row("a", "off"), row("b", "low"), row("c", null)], items);
	assert.equal(m.n, 3);
	assert.equal(m.answered, 2);
	assert.equal(m.exact, 0.5);
	assert.equal(m.under, 0.5);
	assert.deepEqual(m.errors, { parse: 1 });
	assert.equal(m.latency.p50, 120);
});

test("renderReadouts lists every engine per subset and its confusion matrix", () => {
	const items = [item("a", "off"), item("b", "medium", true)];
	const md = renderReadouts("test", items, [{ name: "flash-next", rows: [row("a", "off"), row("b", "medium")] }, { name: "inkling", rows: [row("a", "low"), row("b", "medium")] }]);
	assert.match(md, /## Real messages\n\n\| engine [^\n]*\n\|---[^\n]*\n\| flash-next \| 1\/1 \| 100% \|/);
	assert.match(md, /\| inkling \| 1\/1 \| 0% \| 100% \| 0% \| 100% \|/);
	assert.match(md, /### inkling\n\n\| true/);
	assert.match(md, /\| \*\*off\*\* \| 0 \| 1 \| 0 \| 0 \|/);
});
