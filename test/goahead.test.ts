import { test } from "node:test";
import assert from "node:assert/strict";
import { isGoAhead } from "../src/goahead.ts";

const REQUIRED = ["do it", "yes", "yep", "go ahead", "go for it", "ok", "ok do it", "sounds good", "proceed", "continue", "ship it", "lgtm", "yes please", "please do"];

test("every required phrase is a go-ahead", () => {
	for (const p of REQUIRED) assert.equal(isGoAhead(p), true, p);
});

test("case, whitespace and trailing punctuation are ignored", () => {
	for (const p of ["Do it!", "  yes. ", "LGTM", "Go ahead…", "ok, do it"]) assert.equal(isGoAhead(p), true, p);
});

test("longer or different requests are not go-aheads", () => {
	assert.equal(isGoAhead("yes, but also refactor the auth module and add tests for every handler"), false);
	assert.equal(isGoAhead("do it differently"), false);
	assert.equal(isGoAhead(""), false);
});
