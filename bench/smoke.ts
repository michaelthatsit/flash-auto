// Live check: node bench/smoke.ts flash|inkling|decima|deem "<prompt>"
import { buildClassifierInput } from "../src/input.ts";
import { createFlashClassifier, isFlashRunning } from "../src/flash.ts";
import { createInklingClassifier } from "../src/inkling.ts";
import { createDecimaClassifier } from "../src/decima.ts";
import { createDeemClassifier } from "../src/deem.ts";

const [which, prompt] = process.argv.slice(2);
if (!prompt) {
	console.error('usage: node bench/smoke.ts flash|inkling|decima|deem "<prompt>"');
	process.exit(2);
}
const input = buildClassifierInput(prompt);
if (which === "flash") {
	if (!(await isFlashRunning())) {
		console.error("flash is not the running model; refusing to trigger a swap");
		process.exit(1);
	}
	console.log(JSON.stringify(await createFlashClassifier().classify(input)));
} else if (which === "inkling") {
	if (!(await isFlashRunning({ model: "inkling-2-mini" }))) {
		console.error("inkling-2-mini is not the running model; refusing to trigger a swap");
		process.exit(1);
	}
	console.log(JSON.stringify(await createInklingClassifier().classify(input)));
} else if (which === "deem") {
	console.log(JSON.stringify(await createDeemClassifier().classify(input)));
} else if (which === "decima") {
	console.log(JSON.stringify(await createDecimaClassifier().classify(input)));
} else {
	console.error(`unknown classifier: ${which}`);
	process.exit(2);
}
