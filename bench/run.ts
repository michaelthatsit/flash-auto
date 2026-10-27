// Benchmark runner: node bench/run.ts --set dev|test --condition idle|busy
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { buildClassifierInput } from "../src/input.ts";
import { createFlashClassifier, isFlashRunning, FLASH_PROMPT_VERSION } from "../src/flash.ts";
import { createDecimaClassifier, DECIMA_PROMPT_VERSION } from "../src/decima.ts";
import type { Classification, Classifier } from "../src/types.ts";
import type { LabeledItem } from "./labels.ts";
import { startLoad, type LoadHandle } from "./load.ts";

export interface RunRow {
	itemId: string;
	condition: "idle" | "busy";
	flash: Classification;
	decima: Classification;
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
}): Promise<{ written: number; skipped: number; missing: string[] }> {
	const done = new Set(readRows(opts.outFile).filter((r) => r.flash.ok && r.decima.ok).map((r) => r.itemId));
	const todo = opts.items.filter((it) => !done.has(it.id));
	const missing: string[] = [];
	let written = 0;
	if (todo.length && (await waitForFlash(opts.isFlashRunning, opts.waitOpts))) {
		await opts.flash.classify({ prompt: "hello" }); // warm-up, discarded
	}
	for (const item of todo) {
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

if (import.meta.main) {
	const { values } = parseArgs({ options: { set: { type: "string" }, condition: { type: "string" } } });
	const set = values.set as "dev" | "test";
	const condition = values.condition as "idle" | "busy";
	if (!["dev", "test"].includes(set) || !["idle", "busy"].includes(condition)) {
		console.error("usage: node bench/run.ts --set dev|test --condition idle|busy");
		process.exit(2);
	}
	console.log("Keep qwen3.8-27b / qwen3.6-35b idle during the run (a request to them would swap flash out).");
	const items = readFileSync("data/testset.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l) as LabeledItem).filter((it) => it.split === set);
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
	const res = await runBenchmark({
		items,
		condition,
		outFile: `results/${set}-${condition}.jsonl`,
		flash: createFlashClassifier(),
		decima: createDecimaClassifier(),
		isFlashRunning: () => isFlashRunning(),
		load,
	});
	await load?.stop();
	console.log(JSON.stringify(res));
}
