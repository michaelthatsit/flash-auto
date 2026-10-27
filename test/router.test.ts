import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, type DecideDeps, type DecideInput } from "../src/router.ts";
import { fromProbs, type Classification } from "../src/types.ts";
import type { ClassifierInput } from "../src/input.ts";

const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const toolCallMsg = { role: "assistant", content: [{ type: "toolCall", name: "bash" }] };
const toolResult = { role: "toolResult", content: [{ type: "text", text: "ok" }] };

const xhigh = fromProbs({ off: 0, low: 0.1, medium: 0.1, xhigh: 0.8 }, 200);

/** Waits `ms`, or resolves early when the signal aborts (like a real fetch would reject). */
const wait = <T>(ms: number, value: T, signal: AbortSignal, onAbort: T) =>
	new Promise<T>((resolve) => {
		const t = setTimeout(() => resolve(value), ms);
		signal.addEventListener("abort", () => (clearTimeout(t), resolve(onAbort)), { once: true });
	});
const aborted: Classification = { ok: false, error: "timeout", detail: "aborted", latencyMs: 0 };

function deps(over: Partial<DecideDeps> = {}) {
	const calls = { running: 0, classify: 0, inputs: [] as ClassifierInput[] };
	const d: DecideDeps = {
		isRunning: async () => (calls.running++, true),
		classify: async (input) => (calls.classify++, calls.inputs.push(input), xhigh),
		...over,
	};
	return { d, calls };
}
const req = (over: Partial<DecideInput>): DecideInput => ({ reason: "user", messages: [], ...over });

test("continuation keeps previous level, no calls", async () => {
	const { d, calls } = deps();
	const out = await decide(req({ reason: "continuation", previousLevel: "low" }), d);
	assert.deepEqual([out.level, out.source, calls.running, calls.classify], ["low", "sticky", 0, 0]);
});

test("retry with no previous → medium", async () => {
	const out = await decide(req({ reason: "retry" }), deps().d);
	assert.deepEqual([out.level, out.source], ["medium", "sticky"]);
});

test("direct → fallback previous", async () => {
	const out = await decide(req({ reason: "direct", previousLevel: "xhigh" }), deps().d);
	assert.deepEqual([out.level, out.source], ["xhigh", "fallback"]);
});

test("user classified with previous assistant text", async () => {
	const { d, calls } = deps();
	const out = await decide(req({ messages: [user("first"), assistant("Here is a plan"), user("fix the race in queue.ts")] }), d);
	assert.equal(out.level, "xhigh");
	assert.equal(out.source, "classified");
	assert.equal(out.confidence, 0.8);
	assert.deepEqual(calls.inputs[0], { prompt: "fix the race in queue.ts", previous: "Here is a plan" });
});

test("go-ahead keeps previous", async () => {
	const { d, calls } = deps();
	const out = await decide(req({ messages: [assistant("Plan: …"), user("do it")], previousLevel: "xhigh" }), d);
	assert.deepEqual([out.level, out.source, calls.classify], ["xhigh", "go-ahead", 0]);
});

test("go-ahead without previous level is classified", async () => {
	const { d, calls } = deps();
	const out = await decide(req({ messages: [user("do it")] }), d);
	assert.deepEqual([out.source, calls.classify], ["classified", 1]);
});

test("steering keeps previous", async () => {
	const { d, calls } = deps();
	const out = await decide(
		req({ messages: [user("go"), toolCallMsg, toolResult, user("also check the tests")], previousLevel: "medium" }),
		d,
	);
	assert.deepEqual([out.level, out.source, calls.running, calls.classify], ["medium", "steering", 0, 0]);
});

test("not running → fallback, classify never called", async () => {
	const { d, calls } = deps({ isRunning: async () => false });
	const out = await decide(req({ messages: [user("hard question")], previousLevel: "low" }), d);
	assert.deepEqual([out.level, out.source, out.error, calls.classify], ["low", "fallback", "not running", 0]);
});

test("classify error → fallback previous", async () => {
	const { d } = deps({ classify: async () => ({ ok: false, error: "http", detail: "503", latencyMs: 5 }) });
	const out = await decide(req({ messages: [user("q")], previousLevel: "xhigh" }), d);
	assert.deepEqual([out.level, out.source], ["xhigh", "fallback"]);
	assert.match(out.error ?? "", /http/);
});

test("no previous and failure → medium", async () => {
	const out = await decide(req({ messages: [user("q")] }), deps({ isRunning: async () => false }).d);
	assert.equal(out.level, "medium");
});

test("shared deadline covers the running check and classify", async () => {
	const start = performance.now();
	const { d } = deps({
		isRunning: (signal) => wait(400, true, signal, false),
		classify: (_i, signal) => wait(300, xhigh, signal, aborted),
	});
	const out = await decide(req({ messages: [user("q")] }), d);
	assert.ok(performance.now() - start < 600);
	assert.equal(out.source, "fallback");
});

test("slow running check counts as not running", async () => {
	const start = performance.now();
	const { d, calls } = deps({ isRunning: (signal) => wait(10_000, true, signal, false) });
	const out = await decide(req({ messages: [user("q")] }), d);
	assert.ok(performance.now() - start < 600);
	assert.deepEqual([out.source, calls.classify], ["fallback", 0]);
});

test("user abort returns promptly with the fallback", async () => {
	const ctl = new AbortController();
	setTimeout(() => ctl.abort(), 50);
	const start = performance.now();
	const { d } = deps({ classify: (_i, signal) => wait(10_000, xhigh, signal, aborted) });
	const out = await decide(req({ messages: [user("q")], signal: ctl.signal, previousLevel: "low" }), d);
	assert.ok(performance.now() - start < 200);
	assert.deepEqual([out.level, out.source], ["low", "fallback"]);
});

test("image-only message → fallback, no calls", async () => {
	const { d, calls } = deps();
	const out = await decide(req({ messages: [{ role: "user", content: [{ type: "image", data: "x", mimeType: "image/png" }] }] }), d);
	assert.deepEqual([out.source, calls.running, calls.classify], ["fallback", 0, 0]);
});
