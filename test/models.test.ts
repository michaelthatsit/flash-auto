import { test } from "node:test";
import assert from "node:assert/strict";
import { activeAutoModels, AUTO_MODELS } from "../src/models.ts";

test("pair-auto is the active virtual model; flash-auto only when PI_FLASH_AUTO=1", () => {
	assert.deepEqual(activeAutoModels({}).map((m) => m.virtualId), ["pair-auto"]);
	assert.deepEqual(activeAutoModels({ PI_FLASH_AUTO: "1" }).map((m) => m.virtualId), ["flash-auto"]);
	const pair = AUTO_MODELS.find((m) => m.virtualId === "pair-auto");
	assert.equal(pair?.readoutModel, "qwen3.6-35b-a3b-sglang");
	assert.equal(pair?.swapModel, "qwen3.6-35b-a3b-sglang");
	assert.equal(pair?.physicalId, "qwen3.8-27b-pi");
	const flash = AUTO_MODELS.find((m) => m.virtualId === "flash-auto");
	assert.equal(flash?.readoutModel, "qwen3.8-flash-next");
	assert.equal(flash?.physicalId, "qwen3.8-flash-next");
	for (const m of AUTO_MODELS) assert.notEqual(m.virtualId, m.physicalId);
});
