# Reasoning-level classifiers: results and recommendation

2026-10-26 · Test set: 66 items (44 real pi messages, 22 synthetic), labelled by Claude, cross-checked by a blind Fable relabel (61/81 agreed, every disagreement one level), settled by Michael. Detail: [REPORT-test.md](REPORT-test.md) · practice set: [REPORT-dev.md](REPORT-dev.md).

## Recommendation

**Use flash readout as the classifier, with Decima only as the fallback for when flash is down or swapped out. The budget is now 500 ms** (Michael's call after these results; it was 300 ms). At 500 ms the race used flash's answer on every real message, idle and busy.

- **Flash is clearly the better judge.** On your real messages it matched the label 70% of the time and was **never off by more than one level** (100% within one). That is about as good as it can get: the two labellers agreed only 75% of the time. Too little thinking: 16%. It gave the same answers idle and busy.
- **Decima isn't good enough to decide on its own.** 45% exact, 84% within one. It almost never under-thinks (0% on real messages), but over-thinks 55% of the time, and its confidence doesn't track whether it's right (ECE 0.21, vs flash 0.15).
- **The 300 ms budget sits just below flash's normal speed.** Idle, flash takes 238 ms typically (p95 326 ms), so it makes the cut 80% of the time. **When flash is busy with another request, it takes 356 ms typically and made the cut 0% of the time**, so the race was just Decima.

Recomputed from the same recorded runs (all 66 items):

| budget | idle: exact / flash used | busy: exact / flash used | worst-case added delay (p95) |
|---|---|---|---|
| 300 ms | 59% / 80% | 45% / 0% | 300 ms |
| 400 ms | 67% / 98% | 56% / 71% | 400 ms |
| **450 ms** | **68% / 100%** | **67% / 95%** | **437 ms** |
| 500 ms | 68% / 100% | 68% / 98% | 437 ms |

The detailed reports are regenerated at the 500 ms budget. The 300 ms rows above are kept for comparison.

## Deem-4B on the GPU (added after the main run)

Deem-4B (Q4_K_M, all 33 layers on the GPU via a locally patched `jevalt serve`, ~4 GB of the shared memory pool) on the same 66 test items:

| | exact (real / all) | within one | too little (real) | too much (real) | p50 / p95 idle | p50 / p95 busy |
|---|---|---|---|---|---|---|
| flash readout | 70% / 68% | 100% | 16% | 14% | 239 / 326 ms | 359 / 446 ms |
| **Deem-4B (GPU)** | **66% / 64%** | **100%** | **30%** | 5% | **75 / 130 ms** | **152 / 262 ms** |
| Decima-small | 45% / 45% | 84% | 0% | 55% | 18 / 62 ms | 21 / 69 ms |

- **Deem is nearly as accurate as flash, and about 3× faster.** It's never off by more than one level either. But it **under-thinks twice as often** (30% vs 16% on real messages), which is the costly direction.
- **It caught the trap flash missed:** "do it" after the four-step service-split plan → xhigh (flash said low). One item, practice set.
- **Running it next to flash slows flash.** With both on the GPU at once, as the race would run them, flash went from 239/326 ms (p50/p95) to **298/440 ms**, and 1 of 66 missed the 500 ms budget. Deem itself went to 145/225 ms.
- **Combining them doesn't help.** Taking the higher of flash's and Deem's answers only cut too-little thinking from 16% to 14% (real messages).
- **Memory:** Deem's CUDA startup failed once with out-of-memory while the build's page cache was large. With flash at 80% of the pool, only ~8 GB is spare, and Deem takes ~4 GB of it.

**What this means for the router:** flash stays the best judge. Deem is a much better fallback than Decima, but at 500 ms the fallback is almost never used (98–100% flash). Running Deem on every message would cost flash ~60 ms, and Deem would occupy 4 GB of a tight pool. Two reasonable designs:
1. **Flash + Decima** (current): no extra GPU memory; the fallback is weak but rarely used.
2. **Deem alone as the classifier**: about 3× faster (p95 130 ms idle) and almost as accurate, but more under-thinking, and 4 GB of GPU memory.

## Other findings

- **Follow-ups are flash's strength and Decima's weakness.** On follow-ups, flash got 78% exact against Decima's 39%. They're also slower for flash (p50 300 ms idle), because the previous reply makes the input longer.
- **The traps mostly worked, with one bad miss.** Both long-but-easy pastes came out right (log → low, recipe → off), and the short-but-hard "find the race in the job queue" came out xhigh. But flash rated **"do it" after a four-step service-split plan as low (label xhigh)**, the same as "do it" after a one-line rename. It doesn't carry the size of the plan through to the reply. That item is in the practice set, so the test-set numbers don't include it. Fixing this matters most for the router: the previous level should probably carry over on short go-ahead replies ("do it", "yes", "go ahead") instead of being re-judged from scratch.
- **Decima's weakness looks like the option text, not the model.** On the practice set, rewording its question changed nothing (3–4 of 15). Replacing the four long descriptions with short labels ("no thinking needed" … "deep, careful thinking") raised it to 5–7 of 15. This is exploratory and untested on the test set: a fair re-test would need short labels for both classifiers.
- **Middle-of-paste content is invisible.** The input keeps the first 700 and last 300 characters of a long message. The blind relabel showed this: the ERROR line in the log prompt was cut out. The level was still right here, but a question about the middle of a long paste reaches the classifiers without the part that matters.
- **No errors or timeouts** in 264 classifier calls (66 items × 2 classifiers × 2 conditions).

## Before the router phase

1. Add the `chat-template` compat change so `off` really means zero thinking (currently it maps to `low`). Fix `contextWindow` to 500000 for flash.
2. The router itself: `raceClassify()` in `src/race.ts` is ready to call from `route()` on `reason === "user"`.
