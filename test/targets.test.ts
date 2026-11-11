import { test } from "node:test";
import assert from "node:assert/strict";
import { PAIR_TARGETS } from "../src/targets.ts";

test("the pair targets send off/low to the MoE and medium/xhigh to the pi tune", () => {
	assert.equal(PAIR_TARGETS.off.physicalId, "qwen3.6-35b-a3b-sglang");
	assert.equal(PAIR_TARGETS.off.thinkingLevel, "off");
	assert.equal(PAIR_TARGETS.low.physicalId, "qwen3.6-35b-a3b-sglang");
	assert.equal(PAIR_TARGETS.low.thinkingLevel, "low");
	assert.equal(PAIR_TARGETS.medium.physicalId, "qwen3.8-27b-pi");
	assert.equal(PAIR_TARGETS.medium.thinkingLevel, "medium");
	assert.equal(PAIR_TARGETS.xhigh.physicalId, "qwen3.8-27b-pi");
	assert.equal(PAIR_TARGETS.xhigh.thinkingLevel, "xhigh");
});
