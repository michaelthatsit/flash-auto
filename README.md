# flash-auto

Reasoning-level classifiers for `spark/qwen3.8-flash-next` (flash-next logprob readout and Decima-small) and a benchmark comparing them. See `docs/superpowers/specs/` for the design.

```
npm test            # unit tests
npm run typecheck
```

## Notes

- Decima-small reads at most 512 tokens of state and truncates longer input itself (checked live 2026-10-26 with a ~1,600-char code-heavy input: returned normally). `buildClassifierInput` caps the prompt at 1,000 chars and the previous assistant text at 600.
- Live checks: `node bench/smoke.ts flash|decima "<prompt>"` (the flash check refuses to run unless flash is already the loaded model).

## Frozen for test run (2026-10-26)

- flash prompt version `92e63297f148`
- decima prompt version `c2c6a3880e09`

No wording was changed after the dev run: Decima instruction variants moved dev accuracy by at most one item (noise), and the level descriptions are fixed by the spec.

## flash-auto (pi router)

`spark/flash-auto` is a virtual model: every request goes to `spark/qwen3.8-flash-next`, and flash picks the reasoning level (off / low / medium / xhigh) for each message you type with a one-token readout (~350 ms, 1.5 s hard budget).

- **Same level for the whole turn:** tool-call steps and retries reuse it. Short go-ahead replies ("do it", "yes", "continue"…) and messages typed mid-turn keep the previous level.
- **Never triggers a model swap:** if flash isn't loaded, or the decision fails or takes over 1.5 s, it uses medium. A failed decision never inherits the previous level, so one low classification can't trap a session at low.
- **Live status:** the router announces each decision as an extension status (`auto → xhigh`, `auto → medium (fallback)`) before the reply starts. It shows in pi's footer and in pi-web's status row.
- **Decision log:** `~/.pi/agent/flash-auto.jsonl`, one line per message: level, source, confidence, probabilities, latency. No prompt text.
- **Installed** as a local pi package: `"../../workspace/flash-auto"` in `~/.pi/agent/settings.json` → `packages`. To disable it, remove that line (backup: `settings.json.bak-2026-10-26`).
- **Needs** the flash entry in `~/.pi/agent/models.json` from `docs/models-json-change.md` (true-zero off). To add another model, add an entry to `src/models.ts` and benchmark it first (`bench/`, see below).

## inkling-auto

`spark/inkling-auto` (2026-11-22) is the same router on Inkling 2 Mini: every request goes to `spark/inkling-2-mini`, and Inkling picks the level for each message. It is registered next to the active Qwen router, since it is only reached by picking it, which swaps llama-swap to Inkling exactly as picking the plain model does. The readout is different (`src/inkling.ts`): Inkling opens every reply with its role token and a thinking block even at effort 0, so a chat completion's first token is never the letter. The readout renders the chat template itself (effort 0, the same instructions flash reads), ends the prompt with `<|message_model|><|content_text|>`, and reads the letter from `/v1/completions` with one token. The levels then map through pi's `thinkingLevelMap` in `models.json` (`off` → `none`, `xhigh` → `xhigh`); Inkling keeps a little thinking at `none`.

Measured on the frozen test set (`results/REPORT-readouts.md`, `node bench/readouts.ts`), idle, one token each:

| engine | exact | within one | too little | too much | p50 ms | p95 ms |
|---|---|---|---|---|---|---|
| flash-next | 68% | 100% | 11% | 21% | 239 | 326 |
| 27b-pi | 73% | 100% | 15% | 12% | 320 | 371 |
| 35b-a3b | 55% | 94% | 35% | 11% | 285 | 360 |
| inkling | 67% | 98% | 23% | 11% | 134 | 2106 |

Inkling reads out as well as flash on the whole, but leans low on the hard end: 7 of the 11 xhigh items came back medium (the xhigh row of its confusion matrix). Latency is bimodal on a freshly booted server: about a third of first-seen prompts cost ~1.8 s once (23 of 66 in the first pass; a second pass over the same set: p50 88 ms, p95 118 ms, none over 200 ms). The cause was not pinned down (tokenization is 3-20 ms; the spikes do not follow prompt length or content); a spike past the 1.5 s budget becomes a `fallback` medium for that message, nothing worse. Four of 66 items changed level between the two passes at temperature 0.

To re-run: `node bench/run.ts --set test --condition idle --model inkling-2-mini --out results/test-idle-inkling.jsonl` with Inkling loaded, then `node bench/readouts.ts`. `node bench/smoke.ts inkling "<prompt>"` is the live check.

## Benchmark data

The labelled test set (`data/turns.jsonl`, `data/labels.md`, `data/testset.jsonl`) and the per-item result rows (`results/*.jsonl`) contain real pi messages and session names, so they're kept out of the repo. `results/REPORT*.md` are the published results. To benchmark on your own sessions: `node bench/turns.ts` → label `data/labels.md` → `node bench/labels.ts build` → `node bench/run.ts` → `node bench/report.ts`.
