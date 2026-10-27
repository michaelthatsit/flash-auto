import type { Level } from "./levels.ts";
import type { ClassifierInput } from "./input.ts";
import type { Classification, Classifier } from "./types.ts";

export const BUDGET_MS = 500;

export type RaceOutcome = { source: "flash" | "decima" | "none"; level: Level | null; addedDelayMs: number };

/** Flash's answer if it arrived within budget, else Decima's; the delay never exceeds the budget. */
export function resolveRace(flash: Classification, decima: Classification, budgetMs = BUDGET_MS): RaceOutcome {
	if (flash.ok && flash.latencyMs <= budgetMs) return { source: "flash", level: flash.level, addedDelayMs: flash.latencyMs };
	if (decima.ok) {
		const flashSettled = flash.ok ? budgetMs : flash.latencyMs;
		return { source: "decima", level: decima.level, addedDelayMs: Math.min(budgetMs, Math.max(decima.latencyMs, flashSettled)) };
	}
	return { source: "none", level: null, addedDelayMs: budgetMs };
}

/** Runs both at once; both are aborted at the budget so the call never outlasts it. */
export async function raceClassify(
	flash: Classifier,
	decima: Classifier,
	input: ClassifierInput,
	budgetMs = BUDGET_MS,
	signal?: AbortSignal,
): Promise<RaceOutcome & { flash: Classification; decima: Classification }> {
	const deadline = AbortSignal.any([AbortSignal.timeout(budgetMs), ...(signal ? [signal] : [])]);
	const [f, d] = await Promise.all([flash.classify(input, deadline), decima.classify(input, deadline)]);
	return { ...resolveRace(f, d, budgetMs), flash: f, decima: d };
}
