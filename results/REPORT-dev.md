# Classifier benchmark — dev set

Prompt versions: flash `92e63297f148`, decima `c2c6a3880e09`. Budget 500 ms. Items: 15 (7 real, 8 synthetic). Missing: none.

Rates are over items both classifiers answered. *Too little* = predicted below the label (risk of wrong answers); *too much* = above it (only slower). Busy rows where the load stream had stopped are excluded.

## Headline: real messages

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 7/7 | 71% | 100% | 14% | 14% | 271 | 320 | 100% | – |
| flash | busy | 7/7 | 71% | 100% | 14% | 14% | 387 | 421 | 100% | – |
| decima | idle | 7/7 | 14% | 57% | 14% | 71% | 33 | 50 | – | – |
| decima | busy | 7/7 | 14% | 57% | 14% | 71% | 32 | 54 | – | – |
| race | idle | 7/7 | 71% | 100% | 14% | 14% | 271 | 320 | – | 100% |
| race | busy | 7/7 | 71% | 100% | 14% | 14% | 387 | 421 | – | 100% |
| deem | idle | 7/7 | 86% | 100% | 14% | 0% | 88 | 112 | – | – |
| deem | busy | 0/7 | – | – | – | – | – | – | – | – |
| race-deem | idle | 7/7 | 71% | 100% | 14% | 14% | 271 | 320 | – | 100% |
| race-deem | busy | 0/7 | – | – | – | – | – | – | – | – |

## Synthetic prompts

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 8/8 | 63% | 88% | 13% | 25% | 230 | 256 | 100% | – |
| flash | busy | 8/8 | 63% | 88% | 13% | 25% | 355 | 377 | 100% | – |
| decima | idle | 8/8 | 25% | 75% | 25% | 50% | 16 | 21 | – | – |
| decima | busy | 8/8 | 25% | 75% | 25% | 50% | 21 | 25 | – | – |
| race | idle | 8/8 | 63% | 88% | 13% | 25% | 230 | 256 | – | 100% |
| race | busy | 8/8 | 63% | 88% | 13% | 25% | 355 | 377 | – | 100% |
| deem | idle | 8/8 | 75% | 100% | 0% | 25% | 74 | 84 | – | – |
| deem | busy | 0/8 | – | – | – | – | – | – | – | – |
| race-deem | idle | 8/8 | 63% | 88% | 13% | 25% | 230 | 256 | – | 100% |
| race-deem | busy | 0/8 | – | – | – | – | – | – | – | – |

## All items

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 15/15 | 67% | 93% | 13% | 20% | 243 | 320 | 100% | – |
| flash | busy | 15/15 | 67% | 93% | 13% | 20% | 366 | 421 | 100% | – |
| decima | idle | 15/15 | 20% | 67% | 20% | 60% | 19 | 50 | – | – |
| decima | busy | 15/15 | 20% | 67% | 20% | 60% | 24 | 54 | – | – |
| race | idle | 15/15 | 67% | 93% | 13% | 20% | 243 | 320 | – | 100% |
| race | busy | 15/15 | 67% | 93% | 13% | 20% | 366 | 421 | – | 100% |
| deem | idle | 15/15 | 80% | 100% | 7% | 13% | 82 | 112 | – | – |
| deem | busy | 0/15 | – | – | – | – | – | – | – | – |
| race-deem | idle | 15/15 | 67% | 93% | 13% | 20% | 243 | 320 | – | 100% |
| race-deem | busy | 0/15 | – | – | – | – | – | – | – | – |

## Openers vs follow-ups (all items)

### Openers

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 8/8 | 63% | 100% | 0% | 38% | 230 | 271 | 100% | – |
| flash | busy | 8/8 | 63% | 100% | 0% | 38% | 355 | 373 | 100% | – |
| decima | idle | 8/8 | 25% | 88% | 25% | 50% | 16 | 41 | – | – |
| decima | busy | 8/8 | 25% | 88% | 25% | 50% | 21 | 32 | – | – |
| race | idle | 8/8 | 63% | 100% | 0% | 38% | 230 | 271 | – | 100% |
| race | busy | 8/8 | 63% | 100% | 0% | 38% | 355 | 373 | – | 100% |
| deem | idle | 8/8 | 63% | 100% | 13% | 25% | 74 | 88 | – | – |
| deem | busy | 0/8 | – | – | – | – | – | – | – | – |
| race-deem | idle | 8/8 | 63% | 100% | 0% | 38% | 230 | 271 | – | 100% |
| race-deem | busy | 0/8 | – | – | – | – | – | – | – | – |

### Follow-ups

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 7/7 | 71% | 86% | 29% | 0% | 259 | 320 | 100% | – |
| flash | busy | 7/7 | 71% | 86% | 29% | 0% | 387 | 421 | 100% | – |
| decima | idle | 7/7 | 14% | 43% | 14% | 71% | 30 | 50 | – | – |
| decima | busy | 7/7 | 14% | 43% | 14% | 71% | 26 | 54 | – | – |
| race | idle | 7/7 | 71% | 86% | 29% | 0% | 259 | 320 | – | 100% |
| race | busy | 7/7 | 71% | 86% | 29% | 0% | 387 | 421 | – | 100% |
| deem | idle | 7/7 | 100% | 100% | 0% | 0% | 86 | 112 | – | – |
| deem | busy | 0/7 | – | – | – | – | – | – | – | – |
| race-deem | idle | 7/7 | 71% | 86% | 29% | 0% | 259 | 320 | – | 100% |
| race-deem | busy | 0/7 | – | – | – | – | – | – | – | – |

## Confusion matrices (all items, idle)

### flash

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 2 | 1 | 0 | 0 |
| **low** | 0 | 4 | 1 | 0 |
| **medium** | 0 | 1 | 2 | 1 |
| **xhigh** | 0 | 1 | 0 | 2 |

### decima

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 1 | 1 | 0 | 1 |
| **low** | 0 | 1 | 1 | 3 |
| **medium** | 0 | 0 | 1 | 3 |
| **xhigh** | 0 | 1 | 2 | 0 |

### race

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 2 | 1 | 0 | 0 |
| **low** | 0 | 4 | 1 | 0 |
| **medium** | 0 | 1 | 2 | 1 |
| **xhigh** | 0 | 1 | 0 | 2 |

### deem

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 2 | 1 | 0 | 0 |
| **low** | 0 | 4 | 1 | 0 |
| **medium** | 0 | 0 | 4 | 0 |
| **xhigh** | 0 | 0 | 1 | 2 |

### race-deem

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 2 | 1 | 0 | 0 |
| **low** | 0 | 4 | 1 | 0 |
| **medium** | 0 | 1 | 2 | 1 |
| **xhigh** | 0 | 1 | 0 | 2 |

## Calibration (all items, idle)

### flash

| confidence | items | accuracy | mean confidence |
|---|---|---|---|
| 0.25–0.40 | 0 | – | – |
| 0.40–0.55 | 2 | 50% | 47% |
| 0.55–0.70 | 5 | 60% | 66% |
| 0.70–0.85 | 1 | 100% | 81% |
| 0.85–1.00 | 7 | 71% | 93% |

ECE: 0.136

### decima

| confidence | items | accuracy | mean confidence |
|---|---|---|---|
| 0.25–0.40 | 1 | 100% | 39% |
| 0.40–0.55 | 6 | 0% | 48% |
| 0.55–0.70 | 6 | 17% | 61% |
| 0.70–0.85 | 1 | 0% | 72% |
| 0.85–1.00 | 1 | 100% | 97% |

ECE: 0.461

## Errors

- flash idle: {}
- decima idle: {}
- flash busy: {}
- decima busy: {}
