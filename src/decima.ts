import { createHash } from "node:crypto";
import { LEVELS, LEVEL_DESCRIPTIONS } from "./levels.ts";
import type { ClassifierInput } from "./input.ts";
import { fromProbs, type Classifier, type Probs } from "./types.ts";
import { postJson } from "./http.ts";

export interface DecimaOptions {
	baseUrl?: string;
	timeoutMs?: number;
	fetch?: typeof fetch;
}

const DEFAULTS = { baseUrl: "http://127.0.0.1:8017", timeoutMs: 2000 };

export const DECIMA_INSTRUCTIONS = "How much reasoning does a coding agent need to handle `prompt` well?";

export function buildDecimaRequest(input: ClassifierInput): object {
	return {
		model: "decima-small",
		state: input.previous ? { previous_assistant: input.previous, prompt: input.prompt } : { prompt: input.prompt },
		questions: { level: { type: "choice", instructions: DECIMA_INSTRUCTIONS, criteria: LEVEL_DESCRIPTIONS } },
	};
}

export function parseDecimaResponse(json: unknown): Probs | null {
	const p = (json as any)?.answers?.level?.probabilities;
	if (!p || !LEVELS.every((l) => typeof p[l] === "number")) return null;
	return Object.fromEntries(LEVELS.map((l) => [l, p[l]])) as Probs;
}

export function createDecimaClassifier(opts: DecimaOptions = {}): Classifier {
	const { baseUrl, timeoutMs } = { ...DEFAULTS, ...opts };
	return {
		name: "decima",
		async classify(input, signal) {
			const res = await postJson(opts.fetch ?? fetch, `${baseUrl}/v1/systemone`, buildDecimaRequest(input), timeoutMs, signal);
			if (!res.ok) return res;
			const probs = parseDecimaResponse(res.json);
			if (!probs) return { ok: false, error: "parse", detail: JSON.stringify(res.json).slice(0, 200), latencyMs: res.latencyMs };
			return fromProbs(probs, res.latencyMs);
		},
	};
}

export const DECIMA_PROMPT_VERSION = createHash("sha256")
	.update(DECIMA_INSTRUCTIONS + JSON.stringify(LEVEL_DESCRIPTIONS))
	.digest("hex")
	.slice(0, 12);
