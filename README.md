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
