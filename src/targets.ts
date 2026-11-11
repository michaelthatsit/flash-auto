// The agent pair: the reasoning level the readout picks implies the engine. off/low go to the MoE (fast,
// always resident; its template only toggles thinking, so pi's `low` means "thinking on"), medium/xhigh go
// to the pi tune, whose template takes reasoning_effort. Spec: pi-web docs/superpowers/specs/2026-11-11-spark-agent-pair-design.md.
import type { Level } from "./levels.ts";

export interface Target {
	physicalId: string;
	thinkingLevel: Level;
}

export const PAIR_TARGETS: Record<Level, Target> = {
	off: { physicalId: "qwen3.6-35b-a3b-sglang", thinkingLevel: "off" },
	low: { physicalId: "qwen3.6-35b-a3b-sglang", thinkingLevel: "low" },
	medium: { physicalId: "qwen3.8-27b-pi", thinkingLevel: "medium" },
	xhigh: { physicalId: "qwen3.8-27b-pi", thinkingLevel: "xhigh" },
};
