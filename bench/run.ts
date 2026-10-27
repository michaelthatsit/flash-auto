// Benchmark runner: node bench/run.ts --set dev|test --condition idle|busy
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildClassifierInput } from "../src/input.ts";
import { createFlashClassifier, isFlashRunning, FLASH_PROMPT_VERSION } from "../src/flash.ts";
import { createDecimaClassifier, DECIMA_PROMPT_VERSION } from "../src/decima.ts";
import { createDeemClassifier } from "../src/deem.ts";
import type { Classification, Classifier } from "../src/types.ts";
import type { LabeledItem } from "./labels.ts";
import { startLoad, type LoadHandle } from "./load.ts";

export interface RunRow {
	itemId: string;
	condition: "idle" | "busy";
	flash: Classification;
	decima: Classification;
	/** Joined in from a separate Deem run (results/<set>-<condition>-deem.jsonl). */
	deem?: Classification;
	loadActive: boolean;
	promptVersion: { flash: string; decima: string };
	at: string;
}

interface WaitOpts {
	intervalMs?: number;
	maxWaitMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

/** Polls until flash is the running model; never triggers a swap. */
export async function waitForFlash(isRunning: () => Promise<boolean>, opts: WaitOpts = {}): Promise<boolean> {
	const { intervalMs = 10_000, maxWaitMs = 600_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;
	for (let waited = 0; ; waited += intervalMs) {
		if (await isRunning()) return true;
		if (waited >= maxWaitMs) return false;
		await sleep(intervalMs);
	}
}

/** Last row per item wins, so a resumed run can supersede a failed row. */
export function readRows(file: string): RunRow[] {
	if (!existsSync(file)) return [];
	const byItem = new Map<string, RunRow>();
	for (const line of readFileSync(file, "utf8").split("\n")) if (line.trim()) {
		const row = JSON.parse(line) as RunRow;
		byItem.set(row.itemId, row);
	}
	return [...byItem.values()];
}

export async function runBenchmark(opts: {
	items: LabeledItem[];
	condition: "idle" | "busy";
	outFile: string;
	flash: Classifier;
	decima: Classifier;
	isFlashRunning: () => Promise<boolean>;
	load?: LoadHandle;
	waitOpts?: WaitOpts;
	/** Pause between items, to measure latency at a realistic cadence instead of back-to-back. */
	gapMs?: number;
	sleep?: (ms: number) => Promise<void>;
}): Promise<{ written: number; skipped: number; missing: string[] }> {
	const done = new Set(readRows(opts.outFile).filter((r) => r.flash.ok && r.decima.ok).map((r) => r.itemId));
	const todo = opts.items.filter((it) => !done.has(it.id));
	const missing: string[] = [];
	let written = 0;
	if (todo.length && (await waitForFlash(opts.isFlashRunning, opts.waitOpts))) {
		await opts.flash.classify({ prompt: "hello" }); // warm-up, discarded
	}
	const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	for (const [i, item] of todo.entries()) {
		if (i > 0 && opts.gapMs) await sleep(opts.gapMs);
		if (!(await waitForFlash(opts.isFlashRunning, opts.waitOpts))) {
			missing.push(item.id);
			continue;
		}
		const loadActive = opts.load?.isActive() ?? false;
		const input = buildClassifierInput(item.prompt, item.previous);
		const [flash, decima] = await Promise.all([opts.flash.classify(input), opts.decima.classify(input)]);
		const row: RunRow = {
			itemId: item.id,
			condition: opts.condition,
			flash,
			decima,
			loadActive,
			promptVersion: { flash: FLASH_PROMPT_VERSION, decima: DECIMA_PROMPT_VERSION },
			at: new Date().toISOString(),
		};
		appendFileSync(opts.outFile, JSON.stringify(row) + "\n");
		written++;
	}
	return { written, skipped: opts.items.length - todo.length, missing };
}

export interface ExtraRow {
	itemId: string;
	condition: "idle" | "busy";
	deem: Classification;
	loadActive: boolean;
	at: string;
}

/** One extra classifier on its own (it doesn't share flash's GPU); joined to the main rows by itemId. */
export async function runExtra(opts: {
	items: LabeledItem[];
	condition: "idle" | "busy";
	outFile: string;
	classifier: Classifier;
	load?: LoadHandle;
}): Promise<{ written: number; skipped: number }> {
	const existing = existsSync(opts.outFile) ? readFileSync(opts.outFile, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as ExtraRow) : [];
	const done = new Set(existing.filter((r) => r.deem.ok).map((r) => r.itemId));
	const todo = opts.items.filter((it) => !done.has(it.id));
	if (todo.length) await opts.classifier.classify({ prompt: "hello" }); // warm-up, discarded
	for (const item of todo) {
		const loadActive = opts.load?.isActive() ?? false;
		const deem = await opts.classifier.classify(buildClassifierInput(item.prompt, item.previous));
		const row: ExtraRow = { itemId: item.id, condition: opts.condition, deem, loadActive, at: new Date().toISOString() };
		appendFileSync(opts.outFile, JSON.stringify(row) + "\n");
	}
	return { written: todo.length, skipped: opts.items.length - todo.length };
}

/** Attach Deem results to main rows (last row per item wins); a row missing either side gets no deem. */
export function joinExtra(rows: RunRow[], extraFile: string): RunRow[] {
	if (!existsSync(extraFile)) return rows;
	const byItem = new Map<string, ExtraRow>();
	for (const l of readFileSync(extraFile, "utf8").split("\n")) if (l.trim()) {
		const r = JSON.parse(l) as ExtraRow;
		byItem.set(r.itemId, r);
	}
	return rows.map((r) => {
		const x = byItem.get(r.itemId);
		// Busy only counts when both runs had load.
		return x ? { ...r, deem: x.deem, loadActive: r.loadActive && (r.condition === "idle" || x.loadActive) } : r;
	});
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { set: { type: "string" }, condition: { type: "string" }, "gap-ms": { type: "string" }, limit: { type: "string" }, out: { type: "string" }, classifier: { type: "string" } },
	});
	const set = values.set as "dev" | "test";
	const condition = values.condition as "idle" | "busy";
	if (!["dev", "test"].includes(set) || !["idle", "busy"].includes(condition)) {
		console.error("usage: node bench/run.ts --set dev|test --condition idle|busy [--gap-ms N --limit N --out file]");
		process.exit(2);
	}
	console.log("Keep qwen3.8-27b / qwen3.6-35b idle during the run (a request to them would swap flash out).");
	const items = readFileSync("data/testset.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as LabeledItem).filter((it) => it.split === set)
		.slice(0, values.limit ? Number(values.limit) : undefined);
	let load: LoadHandle | undefined;
	if (condition === "busy") {
		load = startLoad();
		const t0 = Date.now();
		while (!load.isActive()) {
			if (Date.now() - t0 > 30_000) {
				await load.stop();
				console.error("load generator never became active");
				process.exit(1);
			}
			await new Promise((r) => setTimeout(r, 250));
		}
	}
	if (values.classifier === "deem") {
		const res = await runExtra({ items, condition, outFile: values.out ?? `results/${set}-${condition}-deem.jsonl`, classifier: createDeemClassifier(), load });
		await load?.stop();
		console.log(JSON.stringify(res));
		process.exit(0);
	}
	const res = await runBenchmark({
		items,
		condition,
		outFile: values.out ?? `results/${set}-${condition}.jsonl`,
		gapMs: values["gap-ms"] ? Number(values["gap-ms"]) : undefined,
		flash: createFlashClassifier(),
		decima: createDecimaClassifier(),
		isFlashRunning: () => isFlashRunning(),
		load,
	});
	await load?.stop();
	console.log(JSON.stringify(res));
}
