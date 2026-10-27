import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_MODELS } from "../src/models.ts";

test("one auto model: flash-auto routing to flash", () => {
	assert.equal(AUTO_MODELS.length, 1);
	const [m] = AUTO_MODELS;
	assert.equal(m.virtualId, "flash-auto");
	assert.equal(m.physicalId, "qwen3.8-flash-next");
	assert.notEqual(m.virtualId, m.physicalId);
});
