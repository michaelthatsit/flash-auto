import { test } from "node:test";
import assert from "node:assert/strict";
import register, { createRoute, type RouteCtx } from "../src/extension.ts";
import { appendDecision } from "../src/log.ts";
import { AUTO_MODELS } from "../src/models.ts";
import type { DecideDeps, RouterState } from "../src/router.ts";
import { fromProbs } from "../src/types.ts";

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
	return { route: createRoute(AUTO_MODELS[0], { decideDeps, log: (e) => logs.push(e) }), logs };
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
	const route = createRoute(AUTO_MODELS[0], { decideDeps, log: () => appendDecision("/proc/nonexistent/dir/x.jsonl", {}) });
	const r = await route(request({}), ctx);
	assert.equal(r.thinkingLevel, "medium");
});

test("missing physical model names it", async () => {
	const { route } = setup();
	await assert.rejects(route(request({}), { ...ctx, modelRegistry: { find: () => undefined } }), /spark\/qwen3\.8-flash-next/);
});

test("registers one virtual model per AUTO_MODELS entry", () => {
	const defs: any[] = [];
	register({ registerVirtualModel: (d: any) => defs.push(d) } as any);
	assert.equal(defs.length, 1);
	assert.deepEqual([defs[0].provider, defs[0].id, defs[0].thinkingLevels], ["spark", "flash-auto", ["medium"]]);
	assert.equal(typeof defs[0].route, "function");
});

test("announces the decision as a status before the reply", async () => {
	const statuses: [string, string | undefined][] = [];
	const ui = { setStatus: (k: string, t: string | undefined) => void statuses.push([k, t]) };
	const { route } = setup("xhigh");
	await route(request({}), { ...ctx, ui });
	await route(request({ reason: "continuation", state: { level: "xhigh", source: "classified" } }), { ...ctx, ui });
	const fb = createRoute(AUTO_MODELS[0], { decideDeps: { isRunning: async () => false, classify: async () => fromProbs({ off: 1, low: 0, medium: 0, xhigh: 0 }, 1) }, log: () => {} });
	await fb(request({}), { ...ctx, ui });
	assert.deepEqual(statuses, [["flash-auto", "auto → xhigh"], ["flash-auto", "auto → medium (fallback)"]]);
});

test("a status failure doesn't break routing", async () => {
	const { route } = setup("low");
	const ui = { setStatus: () => { throw new Error("no ui"); } };
	const r = await route(request({}), { ...ctx, ui });
	assert.equal(r.thinkingLevel, "low");
});
