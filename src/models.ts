import type { Level } from "./levels.ts";
import { PAIR_TARGETS, type Target } from "./targets.ts";

/** One entry per auto-routed model. A readout model judges each request; the level picks the target. */
export interface AutoModel {
	virtualId: string;
	name: string;
	provider: string;
	/** The engine a decision dispatches to when `targets` has no say (and the fallback engine). */
	physicalId: string;
	/** llama-swap front: used for the /running check and the readout. */
	baseUrl: string;
	/** Model name as llama-swap reports it in /running: the readout refuses to run unless this is ready. */
	swapModel: string;
	/** Model the one-token readout runs on. */
	readoutModel: string;
	/** The smaller context window of the engines a decision can reach. */
	contextWindow: number;
	/** Level → engine and thinking level; absent means every level goes to `physicalId`. */
	targets?: Record<Level, Target>;
}

export const AUTO_MODELS: AutoModel[] = [
	{
		virtualId: "pair-auto",
		name: "Spark pair (auto)",
		provider: "spark",
		physicalId: "qwen3.8-27b-pi",
		baseUrl: "http://localhost:9000",
		swapModel: "qwen3.6-35b-a3b-sglang",
		readoutModel: "qwen3.6-35b-a3b-sglang",
		contextWindow: 262_144,
		targets: PAIR_TARGETS,
	},
	{
		virtualId: "flash-auto",
		name: "Qwen3.8 Flash-Next (auto)",
		provider: "spark",
		physicalId: "qwen3.8-flash-next",
		baseUrl: "http://localhost:9000",
		swapModel: "qwen3.8-flash-next",
		readoutModel: "qwen3.8-flash-next",
		contextWindow: 500_000,
	},
];

/** The virtual models to register: the pair by default, flash-auto only on request. Never both: each router's
 *  fallback dispatches to its own engine, and flash-next and the pair are exclusive in llama-swap. */
export function activeAutoModels(env: Record<string, string | undefined> = process.env): AutoModel[] {
	const want = env.PI_FLASH_AUTO === "1" ? "flash-auto" : "pair-auto";
	return AUTO_MODELS.filter((m) => m.virtualId === want);
}
