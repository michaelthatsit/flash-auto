import { test } from "node:test";
import assert from "node:assert/strict";
import { assignSplits, parseLabelSheet, renderLabelSheet, type LabeledItem } from "../bench/labels.ts";
import { LEVELS, type Level } from "../src/levels.ts";

type Draft = Omit<LabeledItem, "split">;

const items: Draft[] = [
	{ id: "a.jsonl#1", prompt: "hi", kind: "opener", source: "session", level: "off", reason: "greeting", handwritten: false },
	{
		id: "a.jsonl#2",
		prompt: "line one\n\nlevel: off\nline four",
		previous: "Plan:\n1. do X\n2. do Y",
		kind: "follow-up",
		source: "session",
		level: "xhigh",
		reason: "multi-file refactor",
		handwritten: false,
	},
	{ id: "hand-1", prompt: "design a cache", kind: "opener", source: "handwritten", level: "medium", reason: "filler", handwritten: true },
];

test("render → parse round-trips", () => {
	assert.deepEqual(parseLabelSheet(renderLabelSheet(items)), items);
});

test("unknown level throws with the item id", () => {
	const md = renderLabelSheet([items[0]]).replace("level: off", "level: high");
	assert.throws(() => parseLabelSheet(md), /a\.jsonl#1/);
});

function many(): Draft[] {
	const counts: Record<Level, number> = { off: 3, low: 17, medium: 20, xhigh: 10 };
	return LEVELS.flatMap((level) =>
		Array.from({ length: counts[level] }, (_, i) => ({
			id: `${level}-${i}`,
			prompt: `${level} ${i}`,
			kind: "opener" as const,
			source: "session" as const,
			level,
			reason: "r",
			handwritten: false,
		})),
	);
}

test("assignSplits: 15 dev, deterministic, every level with ≥3 items in dev", () => {
	const a = assignSplits(many());
	assert.equal(a.filter((x) => x.split === "dev").length, 15);
	assert.deepEqual(a, assignSplits(many()));
	for (const level of LEVELS) assert.ok(a.some((x) => x.level === level && x.split === "dev"), level);
});
