// The readout classifier for a model: Inkling needs its own request shape (inkling.ts); every Qwen engine takes the
// chat-completion readout with thinking switched off (flash.ts).
import { createFlashClassifier, type FlashOptions } from "./flash.ts";
import { createInklingClassifier } from "./inkling.ts";
import type { Classifier } from "./types.ts";

export const isInklingModel = (model: string | undefined) => /^(?:spark\/)?inkling\b/.test(model ?? "");

export function createReadoutClassifier(opts: FlashOptions = {}): Classifier {
	return isInklingModel(opts.model) ? createInklingClassifier(opts) : createFlashClassifier(opts);
}
