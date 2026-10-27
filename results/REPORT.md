# Reasoning-level classifiers: results and recommendation

2026-10-26 · Test set: 66 items (44 real pi messages, 22 synthetic), labelled by Claude, cross-checked by a blind Fable relabel (61/81 agreed, every disagreement one level), settled by Michael. Detail: [REPORT-test.md](REPORT-test.md) · practice set: [REPORT-dev.md](REPORT-dev.md).

## Recommendation

**Use flash readout as the classifier, and raise the budget from 300 ms to about 450 ms. Keep Decima only as the fallback for when flash is down or swapped out.**

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

At 450 ms you get flash's accuracy in both conditions, for at most ~0.15 s more than you agreed to. Whether that is acceptable is your call: it changes the 300 ms requirement.

## Other findings

- **Follow-ups are flash's strength and Decima's weakness.** On follow-ups, flash got 78% exact against Decima's 39%. They're also slower for flash (p50 300 ms idle), because the previous reply makes the input longer.
- **The traps worked as intended.** Flash labelled "do it" low after a rename offer and xhigh after a service-split plan, and both long-but-easy pastes came out low or off.
- **Decima's weakness looks like the option text, not the model.** On the practice set, rewording its question changed nothing (3–4 of 15). Replacing the four long descriptions with short labels ("no thinking needed" … "deep, careful thinking") raised it to 5–7 of 15. This is exploratory and untested on the test set: a fair re-test would need short labels for both classifiers.
- **Middle-of-paste content is invisible.** The input keeps the first 700 and last 300 characters of a long message. The blind relabel showed this: the ERROR line in the log prompt was cut out. The level was still right here, but a question about the middle of a long paste reaches the classifiers without the part that matters.
- **No errors or timeouts** in 264 classifier calls (66 items × 2 classifiers × 2 conditions).

## Before the router phase

1. Decide the budget (450 ms recommended, or keep 300 and accept Decima under load).
2. Add the `chat-template` compat change so `off` really means zero thinking (currently it maps to `low`). Fix `contextWindow` to 500000 for flash.
3. The router itself: `raceClassify()` in `src/race.ts` is ready to call from `route()` on `reason === "user"`.
