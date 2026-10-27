// Live check: node bench/smoke.ts flash|decima "<prompt>"
import { buildClassifierInput } from "../src/input.ts";
import { createFlashClassifier, isFlashRunning } from "../src/flash.ts";

const [which, prompt] = process.argv.slice(2);
if (!prompt) {
	console.error('usage: node bench/smoke.ts flash|decima "<prompt>"');
	process.exit(2);
}
const input = buildClassifierInput(prompt);
if (which === "flash") {
	if (!(await isFlashRunning())) {
		console.error("flash is not the running model; refusing to trigger a swap");
		process.exit(1);
	}
	console.log(JSON.stringify(await createFlashClassifier().classify(input)));
} else {
	console.error(`unknown classifier: ${which}`);
	process.exit(2);
}
