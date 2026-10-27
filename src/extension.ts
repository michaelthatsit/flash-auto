// pi extension: registers one auto-routed virtual model per AUTO_MODELS entry (spark/flash-auto).
import { homedir } from "node:os";
import { join } from "node:path";
import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";
import type { Level } from "./levels.ts";
import { AUTO_MODELS, type AutoModel } from "./models.ts";
import { createFlashClassifier, isFlashRunning } from "./flash.ts";
import { decide, isLevel, type DecideDeps, type RouterState } from "./router.ts";
import { appendDecision } from "./log.ts";

export const DECISION_LOG = join(homedir(), ".pi", "agent", "flash-auto.jsonl");

/** The slice of pi's extension context the router uses. */
export interface RouteCtx {
	modelRegistry: { find(provider: string, id: string): Model<Api> | undefined };
	sessionManager?: { getSessionFile(): string | undefined };
}

const PI_TO_LEVEL: Partial<Record<ModelThinkingLevel, Level>> = { minimal: "low", high: "xhigh", max: "xhigh" };
const toLevel = (l?: ModelThinkingLevel): Level | undefined => (isLevel(l) ? l : l ? PI_TO_LEVEL[l] : undefined);

export function createRoute(auto: AutoModel, deps: { decideDeps: DecideDeps; log: (entry: object) => void }) {
	return async (request: ModelRouteRequest<RouterState>, ctx: RouteCtx): Promise<ModelRoute<RouterState>> => {
		const model = ctx.modelRegistry.find(auto.provider, auto.physicalId);
		if (!model) throw new Error(`${auto.virtualId}: ${auto.provider}/${auto.physicalId} is not in pi's model registry`);
		const previousLevel = toLevel(request.state?.level) ?? toLevel(request.previous?.thinkingLevel);
		const d = await decide(
			{ reason: request.reason, messages: request.messages as DecideInputMessages, previousLevel, signal: request.signal },
			deps.decideDeps,
		);
		if (request.reason === "user") {
			deps.log({
				ts: new Date().toISOString(),
				session: ctx.sessionManager?.getSessionFile(),
				virtual: auto.virtualId,
				level: d.level,
				source: d.source,
				confidence: d.confidence,
				probs: d.probs,
				latencyMs: Math.round(d.latencyMs),
				error: d.error,
			});
		}
		const prev = request.state;
		const same = prev && prev.level === d.level && prev.source === d.source && prev.confidence === d.confidence;
		const state: RouterState = same ? prev : { level: d.level, source: d.source, ...(d.confidence !== undefined ? { confidence: d.confidence } : {}) };
		return { model, thinkingLevel: d.level, state };
	};
}
type DecideInputMessages = Parameters<typeof decide>[0]["messages"];

export default function (pi: ExtensionAPI) {
	for (const auto of AUTO_MODELS) {
		const flashOpts = { baseUrl: auto.baseUrl, model: auto.swapModel };
		const classifier = createFlashClassifier(flashOpts);
		const route = createRoute(auto, {
			decideDeps: { isRunning: (signal) => isFlashRunning(flashOpts, signal), classify: (input, signal) => classifier.classify(input, signal) },
			log: (entry) => appendDecision(DECISION_LOG, entry),
		});
		pi.registerVirtualModel<RouterState>({
			provider: auto.provider,
			id: auto.virtualId,
			name: auto.name,
			thinkingLevels: ["medium"],
			contextWindow: 500_000,
			input: ["text", "image"],
			route: (request, ctx) => route(request, ctx as RouteCtx),
		});
	}
}
