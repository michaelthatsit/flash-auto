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

type Msg = DecideInput["messages"][number];

// pi hands the router extension messages and summaries as role "user" too (convertToLlm).
const SUMMARY_PREFIXES = [
	"The conversation history before this point was compacted into the following summary:",
	"The following is a summary of a branch that this conversation came back from:",
];

/**
 * The message the user typed: the first non-summary message in the trailing run of
 * user-role messages (extensions append their messages after the prompt).
 */
function typedMessage(messages: readonly Msg[]): { typed: number; runStart: number } {
	let runStart = messages.length;
	while (runStart > 0 && messages[runStart - 1].role === "user") runStart--;
	for (let i = runStart; i < messages.length; i++) {
		const text = textOf(messages[i].content);
		if (!SUMMARY_PREFIXES.some((p) => text.startsWith(p))) return { typed: i, runStart };
	}
	return { typed: -1, runStart };
}

/**
 * Steering = typed while tools were running: the run follows tool results of an assistant
 * that stopped for tool use, and none of them is pi's abort marker. Aborted turns are new prompts.
 */
function isSteering(messages: readonly Msg[], runStart: number): boolean {
	if (messages[runStart - 1]?.role !== "toolResult") return false;
	let i = runStart - 1;
	while (i >= 0 && messages[i].role === "toolResult") {
		if (textOf(messages[i].content) === "Operation aborted") return false;
		i--;
	}
	const assistant = messages[i] as Msg & { stopReason?: string };
	return assistant?.role === "assistant" && assistant.stopReason === "toolUse";
}

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

	const { typed, runStart } = typedMessage(input.messages);
	const text = typed >= 0 ? textOf(input.messages[typed].content) : "";
	const steering = isSteering(input.messages, runStart);

	if (input.previousLevel && steering) return done({ level: input.previousLevel, source: "steering" });
	if (input.previousLevel && isGoAhead(text)) return done({ level: input.previousLevel, source: "go-ahead" });
	if (!text) return done({ level: fallbackLevel, source: "fallback", error: "no text" });

	const deadline = AbortSignal.any([AbortSignal.timeout(deps.budgetMs ?? ROUTER_BUDGET_MS), ...(input.signal ? [input.signal] : [])]);
	if (!(await untilAbort(deps.isRunning(deadline), deadline, false))) {
		return done({ level: fallbackLevel, source: "fallback", error: deadline.aborted ? "deadline" : "not running" });
	}
	const assistant = input.messages.slice(0, Math.max(runStart, 0)).findLast((m) => m.role === "assistant");
	const timedOut: Classification = { ok: false, error: "timeout", detail: "deadline", latencyMs: 0 };
	const c = await untilAbort(deps.classify(buildClassifierInput(text, assistant ? textOf(assistant.content) : undefined), deadline), deadline, timedOut);
	if (!c.ok) return done({ level: fallbackLevel, source: "fallback", error: `${c.error}: ${c.detail}`.slice(0, 200) });
	return done({ level: c.level, source: "classified", confidence: c.confidence, probs: c.probs });
}

export const isLevel = (x: unknown): x is Level => LEVELS.includes(x as Level);
