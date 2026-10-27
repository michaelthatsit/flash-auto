export const LEVELS = ["off", "low", "medium", "xhigh"] as const;
export type Level = (typeof LEVELS)[number];

export const LETTERS: Record<Level, "A" | "B" | "C" | "D"> = { off: "A", low: "B", medium: "C", xhigh: "D" };

/** Fixed by the design spec; both classifiers get exactly these. */
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
	off: "greeting, thanks, trivial lookup or command explanation",
	low: "simple single-step change or question",
	medium: "ordinary feature or fix that needs some investigation",
	xhigh: "hard debugging, design, cross-cutting multi-file work",
};

export function levelDistance(a: Level, b: Level): number {
	return Math.abs(LEVELS.indexOf(a) - LEVELS.indexOf(b));
}
