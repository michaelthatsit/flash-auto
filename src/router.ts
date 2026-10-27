import { LEVELS, type Level } from "./levels.ts";
import { buildClassifierInput, type ClassifierInput } from "./input.ts";
import type { Classification } from "./types.ts";
import { isGoAhead } from "./goahead.ts";

export const ROUTER_BUDGET_MS = 500;
const DEFAULT_LEVEL: Level = "medium";

export interface Decision {
	level: Level;
	source: "classified" | "go-ahead" | "steering" | "fallback" | "sticky";
	confidence?: number;
	probs?: Record<Level, number>;
	latencyMs: number;
	error?: string;
}

export interface RouterState {
	level: Level;
	source: Decision["source"];
	confidence?: number;
}

export interface DecideInput {
	reason: "user" | "continuation" | "retry" | "direct";
	messages: readonly { role: string; content: unknown }[];
	previousLevel?: Level;
	signal?: AbortSignal;
}

export interface DecideDeps {
	isRunning(signal: AbortSignal): Promise<boolean>;
	classify(input: ClassifierInput, signal: AbortSignal): Promise<Classification>;
	budgetMs?: number;
}

export function textOf(content: unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content
		.filter((b) => b?.type === "text" && typeof b.text === "string")
		.map((b) => b.text)
		.join("\n")
		.trim();
}

const hasToolCall = (content: unknown) => Array.isArray(content) && content.some((b) => b?.type === "toolCall");

/** Resolves with `onAbort` as soon as the signal fires, even if `p` ignores it. */
function untilAbort<T>(p: Promise<T>, signal: AbortSignal, onAbort: T): Promise<T> {
	if (signal.aborted) return Promise.resolve(onAbort);
	return new Promise((resolve) => {
		const stop = () => resolve(onAbort);
		signal.addEventListener("abort", stop, { once: true });
		p.then(resolve, () => resolve(onAbort)).finally(() => signal.removeEventListener("abort", stop));
	});
}

/** The spec's routing table. Never throws; every failure path yields a level. */
export async function decide(input: DecideInput, deps: DecideDeps): Promise<Decision> {
	const start = performance.now();
	const fallbackLevel = input.previousLevel ?? DEFAULT_LEVEL;
	const done = (d: Omit<Decision, "latencyMs">): Decision => ({ ...d, latencyMs: performance.now() - start });

	if (input.reason === "continuation" || input.reason === "retry") return done({ level: fallbackLevel, source: "sticky" });
	if (input.reason === "direct") return done({ level: fallbackLevel, source: "fallback" });

	const lastUser = input.messages.findLastIndex((m) => m.role === "user");
	const text = lastUser >= 0 ? textOf(input.messages[lastUser].content) : "";
	const before = lastUser > 0 ? input.messages[lastUser - 1] : undefined;
	const steering = before?.role === "toolResult" || (before?.role === "assistant" && hasToolCall(before.content));

	if (input.previousLevel && steering) return done({ level: input.previousLevel, source: "steering" });
	if (input.previousLevel && isGoAhead(text)) return done({ level: input.previousLevel, source: "go-ahead" });
	if (!text) return done({ level: fallbackLevel, source: "fallback", error: "no text" });

	const deadline = AbortSignal.any([AbortSignal.timeout(deps.budgetMs ?? ROUTER_BUDGET_MS), ...(input.signal ? [input.signal] : [])]);
	if (!(await untilAbort(deps.isRunning(deadline), deadline, false))) {
		return done({ level: fallbackLevel, source: "fallback", error: deadline.aborted ? "deadline" : "not running" });
	}
	const assistant = input.messages.slice(0, Math.max(lastUser, 0)).findLast((m) => m.role === "assistant");
	const timedOut: Classification = { ok: false, error: "timeout", detail: "deadline", latencyMs: 0 };
	const c = await untilAbort(deps.classify(buildClassifierInput(text, assistant ? textOf(assistant.content) : undefined), deadline), deadline, timedOut);
	if (!c.ok) return done({ level: fallbackLevel, source: "fallback", error: `${c.error}: ${c.detail}`.slice(0, 200) });
	return done({ level: c.level, source: "classified", confidence: c.confidence, probs: c.probs });
}

export const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);
