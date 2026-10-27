export const LEVELS = ["off", "low", "medium", "xhigh"] as const;
export type Level = (typeof LEVELS)[number];

export const LETTERS: Record<Level, "A" | "B" | "C" | "D"> = { off: "A", low: "B", medium: "C", xhigh: "D" };

/** Fixed by the design spec; both classifiers get exactly these. */
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
	off: "greeting, thanks, acknowledgement, or a quick fact or lookup",
	low: "a simple question or single-step task",
	medium: "a question or task that needs some looking into, a few steps, or comparing options",
	xhigh: "a hard problem: tricky debugging, planning or design with many moving parts, or careful multi-step reasoning or math",
};

export function levelDistance(a: Level, b: Level): number {
	return Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(b));
}
