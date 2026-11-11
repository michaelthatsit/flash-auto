import { test } from "node:test";
import assert from "node:assert/strict";
import register, { createRoute, FLOOR_ENTRY, type RouteCtx } from "../src/extension.ts";
import { appendDecision } from "../src/log.ts";
import { AUTO_MODELS } from "../src/models.ts";
import type { DecideDeps, RouterState } from "../src/router.ts";
import { fromProbs } from "../src/types.ts";

const FLASH = AUTO_MODELS.find((m) => m.virtualId === "flash-auto")!;
const flash = { provider: "spark", id: "qwen3.8-flash-next" } as any;
const big27b = { provider: "spark", id: "qwen3.8-27b" } as any;
const ctx: RouteCtx = {
	modelRegistry: { find: (p: string, id: string) => (p === "spark" && id === "qwen3.8-flash-next" ? flash : undefined) },
	sessionManager: { getSessionFile: () => "/sessions/s.jsonl" },
};
const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] }) as any;

function setup(level: "off" | "low" | "medium" | "xhigh" = "xhigh") {
	const logs: any[] = [];
	const decideDeps: DecideDeps = {
		isRunning: async () => true,
		classify: async () => fromProbs({ off: 0, low: 0, medium: 0, xhigh: 0, [level]: 1 }, 200),
	};
	return { route: createRoute(FLASH, { decideDeps, log: (e) => logs.push(e) }), logs };
}
const request = (over: Record<string, unknown>) =>
	({ model: { id: "flash-auto" }, thinkingLevel: "medium", reason: "user", messages: [user("fix the race")], ...over }) as any;

test("routes to the physical model at the decided level", async () => {
	const { route } = setup("xhigh");
	const r = await route(request({}), ctx);
	assert.equal(r.model, flash);
	assert.equal(r.thinkingLevel, "xhigh");
	assert.deepEqual(r.state, { level: "xhigh", source: "classified", confidence: 1 });
});

test("continuation after a different model still dispatches to flash", async () => {
	const { route } = setup();
	const r = await route(request({ reason: "continuation", previous: { model: big27b, thinkingLevel: "high" } }), ctx);
	assert.equal(r.model, flash);
	assert.equal(r.thinkingLevel, "xhigh");
});

test("state only changes when the decision changes", async () => {
	const { route } = setup("low");
	const state: RouterState = { level: "low", source: "classified", confidence: 1 };
	const r = await route(request({ state }), ctx);
	assert.equal(r.state, state);
});

test("logs user decisions only, without prompt text", async () => {
	const { route, logs } = setup("low");
	await route(request({}), ctx);
	await route(request({ reason: "continuation", state: { level: "low", source: "classified" } }), ctx);
	assert.equal(logs.length, 1);
	assert.equal(logs[0].level, "low");
	assert.equal(logs[0].session, "/sessions/s.jsonl");
	assert.equal(JSON.stringify(logs[0]).includes("fix the race"), false);
});

test("log failure doesn't break routing", async () => {
	assert.doesNotThrow(() => appendDecision("/proc/nonexistent/dir/x.jsonl", { a: 1 }));
	const decideDeps: DecideDeps = { isRunning: async () => false, classify: async () => fromProbs({ off: 1, low: 0, medium: 0, xhigh: 0 }, 1) };
	const route = createRoute(FLASH, { decideDeps, log: () => appendDecision("/proc/nonexistent/dir/x.jsonl", {}) });
	const r = await route(request({}), ctx);
	assert.equal(r.thinkingLevel, "medium");
});

test("missing physical model names it", async () => {
	const { route } = setup();
	await assert.rejects(route(request({}), { ...ctx, modelRegistry: { find: () => undefined } }), /spark\/qwen3\.8-flash-next/);
});

test("registers the active virtual model only: pair-auto by default, flash-auto with PI_FLASH_AUTO=1", () => {
	const defs: any[] = [];
	const saved = process.env.PI_FLASH_AUTO;
	delete process.env.PI_FLASH_AUTO;
	try {
		register({ registerVirtualModel: (d: any) => defs.push(d) } as any);
		assert.equal(defs.length, 1);
		assert.deepEqual([defs[0].provider, defs[0].id, defs[0].thinkingLevels, defs[0].contextWindow], ["spark", "pair-auto", ["medium"], 262_144]);
		assert.equal(typeof defs[0].route, "function");
		process.env.PI_FLASH_AUTO = "1";
		register({ registerVirtualModel: (d: any) => defs.push(d) } as any);
		assert.equal(defs.length, 2);
		assert.deepEqual([defs[1].id, defs[1].contextWindow], ["flash-auto", 500_000]);
	} finally {
		if (saved === undefined) delete process.env.PI_FLASH_AUTO;
		else process.env.PI_FLASH_AUTO = saved;
	}
});

test("announces the decision as a status before the reply", async () => {
	const statuses: [string, string | undefined][] = [];
	const ui = { setStatus: (k: string, t: string | undefined) => void statuses.push([k, t]) };
	const { route } = setup("xhigh");
	await route(request({}), { ...ctx, ui });
	await route(request({ reason: "continuation", state: { level: "xhigh", source: "classified" } }), { ...ctx, ui });
	const fb = createRoute(FLASH, { decideDeps: { isRunning: async () => false, classify: async () => fromProbs({ off: 1, low: 0, medium: 0, xhigh: 0 }, 1) }, log: () => {} });
	await fb(request({}), { ...ctx, ui });
	assert.deepEqual(statuses, [["flash-auto", "auto → xhigh"], ["flash-auto", "auto → medium (fallback)"]]);
});

test("a status failure doesn't break routing", async () => {
	const { route } = setup("low");
	const ui = { setStatus: () => { throw new Error("no ui"); } };
	const r = await route(request({}), { ...ctx, ui });
	assert.equal(r.thinkingLevel, "low");
});

test("a flash-auto-floor entry on the session branch keeps the level from going below it", async () => {
	const branch: any[] = [];
	const floorCtx: RouteCtx = { ...ctx, sessionManager: { getSessionFile: () => "/sessions/s.jsonl", getBranch: () => branch } };
	const { route, logs } = setup("off");
	assert.equal((await route(request({}), floorCtx)).thinkingLevel, "off");
	branch.push({ type: "custom", customType: FLOOR_ENTRY, data: { level: "medium" } });
	const r = await route(request({}), floorCtx);
	assert.equal(r.thinkingLevel, "medium");
	assert.equal(r.state?.level, "medium");
	assert.equal(logs.at(-1).level, "medium");
	assert.equal(logs.at(-1).floor, "medium");
	// A higher classification is left alone; the latest entry wins, and null clears the floor.
	assert.equal((await setup("xhigh").route(request({}), floorCtx)).thinkingLevel, "xhigh");
	branch.push({ type: "custom", customType: FLOOR_ENTRY, data: { level: null } });
	assert.equal((await route(request({}), floorCtx)).thinkingLevel, "off");
});

test("pair-auto routes a low decision to the MoE and an xhigh one to the pi tune; a failed decision goes to the pi tune at medium", async () => {
	const pair = AUTO_MODELS.find((m) => m.virtualId === "pair-auto")!;
	const moe = { provider: "spark", id: "qwen3.6-35b-a3b-sglang" } as any;
	const tune = { provider: "spark", id: "qwen3.8-27b-pi" } as any;
	const pairCtx: RouteCtx = { modelRegistry: { find: (_p: string, id: string) => (id === moe.id ? moe : id === tune.id ? tune : undefined) }, sessionManager: { getSessionFile: () => "/sessions/p.jsonl" } };
	const mk = (level: "off" | "low" | "medium" | "xhigh", ok = true) =>
		createRoute(pair, {
			decideDeps: { isRunning: async () => true, classify: async () => (ok ? fromProbs({ off: 0, low: 0, medium: 0, xhigh: 0, [level]: 1 }, 200) : { ok: false, error: "http", detail: "500", latencyMs: 1 }) },
			log: () => {},
		});
	let r = await mk("low")(request({ model: { id: "pair-auto" } }), pairCtx);
	assert.equal(r.model, moe);
	assert.equal(r.thinkingLevel, "low");
	r = await mk("xhigh")(request({ model: { id: "pair-auto" } }), pairCtx);
	assert.equal(r.model, tune);
	assert.equal(r.thinkingLevel, "xhigh");
	r = await mk("low", false)(request({ model: { id: "pair-auto" } }), pairCtx);
	assert.equal(r.model, tune);
	assert.equal(r.thinkingLevel, "medium");
	assert.equal(r.state?.source, "fallback");
});
