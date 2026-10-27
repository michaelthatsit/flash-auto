export interface ClassifierInput {
	prompt: string;
	previous?: string;
}

export const PREVIOUS_MAX_CHARS = 600;
export const PROMPT_MAX_CHARS = 1000;
export const PROMPT_HEAD_CHARS = 700;
export const PROMPT_TAIL_CHARS = 300;
const TRIM_MARKER = "\n…\n";

/** The identical, trimmed input both classifiers receive. */
export function buildClassifierInput(prompt: string, previousAssistant?: string): ClassifierInput {
	const trimmed =
		prompt.length > PROMPT_MAX_CHARS
			? prompt.slice(0, PROMPT_HEAD_CHARS) + TRIM_MARKER + prompt.slice(-PROMPT_TAIL_CHARS)
			: prompt;
	const previous = previousAssistant?.trim();
	return previous ? { prompt: trimmed, previous: previous.slice(-PREVIOUS_MAX_CHARS) } : { prompt: trimmed };
}
