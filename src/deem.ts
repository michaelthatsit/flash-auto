import { createDecimaClassifier, type DecimaOptions } from "./decima.ts";
import type { Classifier } from "./types.ts";

/** Deem-4B served by `jevalt serve` on the CPU; same question and wire format as Decima. */
export function createDeemClassifier(opts: DecimaOptions = {}): Classifier {
	return createDecimaClassifier({ baseUrl: "http://127.0.0.1:8018", timeoutMs: 10_000, model: "Deem-4B", name: "deem", ...opts });
}
