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

`spark/flash-auto` is a virtual model: every request goes to `spark/qwen3.8-flash-next`, and flash picks the reasoning level (off / low / medium / xhigh) for each message you type with a one-token readout (~240 ms, 500 ms hard budget).

- **Same level for the whole turn:** tool-call steps and retries reuse it. Short go-ahead replies ("do it", "yes", "continue"…) and messages typed mid-turn keep the previous level.
- **Never triggers a model swap:** if flash isn't loaded, or the decision fails or takes over 500 ms, it uses the previous level, else medium.
- **Decision log:** `~/.pi/agent/flash-auto.jsonl`, one line per message: level, source, confidence, probabilities, latency. No prompt text.
- **Installed** as a local pi package: `"../../workspace/flash-auto"` in `~/.pi/agent/settings.json` → `packages`. To disable it, remove that line (backup: `settings.json.bak-2026-10-26`).
- **Needs** the flash entry in `~/.pi/agent/models.json` from `docs/models-json-change.md` (true-zero off). To add another model, add an entry to `src/models.ts` and benchmark it first (`bench/`).
