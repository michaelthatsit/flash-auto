# flash-auto router — design

Date: 2026-10-26 · Status: ready for Michael's review (builder-checked) · Builds on: `2026-10-26-classifier-benchmark-design.md` and `results/REPORT.md`

## Intent

Michael wants pi to pick flash-next's reasoning level automatically on every message, so he doesn't have to set it by hand. The benchmark settled the method: **flash judges its own requests** with a one-token logprob readout (70% exact on his real messages, never more than one level off, ~240 ms idle / ~360 ms busy). Decima and Deem are abandoned (Michael's call, 2026-10-26); Decima's service is stopped and disabled.

## Goals

1. A virtual model `spark/flash-auto`, selectable in pi like any model, that sends every request to `spark/qwen3.8-flash-next` at a level it chooses.
2. One decision per message Michael types; tool-call steps inside the turn keep that level.
3. "off" means genuinely zero thinking.
4. The structure is generic: adding `27b-auto` later is one config entry plus one benchmark run, not a rewrite.

## Non-goals

- Routing for other models now (the 27B and 35B-A3B), hosted classifiers, Decima, Deem.
- Tool-use approvals.
- A manual floor or override level on top of auto.
- Changing the benchmark labels or re-running it.

## Anti-goals (failure even if it "works")

- **The classifier triggers a llama-swap model swap.** It may only classify when flash is already loaded.
- **The decision adds more than 500 ms** before the reply starts.
- **Breaking prompt caching** by changing the level mid-turn (on tool continuations or retries).
- **Short go-ahead replies get re-judged from scratch.** Flash rated "do it" after a large plan as low; that must not happen in the router.
- **A classifier failure blocks or errors the request.** Every failure path still sends the request.

## Decided

**Routing rules** (`route(request, ctx)`), in order:

| `request.reason` | Level |
|---|---|
| `continuation`, `retry` | Same as the turn's previous dispatch (`request.failed ?? request.previous`) — keeps caches valid |
| `direct` (compaction summaries etc.) | Previous level, else medium |
| `user`, message is a short go-ahead reply | **Previous level** (no classify call) |
| `user`, steering message typed while the turn is still running | **Previous level** (no classify call) — *Claude's call: re-judging mid-turn would change the level partway through the work.* Detect it from `request.messages`: the message before the new user message is a tool result or an assistant message with tool calls. |
| `user`, flash not running | Previous level, else medium (no classify call) |
| `user`, otherwise | Classify with flash; on success use its level; on error/timeout/over 500 ms, previous level, else medium |

*Fallback "previous level, else medium" is Michael's call (2026-10-26).*

**Go-ahead replies**: a user message of at most ~40 characters that, after trimming, lowercasing and stripping trailing punctuation, matches a fixed list. The list must include at least: `do it`, `yes`, `yep`, `go ahead`, `go for it`, `ok`, `ok do it`, `sounds good`, `proceed`, `continue`, `ship it`, `lgtm`, `yes please`, `please do`. Applies only when there is a previous level to keep.

**Classifier**: reuse `src/flash.ts` (`createFlashClassifier`, `isFlashRunning`) and `src/input.ts` (`buildClassifierInput(lastUserText, previousAssistantText)`), unchanged in behaviour. Wording and level descriptions stay frozen at the benchmarked versions (flash prompt version recorded in README). The 500 ms budget is **one shared deadline covering both the `/running` check and the classify call** *(Claude's call: otherwise a slow llama-swap could add up to ~2.5 s)*, enforced with an abort signal (the request's own `signal` combined with the deadline). A `/running` check that times out counts as "not running".

**Level mapping**: classifier levels map one-to-one to pi thinking levels (off, low, medium, xhigh) on the physical model.

**True-zero "off"** — change `~/.pi/agent/models.json` for `qwen3.8-flash-next` (back up the file first):
- `compat.thinkingFormat: "chat-template"` with `chatTemplateKwargs: { "enable_thinking": {"$var": "thinking.enabled"}, "reasoning_effort": {"$var": "effort", "omitWhenOff": true} }` (keeping `supportsDeveloperRole: false`).
- `thinkingLevelMap` keeps low→low, medium→medium, high/xhigh/max→xhigh, minimal→low; "off" no longer maps to low.
- `contextWindow: 500000` (vLLM serves `--max-model-len 500000`).
- Verify live: off gives 0 reasoning tokens; low/medium/xhigh are accepted (no 400s) **and differ** — reasoning tokens rise from low to xhigh on one prompt.
- Pre-checked 2026-10-26 by sending `chat_template_kwargs` straight to vLLM, on one arithmetic prompt: off 0, low 215, medium 291, xhigh 321 reasoning tokens. So the template reads `reasoning_effort` from the kwargs, and the change should work. If pi's request turns out different, stop and report rather than sending both the kwarg and the top-level field.

This also changes manual "off" on plain `qwen3.8-flash-next` to true zero, which is the intended meaning.

**Per-model config**: one exported table (e.g. `src/models.ts`) with an entry per auto model: the virtual id (`flash-auto`), physical provider/id (`spark` / `qwen3.8-flash-next`), llama-swap base URL and model name for the running check and readout, and the level mapping. Only the flash entry exists now. The extension registers one virtual model per entry.

**Router state**: store the last decision on the session branch: `{ level, source: "classified" | "go-ahead" | "fallback" | "sticky", confidence? }`. "Previous level" comes from this state, falling back to `request.previous.thinkingLevel`.

**Decision log**: append one JSON line per `user` decision to `~/.pi/agent/flash-auto.jsonl`: timestamp, session file, level, source, probabilities, latency, error if any. No prompt text (it's already in the session file). This is real-world data for re-checking accuracy later.

**Loading**: the repo becomes a local pi package (`package.json` gets `"keywords": ["pi-package"]` and `"pi": { "extensions": ["./src/extension.ts"] }`), added to `~/.pi/agent/settings.json` `packages` as `"../../workspace/flash-auto"`, like `pi-llm-wiki`.

## Left to the builder

- What the virtual model offers as its thinking-level choice (pi requires at least one; pick whatever reads least confusingly in the footer, which already shows the routed level, e.g. `flash-auto • … → qwen3.8-flash-next • medium`).
- Exact go-ahead matching beyond the required list.
- File layout, and how the route function is factored for unit tests (fake classifier, fake running check, fake registry).
- Whether to keep the benchmark's `raceClassify` (now a single classifier, it reduces to classify-with-budget).

## Done when

- Unit tests cover every row of the routing table, go-ahead matching, and each failure path (not running, error, timeout).
- `models.json` change verified live (0 reasoning tokens on off; no 400s on the others).
- In a real pi session with `spark/flash-auto`: "hi" routes to off; a hard multi-file request routes to xhigh; its tool-call steps keep the level; "do it" after it keeps xhigh; and with flash not loaded, no classify request reaches llama-swap (checked with a fake running check in tests, plus llama-swap's log if practical).
- Decision log lines appear.
