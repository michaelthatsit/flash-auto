import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "../bench/report.ts";
import type { RunRow } from "../bench/run.ts";
import type { LabeledItem } from "../bench/labels.ts";
import { FLASH_PROMPT_VERSION } from "../src/flash.ts";
import { DECIMA_PROMPT_VERSION } from "../src/decima.ts";
import { fromProbs } from "../src/types.ts";

const c = fromProbs({ off: 0, low: 1, medium: 0, xhigh: 0 }, 20);
const items: LabeledItem[] = [
	{ id: "a", prompt: "a", kind: "opener", source: "session", level: "low", reason: "", split: "test", handwritten: false },
	{ id: "b", prompt: "b", kind: "follow-up", source: "handwritten", level: "medium", reason: "", split: "test", handwritten: true },
];
const versions = { flash: FLASH_PROMPT_VERSION, decima: DECIMA_PROMPT_VERSION };
const row = (itemId: string, condition: "idle" | "busy", promptVersion = versions): RunRow => ({
	itemId, condition, flash: c, decima: c, loadActive: condition === "busy", promptVersion, at: "",
});

test("report has the race row and prompt versions", () => {
	const md = renderReport({ set: "test", items, rows: { idle: [row("a", "idle"), row("b", "idle")], busy: [row("a", "busy")] } });
	assert.match(md, /\| race \| idle \|/);
	assert.ok(md.includes(FLASH_PROMPT_VERSION) && md.includes(DECIMA_PROMPT_VERSION));
});

test("report refuses rows from different wording", () => {
	assert.throws(
		() => renderReport({ set: "test", items, rows: { idle: [row("a", "idle", { flash: "old", decima: DECIMA_PROMPT_VERSION })], busy: [] } }),
		/prompt version/,
	);
});

test("deem arms appear only when deem results are joined", () => {
	const plain = renderReport({ set: "test", items, rows: { idle: [row("a", "idle")], busy: [] } });
	assert.doesNotMatch(plain, /\| deem \|/);
	const withDeem = renderReport({ set: "test", items, rows: { idle: [{ ...row("a", "idle"), deem: c }], busy: [] } });
	assert.match(withDeem, /\| deem \| idle \|/);
	assert.match(withDeem, /\| race-deem \| idle \|/);
});
