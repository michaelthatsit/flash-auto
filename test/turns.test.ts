import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractTurns } from "../bench/turns.ts";

const turns = extractTurns(readFileSync(new URL("./fixtures/session-branchy.jsonl", import.meta.url), "utf8"), "s.jsonl");

test("extracts opener and both branch replies only", () => {
	assert.deepEqual(turns.map((t) => t.id), ["s.jsonl#u1", "s.jsonl#u2", "s.jsonl#u3"]);
});

test("branch replies see the text of their parent assistant", () => {
	for (const t of turns.slice(1)) {
		assert.equal(t.previous, "Plan: do X");
		assert.equal(t.kind, "follow-up");
	}
	assert.equal(turns[1].prompt, "yes, go ahead");
});

test("opener has no previous", () => {
	assert.equal(turns[0].kind, "opener");
	assert.equal("previous" in turns[0], false);
	assert.equal(turns[0].source, "session");
});
