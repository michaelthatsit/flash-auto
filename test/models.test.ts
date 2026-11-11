import { test } from "node:test";
import assert from "node:assert/strict";
import { activeAutoModels, AUTO_MODELS } from "../src/models.ts";

test("the pair entry targets the tune and reads out on the MoE; the flash entry is unchanged", () => {
	assert.deepEqual(activeAutoModels({}, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["pair-auto"]);
	assert.deepEqual(activeAutoModels({ PI_FLASH_AUTO: "1" }, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["flash-auto"]);
	const pair = AUTO_MODELS.find((m) => m.virtualId === "pair-auto");
	assert.equal(pair?.readoutModel, "qwen3.6-35b-a3b-sglang");
	assert.equal(pair?.swapModel, "qwen3.6-35b-a3b-sglang");
	assert.equal(pair?.physicalId, "qwen3.8-27b-pi");
	const flash = AUTO_MODELS.find((m) => m.virtualId === "flash-auto");
	assert.equal(flash?.readoutModel, "qwen3.8-flash-next");
	assert.equal(flash?.physicalId, "qwen3.8-flash-next");
	for (const m of AUTO_MODELS) assert.notEqual(m.virtualId, m.physicalId);
});

test("activeAutoModels follows settings.json: pair-auto only once it is pi's default model; env flags override", () => {
	assert.deepEqual(activeAutoModels({}, { defaultModel: "flash-auto" }).map((m) => m.virtualId), ["flash-auto"]);
	assert.deepEqual(activeAutoModels({}, undefined).map((m) => m.virtualId), ["flash-auto"]);
	assert.deepEqual(activeAutoModels({}, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["pair-auto"]);
	assert.deepEqual(activeAutoModels({ PI_PAIR_AUTO: "1" }, { defaultModel: "flash-auto" }).map((m) => m.virtualId), ["pair-auto"]);
	assert.deepEqual(activeAutoModels({ PI_FLASH_AUTO: "1" }, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["flash-auto"]);
});
