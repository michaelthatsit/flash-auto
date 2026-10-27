import { LEVELS, type Level } from "./levels.ts";
import type { ClassifierInput } from "./input.ts";

export type Probs = Record<Level, number>;

export type Classification =
	| { ok: true; probs: Probs; level: Level; confidence: number; latencyMs: number }
	| { ok: false; error: "timeout" | "unavailable" | "http" | "parse"; detail: string; latencyMs: number };

export interface Classifier {
	name: "flash" | "decima" | "deem";
	classify(input: ClassifierInput, signal?: AbortSignal): Promise<Classification>;
}

export function fromProbs(probs: Probs, latencyMs: number): Classification {
	const total = LEVELS.reduce((sum, l) => sum + probs[l], 0);
	const normalised = Object.fromEntries(LEVELS.map((l) => [l, probs[l] / total])) as Probs;
	const level = LEVELS.reduce((best, l) => (normalised[l] > normalised[best] ? l : best));
	return { ok: true, probs: normalised, level, confidence: normalised[level], latencyMs };
}
