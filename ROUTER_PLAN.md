> Superseded by docs/superpowers/specs/2026-10-26-classifier-benchmark-design.md; kept for history.

# flash-auto: automatic reasoning-level routing for spark/qwen3.8-flash-next

## Architecture

```
user turn ──► pi extension flash-auto.ts: route(request, ctx)
              │  reason != "user" ──► return previous (cache-safe sticky)
              │  reason == "user"
              ▼
        L1 heuristics (free, <1ms)      L2 jeff classify (:8017, ~220ms, 800ms budget)
        len<12 chars → off              kind: choice (primary signal, conf ~0.7-0.85)
        /wiki, ping → off              deep: noul (secondary, weak — gate at 0.6)
        server down → keep last level   on timeout/error → heuristics only
                                        ▼
                              thinkingLevel ∈ {off, low, medium, xhigh}
                              dispatched to spark/qwen3.8-flash-next
```

## Decision table (v1)

| classifier verdict | level |
|---|---|
| kind=chat or docs, conf>0.6, input<200 chars | off (→ `low` via thinkingLevelMap) |
| kind=feature/refactor, deep<0.6, input<400 chars | low |
| kind=bugfix/feature/refactor, deep≥0.6 or input≥400 chars | medium |
| kind=bugfix/refactor AND ("all/every/multiple" + file paths ≥2) | xhigh |
| anything below confidence 0.4 on kind | medium (safe middle) |

noul `deep` alone never raises above medium — measured noisy ("hi"→0.83).
score questions: do not use (GLiFormer-family scores are early/weak).

## Phases

- **P0 — done 2026-10-26**: local System One server on 127.0.0.1:8017 (`systemctl --user decima`, Jev wire format `POST /v1/systemone`). Default decider: **Decima-small** (122M, int8 ONNX, ~15–30 ms Grace CPU, permutation-invariant, order never flips answers). **jeff/GLiFormer** demoted to A/B (`systemctl --user start jeff` after stopping decima, move port to 8018).

## Decision model survey (2026-10-26, post-Jev wave)

Directory of record: decisioneval.dev/models — 379 open-weight cards, only hosted Jev externally benchmarked (0.740 on 2,000 frozen decisions; treat all other numbers as vendor-self-reported). Swapped in via `--model`/base URL only; wire format is shared.

Verified on our own routing prompts (5-case probe):
- **Decima-small 122M** ← running: kind sharp (chat 0.86, docs 0.85, bugfix 0.76–0.95), noul coherent, 14–31 ms. Limits: 512-token state, not for safety gates (calls rm -rf non-destructive per its own card).
- jeff / GLiFormer-large-v1 400M: correct on 4/5 but 220–820 ms, noul noisy ("hi"→0.83), order-sensitive.

Candidates to consider later, by class:
- CPU/edge, same API: **Laya 421M** (topic only), **Kev-0.5B/0.8B** (jabr; order-flip 10–22%), **open-jev-deberta-v3-large 0.4B** (512-tok, 3 domains), **Byrne-Jev-79M** (tiny, stdlib server), **jevos-v5** (best vendor yes/no 79% — blocked: no linux-arm64 binary; GGUF llama.cpp route untested), **JevAlt Deem-4B GGUF** (94.7% claimed held-out EN, ~3 GB CPU).
- GPU-class (need vLLM to free memory or idle window): **autotrust/JEV-9B** (distilled from real TypeSafe Jev 1.13, Apache-2.0, vLLM + adapter, claims ≈ KL 0.019 to teacher; two-head: also a usable chat model), **JEV-27B-VL**, **openjev/openjev 27B** (CC BY-NC).
- Hosted cascade (P3): TypeSafe Jev 1.14 — the only externally measured one, $0.042/Mtok.
- DIY readout libs (no server today): ikermoel/open-alternative-jev (`so1`, any ChatML LLM → typed decisions via logit readout; stock Qwen3.6-27B beats Jev 1.13 on typed-decisions 73.7 vs 72.7 — candidate to run against our qwen3.6-35b when idle), SemIf/openjev.com browser GGUFs.
- **P1 (~1 h)**: `~/.pi/agent/extensions/flash-auto.ts` — `pi.registerVirtualModel` + fetch classify in route(); heuristic floor. Model picker shows `spark/flash-auto`.
- **P2 (2 weeks of use)**: log every decision via `pi.appendEntry`; weekly script compares chosen vs. what sessions needed; tune thresholds + temperature from the log.
- **P3 (optional)**: cascade — when kind confidence lands 0.4–0.6, ask hosted TypeSafe Jev ($0.042/Mtok, ~350 ms, needs API key + internet). Same wire format, base URL swap only.
- **P4 (opportunistic)**: jevos-v5 (purpose-trained, +5-10 pts on yes/no) — needs an arm64 build; its GGUFs may load in llama.cpp, or request arm64 release upstream. Also try `JEFF_DEVICE=cuda` when vLLM frees memory: GPU is ~2× faster at equal quality.

## Failure modes

- jeff down → route falls back to heuristics, never blocks the turn (AbortSignal + 800 ms budget).
- CPU contention: 8/20 Grace threads capped; OOM guard MemoryMax=6G.
- Classifier drift: model name + state logged per decision (`appendEntry`).
