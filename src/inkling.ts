// The one-token readout on Inkling 2 Mini. Inkling opens every reply with its role token and then a thinking block,
// even at reasoning effort 0 (probed 2026-11-22: `<|message_model|>` then `<|content_thinking|>` at p≈1), so a chat
// completion's first token is never the letter. The readout therefore renders the chat template itself, ends the
// prompt with the model's text-content opener, and asks /v1/completions for one token: the letter comes first.
import { buildReadoutMessages, parseLetterProbs, type FlashOptions } from "./flash.ts";
import type { ClassifierInput } from "./input.ts";
import { fromProbs, type Classifier } from "./types.ts";
import { postJson } from "./http.ts";

const DEFAULTS = { baseUrl: "http://localhost:9000", model: "inkling-2-mini", timeoutMs: 5000 };

// thinkingmachines/Inkling-2-Mini chat_template.jinja at revision ed40e7da: one system message carrying the effort
// (`none` → 0), then each message as <role token><content token>text<|end_message|>. The generation prompt adds
// nothing; the model emits <|message_model|> itself, which is why the readout appends it with the text opener.
const EFFORT_NONE = "<|message_system|><|content_text|>Thinking effort level: 0<|end_message|>";
const USER_OPEN = "<|message_user|><|content_text|>";
const END = "<|end_message|>";
export const ANSWER_OPEN = "<|message_model|><|content_text|>";

/** A special-token string inside the user's text would be read as structure; breaking the `<|` keeps it text. */
const neutralise = (text: string) => text.replaceAll("<|", "< |");

/** The readout prompt (the same words flash reads) rendered as Inkling's template with thinking off, ending where the
 *  answer text begins. */
export function renderInklingPrompt(input: ClassifierInput): string {
	const [message] = buildReadoutMessages(input);
	return `${EFFORT_NONE}${USER_OPEN}${neutralise(message.content)}${END}${ANSWER_OPEN}`;
}

export function createInklingClassifier(opts: FlashOptions = {}): Classifier {
	const { baseUrl, model, timeoutMs } = { ...DEFAULTS, ...opts };
	return {
		name: "inkling",
		async classify(input, signal) {
			const body = { model, prompt: renderInklingPrompt(input), max_tokens: 1, temperature: 0, logprobs: 20 };
			const res = await postJson(opts.fetch ?? fetch, `${baseUrl}/v1/completions`, body, timeoutMs, signal);
			if (!res.ok) return res;
			// The completions shape: top_logprobs[0] is { token: logprob } for the first generated token.
			const top = res.json?.choices?.[0]?.logprobs?.top_logprobs?.[0];
			const entries = top && typeof top === "object" ? Object.entries(top as Record<string, number>).map(([token, logprob]) => ({ token, logprob })) : null;
			const probs = entries ? parseLetterProbs(entries) : null;
			if (!probs) return { ok: false, error: "parse", detail: JSON.stringify(top ?? null).slice(0, 200), latencyMs: res.latencyMs };
			return fromProbs(probs, res.latencyMs);
		},
	};
}
