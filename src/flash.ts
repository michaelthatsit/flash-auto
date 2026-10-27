import { createHash } from "node:crypto";
import { LEVELS, LETTERS, LEVEL_DESCRIPTIONS } from "./levels.ts";
import type { ClassifierInput } from "./input.ts";
import { fromProbs, type Classifier, type Probs } from "./types.ts";
import { postJson } from "./http.ts";

export interface FlashOptions {
	baseUrl?: string;
	model?: string;
	timeoutMs?: number;
	fetch?: typeof fetch;
}

const DEFAULTS = { baseUrl: "http://localhost:9000", model: "qwen3.8-flash-next", timeoutMs: 5000 };

const INSTRUCTIONS = [
	"Classify how much reasoning an assistant needs to handle the user's latest message well.",
	...LEVELS.map((l) => `${LETTERS[l]} = ${l}: ${LEVEL_DESCRIPTIONS[l]}`),
].join("\n");

const block = (text: string) => `<<<\n${text.replaceAll(">>>", "> > >")}\n>>>`;

/** Fixed instructions first (prefix-cacheable), then the conversation, then the answer cue. */
export function buildReadoutMessages(input: ClassifierInput): { role: "user"; content: string }[] {
	const parts = [INSTRUCTIONS];
	if (input.previous) parts.push(`Previous assistant message (end):\n${block(input.previous)}`);
	parts.push(`User message:\n${block(input.prompt)}`, "Answer with one letter.");
	return [{ role: "user", content: parts.join("\n\n") }];
}

export function parseLetterProbs(topLogprobs: { token: string; logprob: number }[]): Probs | null {
	const probs: Probs = { off: 0, low: 0, medium: 0, xhigh: 0 };
	for (const { token, logprob } of topLogprobs) {
		const level = LEVELS.find((l) => LETTERS[l] === token.trim());
		if (level) probs[level] += Math.exp(logprob);
	}
	return LEVELS.some((l) => probs[l] > 0) ? probs : null;
}

/** True only if flash is loaded and ready; a timeout or abort counts as not running. */
export async function isFlashRunning(opts: FlashOptions = {}, signal?: AbortSignal): Promise<boolean> {
	const { baseUrl, model } = { ...DEFAULTS, ...opts };
	try {
		const res = await (opts.fetch ?? fetch)(`${baseUrl}/running`, {
			signal: AbortSignal.any([AbortSignal.timeout(2000), ...(signal ? [signal] : [])]),
		});
		const { running } = (await res.json()) as { running?: { model: string; state: string }[] };
		return !!running?.some((r) => r.model === model && r.state === "ready");
	} catch {
		return false;
	}
}

export function createFlashClassifier(opts: FlashOptions = {}): Classifier {
	const { baseUrl, model, timeoutMs } = { ...DEFAULTS, ...opts };
	return {
		name: "flash",
		async classify(input, signal) {
			const body = {
				model,
				messages: buildReadoutMessages(input),
				max_tokens: 1,
				temperature: 0,
				logprobs: true,
				top_logprobs: 20,
				chat_template_kwargs: { enable_thinking: false },
			};
			const res = await postJson(opts.fetch ?? fetch, `${baseUrl}/v1/chat/completions`, body, timeoutMs, signal);
			if (!res.ok) return res;
			const top = res.json?.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs;
			const probs = Array.isArray(top) ? parseLetterProbs(top) : null;
			if (!probs) return { ok: false, error: "parse", detail: JSON.stringify(top ?? null).slice(0, 200), latencyMs: res.latencyMs };
			return fromProbs(probs, res.latencyMs);
		},
	};
}

export const FLASH_PROMPT_VERSION = createHash("sha256")
	.update(JSON.stringify(buildReadoutMessages({ prompt: "{{PROMPT}}", previous: "{{PREVIOUS}}" })))
	.digest("hex")
	.slice(0, 12);
