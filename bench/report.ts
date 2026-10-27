// Benchmark report: node bench/report.ts --set dev|test  → results/REPORT-<set>.md
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { LEVELS } from "../src/levels.ts";
import { BUDGET_MS } from "../src/race.ts";
import { FLASH_PROMPT_VERSION } from "../src/flash.ts";
import { DECIMA_PROMPT_VERSION } from "../src/decima.ts";
import { computeMetrics, filterItems, type Arm, type Metrics } from "./metrics.ts";
import { readRows, type RunRow } from "./run.ts";
import type { LabeledItem } from "./labels.ts";

type Condition = "idle" | "busy";
const ARMS: Arm[] = ["flash", "decima", "race"];
const CONDITIONS: Condition[] = ["idle", "busy"];

const pct = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
const ms = (x: number) => (Number.isNaN(x) ? "–" : `${Math.round(x)}`);

function headline(rows: Record<Condition, RunRow[]>, items: LabeledItem[]): string {
	const map = new Map(items.map((i) => [i.id, i]));
	const lines = [
		`| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤${BUDGET_MS} ms | race used flash |`,
		"|---|---|---|---|---|---|---|---|---|---|---|",
	];
	for (const arm of ARMS)
		for (const cond of CONDITIONS) {
			if (!rows[cond].length) continue;
			const m = computeMetrics(rows[cond], map, arm);
			lines.push(
				`| ${arm} | ${cond} | ${m.answered}/${m.n} | ${pct(m.exact)} | ${pct(m.withinOne)} | ${pct(m.under)} | ${pct(m.over)} | ${ms(m.latency.p50)} | ${ms(m.latency.p95)} | ${pct(m.withinBudget)} | ${pct(m.flashShare)} |`,
			);
		}
	return lines.join("\n");
}

function confusion(m: Metrics): string {
	return [
		`| true ↓ / predicted → | ${LEVELS.join(" | ")} |`,
		`|---|${LEVELS.map(() => "---").join("|")}|`,
		...LEVELS.map((t) => `| **${t}** | ${LEVELS.map((p) => m.confusion[t][p]).join(" | ")} |`),
	].join("\n");
}

function calibration(m: Metrics): string {
	return [
		"| confidence | items | accuracy | mean confidence |",
		"|---|---|---|---|",
		...m.calibration.map((b) => `| ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} | ${b.n} | ${pct(b.accuracy)} | ${pct(b.meanConf)} |`),
		"",
		`ECE: ${Number.isNaN(m.ece) ? "–" : m.ece.toFixed(3)}`,
	].join("\n");
}

export function renderReport(input: { set: "dev" | "test"; items: LabeledItem[]; rows: Record<Condition, RunRow[]> }): string {
	for (const r of [...input.rows.idle, ...input.rows.busy]) {
		if (r.promptVersion?.flash !== FLASH_PROMPT_VERSION || r.promptVersion?.decima !== DECIMA_PROMPT_VERSION) {
			throw new Error(`prompt version mismatch on ${r.itemId}: rows ${JSON.stringify(r.promptVersion)} vs current flash ${FLASH_PROMPT_VERSION} / decima ${DECIMA_PROMPT_VERSION}; re-run the set`);
		}
	}
	const items = filterItems(input.items, { split: input.set });
	const real = filterItems(items, { includeHandwritten: false });
	const synthetic = filterItems(items, { onlyHandwritten: true });
	const answeredIds = new Set([...input.rows.idle, ...input.rows.busy].map((r) => r.itemId));
	const missing = items.filter((i) => !answeredIds.has(i.id)).map((i) => i.id);
	const map = new Map(items.map((i) => [i.id, i]));
	const idleAll = (arm: Arm) => computeMetrics(input.rows.idle, map, arm);
	const s: string[] = [
		`# Classifier benchmark — ${input.set} set`,
		"",
		`Prompt versions: flash \`${FLASH_PROMPT_VERSION}\`, decima \`${DECIMA_PROMPT_VERSION}\`. Budget ${BUDGET_MS} ms. Items: ${items.length} (${real.length} real, ${synthetic.length} synthetic). Missing: ${missing.length ? missing.join(", ") : "none"}.`,
		"",
		"Rates are over items both classifiers answered. *Too little* = predicted below the label (risk of wrong answers); *too much* = above it (only slower). Busy rows where the load stream had stopped are excluded.",
		"",
		"## Headline: real messages",
		"",
		headline(input.rows, real),
		"",
		"## Synthetic prompts",
		"",
		headline(input.rows, synthetic),
		"",
		"## All items",
		"",
		headline(input.rows, items),
		"",
		"## Openers vs follow-ups (all items)",
		"",
		"### Openers",
		"",
		headline(input.rows, filterItems(items, { kind: "opener" })),
		"",
		"### Follow-ups",
		"",
		headline(input.rows, filterItems(items, { kind: "follow-up" })),
		"",
		"## Confusion matrices (all items, idle)",
		"",
		...ARMS.flatMap((arm) => [`### ${arm}`, "", confusion(idleAll(arm)), ""]),
		"## Calibration (all items, idle)",
		"",
		...(["flash", "decima"] as const).flatMap((arm) => [`### ${arm}`, "", calibration(idleAll(arm)), ""]),
		"## Errors",
		"",
		...CONDITIONS.flatMap((cond) =>
			(["flash", "decima"] as const).map((arm) => `- ${arm} ${cond}: ${JSON.stringify(computeMetrics(input.rows[cond], map, arm).errors)}`),
		),
		"",
	];
	return s.join("\n");
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { set: { type: "string" } } });
	const set = values.set as "dev" | "test";
	if (set !== "dev" && set !== "test") {
		console.error("usage: node bench/report.ts --set dev|test");
		process.exit(2);
	}
	const items = readFileSync("data/testset.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as LabeledItem);
	const rows = { idle: readRows(`results/${set}-idle.jsonl`), busy: readRows(`results/${set}-busy.jsonl`) };
	try {
		writeFileSync(`results/REPORT-${set}.md`, renderReport({ set, items, rows }));
		console.log(`wrote results/REPORT-${set}.md`);
	} catch (err) {
		console.error(String(err));
		process.exit(1);
	}
}
