import { test } from "node:test";
import assert from "node:assert/strict";
import { activeAutoModels, AUTO_MODELS } from "../src/models.ts";

test("the pair entry targets the tune and reads out on it; the flash entry is unchanged", () => {
	assert.deepEqual(activeAutoModels({}, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["pair-auto", "inkling-auto"]);
	assert.deepEqual(activeAutoModels({ PI_FLASH_AUTO: "1" }, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["flash-auto", "inkling-auto"]);
	const pair = AUTO_MODELS.find((m) => m.virtualId === "pair-auto");
	// The readout runs on the orchestrator engine: measured 2026-11-11, 73% exact / 100% within one on the frozen set
	// (the 35B: 55% / 94%), and it never queues behind worker prefills on the 35B (p95 259 s under 4 workers).
	assert.equal(pair?.readoutModel, "qwen3.8-27b-pi");
	assert.equal(pair?.swapModel, "qwen3.8-27b-pi");
	assert.equal(pair?.physicalId, "qwen3.8-27b-pi");
	const flash = AUTO_MODELS.find((m) => m.virtualId === "flash-auto");
	assert.equal(flash?.readoutModel, "qwen3.8-flash-next");
	assert.equal(flash?.physicalId, "qwen3.8-flash-next");
	for (const m of AUTO_MODELS) assert.notEqual(m.virtualId, m.physicalId);
});

test("activeAutoModels follows settings.json: pair-auto only once it is pi's default model; env flags override; inkling-auto always", () => {
	assert.deepEqual(activeAutoModels({}, { defaultModel: "flash-auto" }).map((m) => m.virtualId), ["flash-auto", "inkling-auto"]);
	assert.deepEqual(activeAutoModels({}, undefined).map((m) => m.virtualId), ["flash-auto", "inkling-auto"]);
	assert.deepEqual(activeAutoModels({}, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["pair-auto", "inkling-auto"]);
	assert.deepEqual(activeAutoModels({ PI_PAIR_AUTO: "1" }, { defaultModel: "flash-auto" }).map((m) => m.virtualId), ["pair-auto", "inkling-auto"]);
	assert.deepEqual(activeAutoModels({ PI_FLASH_AUTO: "1" }, { defaultModel: "spark/pair-auto" }).map((m) => m.virtualId), ["flash-auto", "inkling-auto"]);
	assert.deepEqual(activeAutoModels({}, { defaultModel: "spark/inkling-auto" }).map((m) => m.virtualId), ["flash-auto", "inkling-auto"], "inkling as the default still keeps the Qwen router registered");
});

test("the inkling entry runs everything on inkling-2-mini and reads out there", () => {
	const ink = AUTO_MODELS.find((m) => m.virtualId === "inkling-auto");
	assert.equal(ink?.physicalId, "inkling-2-mini");
	assert.equal(ink?.swapModel, "inkling-2-mini");
	assert.equal(ink?.readoutModel, "inkling-2-mini");
	assert.equal(ink?.targets, undefined);
	assert.equal(ink?.contextWindow, 262_144);
});
