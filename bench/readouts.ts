// Readout comparison across engines: node bench/readouts.ts [--set test]  → results/REPORT-readouts.md
// Each results/<set>-idle[-<engine>].jsonl is one run of the one-token readout on one engine (bench/run.ts --model),
// with the readout in the row's `flash` slot. Rates are over the items that engine's readout answered; Decima's
// column in those rows is ignored (it was not running for the other-engine runs).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { LEVELS } from "../src/levels.ts";
import { computeMetrics, type Metrics } from "./metrics.ts";
import { readRows, type RunRow } from "./run.ts";
import type { LabeledItem } from "./labels.ts";

/** The engines in the order they were added; the file suffix is the one `run.ts --out` was given. */
export const ENGINES: { name: string; suffix: string }[] = [
	{ name: "flash-next", suffix: "" },
	{ name: "27b-pi", suffix: "-27b-pi" },
	{ name: "35b-a3b", suffix: "-35b" },
	{ name: "inkling", suffix: "-inkling" },
];

/** The readout arm's metrics on its own: computeMetrics counts an item only when both classifiers of the row
 *  answered (its arms are compared on the same items), so the readout stands in for Decima here. */
export function readoutMetrics(rows: RunRow[], items: Map<string, LabeledItem>): Metrics {
	return computeMetrics(rows.map((r) => ({ ...r, decima: r.flash })), items, "flash");
}

const pct = (x: number) => (Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
const ms = (x: number) => (Number.isNaN(x) ? "–" : `${Math.round(x)}`);

export function renderReadouts(set: "dev" | "test", items: LabeledItem[], runs: { name: string; rows: RunRow[] }[]): string {
	const map = new Map(items.map((i) => [i.id, i]));
	const subsets: [string, (i: LabeledItem) => boolean][] = [
		["Real messages", (i) => !i.handwritten],
		["Synthetic prompts", (i) => i.handwritten],
		["All items", () => true],
		["Openers", (i) => i.kind === "opener"],
		["Follow-ups", (i) => i.kind === "follow-up"],
	];
	const out = [
		`# One-token readout by engine — ${set} set`,
		"",
		`Items: ${items.length} (${items.filter((i) => !i.handwritten).length} real, ${items.filter((i) => i.handwritten).length} synthetic). Idle condition. Rates are over the items the engine's readout answered. *Too little* = predicted below the label (risk of wrong answers); *too much* = above it (only slower).`,
		"",
	];
	for (const [title, pick] of subsets) {
		out.push(`## ${title}`, "", "| engine | answered | exact | within one | too little | too much | p50 ms | p95 ms |", "|---|---|---|---|---|---|---|---|");
		for (const run of runs) {
			const m = readoutMetrics(run.rows.filter((r) => map.has(r.itemId) && pick(map.get(r.itemId)!)), map);
			out.push(`| ${run.name} | ${m.answered}/${m.n} | ${pct(m.exact)} | ${pct(m.withinOne)} | ${pct(m.under)} | ${pct(m.over)} | ${ms(m.latency.p50)} | ${ms(m.latency.p95)} |`);
		}
		out.push("");
	}
	out.push("## Confusion (all items)", "");
	for (const run of runs) {
		const m = readoutMetrics(run.rows, map);
		out.push(`### ${run.name}`, "", `| true ↓ / predicted → | ${LEVELS.join(" | ")} |`, `|---|${LEVELS.map(() => "---").join("|")}|`);
		for (const t of LEVELS) out.push(`| **${t}** | ${LEVELS.map((p) => m.confusion[t][p]).join(" | ")} |`);
		out.push("", `Errors: ${JSON.stringify(m.errors)}; ECE ${Number.isNaN(m.ece) ? "–" : m.ece.toFixed(3)}`, "");
	}
	return out.join("\n");
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { set: { type: "string", default: "test" } } });
	const set = values.set as "dev" | "test";
	if (set !== "dev" && set !== "test") {
		console.error("usage: node bench/readouts.ts [--set dev|test]");
		process.exit(2);
	}
	const items = readFileSync("data/testset.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as LabeledItem).filter((i) => i.split === set);
	const runs = ENGINES.map((e) => ({ name: e.name, file: `results/${set}-idle${e.suffix}.jsonl` }))
		.filter((e) => existsSync(e.file))
		.map((e) => ({ name: e.name, rows: readRows(e.file) }));
	writeFileSync("results/REPORT-readouts.md", renderReadouts(set, items, runs));
	console.log(`wrote results/REPORT-readouts.md (${runs.map((r) => r.name).join(", ")})`);
}
