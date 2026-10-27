# Classifier benchmark — test set

Prompt versions: flash `92e63297f148`, decima `c2c6a3880e09`. Budget 500 ms. Items: 66 (44 real, 22 synthetic). Missing: none.

Rates are over items both classifiers answered. *Too little* = predicted below the label (risk of wrong answers); *too much* = above it (only slower). Busy rows where the load stream had stopped are excluded.

## Headline: real messages

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 44/44 | 70% | 100% | 16% | 14% | 251 | 326 | 100% | – |
| flash | busy | 44/44 | 70% | 100% | 16% | 14% | 371 | 434 | 100% | – |
| decima | idle | 44/44 | 45% | 84% | 0% | 55% | 22 | 61 | – | – |
| decima | busy | 44/44 | 45% | 84% | 0% | 55% | 26 | 64 | – | – |
| race | idle | 44/44 | 70% | 100% | 16% | 14% | 251 | 326 | – | 100% |
| race | busy | 44/44 | 70% | 100% | 16% | 14% | 371 | 434 | – | 100% |

## Synthetic prompts

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 22/22 | 64% | 100% | 0% | 36% | 223 | 364 | 100% | – |
| flash | busy | 22/22 | 68% | 100% | 0% | 32% | 347 | 470 | 95% | – |
| decima | idle | 22/22 | 45% | 86% | 9% | 45% | 14 | 62 | – | – |
| decima | busy | 22/22 | 45% | 86% | 9% | 45% | 18 | 66 | – | – |
| race | idle | 22/22 | 64% | 100% | 0% | 36% | 223 | 364 | – | 100% |
| race | busy | 22/22 | 64% | 95% | 0% | 36% | 347 | 470 | – | 95% |

## All items

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 66/66 | 68% | 100% | 11% | 21% | 238 | 326 | 100% | – |
| flash | busy | 66/66 | 70% | 100% | 11% | 20% | 356 | 437 | 98% | – |
| decima | idle | 66/66 | 45% | 85% | 3% | 52% | 17 | 62 | – | – |
| decima | busy | 66/66 | 45% | 85% | 3% | 52% | 21 | 66 | – | – |
| race | idle | 66/66 | 68% | 100% | 11% | 21% | 238 | 326 | – | 100% |
| race | busy | 66/66 | 68% | 98% | 11% | 21% | 356 | 437 | – | 98% |

## Openers vs follow-ups (all items)

### Openers

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 48/48 | 65% | 100% | 8% | 27% | 227 | 326 | 100% | – |
| flash | busy | 48/48 | 67% | 100% | 8% | 25% | 351 | 437 | 98% | – |
| decima | idle | 48/48 | 48% | 90% | 4% | 48% | 15 | 62 | – | – |
| decima | busy | 48/48 | 48% | 90% | 4% | 48% | 19 | 66 | – | – |
| race | idle | 48/48 | 65% | 100% | 8% | 27% | 227 | 326 | – | 100% |
| race | busy | 48/48 | 65% | 98% | 8% | 27% | 351 | 437 | – | 98% |

### Follow-ups

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 18/18 | 78% | 100% | 17% | 6% | 300 | 344 | 100% | – |
| flash | busy | 18/18 | 78% | 100% | 17% | 6% | 415 | 469 | 100% | – |
| decima | idle | 18/18 | 39% | 72% | 0% | 61% | 40 | 81 | – | – |
| decima | busy | 18/18 | 39% | 72% | 0% | 61% | 49 | 80 | – | – |
| race | idle | 18/18 | 78% | 100% | 17% | 6% | 300 | 344 | – | 100% |
| race | busy | 18/18 | 78% | 100% | 17% | 6% | 415 | 469 | – | 100% |

## Confusion matrices (all items, idle)

### flash

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 8 | 3 | 0 | 0 |
| **low** | 2 | 15 | 7 | 0 |
| **medium** | 0 | 2 | 14 | 4 |
| **xhigh** | 0 | 0 | 3 | 8 |

### decima

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 2 | 7 | 0 | 2 |
| **low** | 0 | 9 | 7 | 8 |
| **medium** | 0 | 1 | 9 | 10 |
| **xhigh** | 0 | 0 | 1 | 10 |

### race

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 8 | 3 | 0 | 0 |
| **low** | 2 | 15 | 7 | 0 |
| **medium** | 0 | 2 | 14 | 4 |
| **xhigh** | 0 | 0 | 3 | 8 |

## Calibration (all items, idle)

### flash

| confidence | items | accuracy | mean confidence |
|---|---|---|---|
| 0.25–0.40 | 0 | – | – |
| 0.40–0.55 | 3 | 33% | 50% |
| 0.55–0.70 | 10 | 40% | 63% |
| 0.70–0.85 | 19 | 68% | 79% |
| 0.85–1.00 | 34 | 79% | 94% |

ECE: 0.147

### decima

| confidence | items | accuracy | mean confidence |
|---|---|---|---|
| 0.25–0.40 | 6 | 83% | 37% |
| 0.40–0.55 | 26 | 38% | 49% |
| 0.55–0.70 | 21 | 48% | 62% |
| 0.70–0.85 | 11 | 36% | 75% |
| 0.85–1.00 | 2 | 50% | 92% |

ECE: 0.207

## Errors

- flash idle: {}
- decima idle: {}
- flash busy: {}
- decima busy: {}
