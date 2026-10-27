import { LEVELS, levelDistance, type Level } from "../src/levels.ts";
import { BUDGET_MS, resolveRace } from "../src/race.ts";
import type { LabeledItem } from "./labels.ts";
import type { RunRow } from "./run.ts";

export type Arm = "flash" | "decima" | "deem" | "race" | "race-deem";

export interface Metrics {
	n: number;
	answered: number;
	/** Rates over answered items. */
	exact: number;
	withinOne: number;
	meanDistance: number;
	under: number;
	over: number;
	confusion: Record<Level, Record<Level, number>>; // [true][pred]
	calibration: { lo: number; hi: number; n: number; accuracy: number; meanConf: number }[];
	ece: number;
	latency: { p50: number; p95: number; max: number };
	errors: Record<string, number>;
	withinBudget?: number;
	flashShare?: number;
}

const BUCKETS: [number, number][] = [[0.25, 0.4], [0.4, 0.55], [0.55, 0.7], [0.7, 0.85], [0.85, 1.0001]];

export function percentile(sorted: number[], p: number): number {
	if (!sorted.length) return NaN;
	return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export function computeMetrics(rows: RunRow[], items: Map<string, LabeledItem>, arm: Arm): Metrics {
	const valid = rows.filter((r) => items.has(r.itemId) && !(r.condition === "busy" && !r.loadActive));
	const errors: Record<string, number> = {};
	const count = (c: RunRow["flash"]) => !c.ok && (errors[c.error] = (errors[c.error] ?? 0) + 1);
	const deemArm = arm === "deem" || arm === "race-deem";
	for (const r of valid) {
		if (arm === "flash" || arm.startsWith("race")) count(r.flash);
		if (arm === "decima" || arm === "race") count(r.decima);
		if (deemArm && r.deem) count(r.deem);
	}
	const confusion = Object.fromEntries(LEVELS.map((t) => [t, Object.fromEntries(LEVELS.map((p) => [p, 0]))])) as Metrics["confusion"];
	const answers: { truth: Level; level: Level; conf: number; latency: number; fromFlash: boolean }[] = [];
	for (const r of valid) {
		if (!r.flash.ok || !r.decima.ok) continue;
		if (deemArm && !r.deem?.ok) continue;
		const truth = items.get(r.itemId)!.level;
		if (arm === "race" || arm === "race-deem") {
			const out = resolveRace(r.flash, arm === "race" ? r.decima : r.deem!);
			answers.push({ truth, level: out.level!, conf: NaN, latency: out.addedDelayMs, fromFlash: out.source === "flash" });
		} else {
			const c = r[arm]!;
			if (!c.ok) continue;
			answers.push({ truth, level: c.level, conf: c.confidence, latency: c.latencyMs, fromFlash: arm === "flash" });
		}
	}
	const k = answers.length;
	const rate = (f: (a: (typeof answers)[number]) => boolean) => (k ? answers.filter(f).length / k : NaN);
	for (const a of answers) confusion[a.truth][a.level]++;
	const calibration =
		arm.startsWith("race")
			? []
			: BUCKETS.map(([lo, hi]) => {
					const b = answers.filter((a) => a.conf >= lo && a.conf < hi);
					const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
					return { lo, hi: Math.min(hi, 1), n: b.length, accuracy: mean(b.map((a) => +(a.level === a.truth))), meanConf: mean(b.map((a) => a.conf)) };
				});
	const ece = arm.startsWith("race") ? NaN : calibration.reduce((s, b) => (b.n ? s + (b.n / k) * Math.abs(b.accuracy - b.meanConf) : s), 0);
	const lat = answers.map((a) => a.latency).sort((a, b) => a - b);
	const m: Metrics = {
		n: valid.length,
		answered: k,
		exact: rate((a) => a.level === a.truth),
		withinOne: rate((a) => levelDistance(a.level, a.truth) <= 1),
		meanDistance: k ? answers.reduce((s, a) => s + levelDistance(a.level, a.truth), 0) / k : NaN,
		under: rate((a) => LEVELS.indexOf(a.level) < LEVELS.indexOf(a.truth)),
		over: rate((a) => LEVELS.indexOf(a.level) > LEVELS.indexOf(a.truth)),
		confusion,
		calibration,
		ece,
		latency: { p50: percentile(lat, 0.5), p95: percentile(lat, 0.95), max: lat.at(-1) ?? NaN },
		errors,
	};
	if (arm === "flash") m.withinBudget = rate((a) => a.latency <= BUDGET_MS);
	if (arm.startsWith("race")) m.flashShare = rate((a) => a.fromFlash);
	return m;
}

export function filterItems(
	items: LabeledItem[],
	f: { split?: "dev" | "test"; kind?: "opener" | "follow-up"; includeHandwritten?: boolean; onlyHandwritten?: boolean },
): LabeledItem[] {
	return items.filter(
		(it) =>
			(!f.split || it.split === f.split) &&
			(!f.kind || it.kind === f.kind) &&
			(f.includeHandwritten !== false || !it.handwritten) &&
			(!f.onlyHandwritten || it.handwritten),
	);
}
