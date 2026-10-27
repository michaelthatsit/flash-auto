# Classifier benchmark — test set

Prompt versions: flash `92e63297f148`, decima `c2c6a3880e09`. Budget 500 ms. Items: 66 (44 real, 22 synthetic). Missing: none.

Rates are over items both classifiers answered. *Too little* = predicted below the label (risk of wrong answers); *too much* = above it (only slower). Busy rows where the load stream had stopped are excluded.

## Headline: real messages

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 44/44 | 70% | 100% | 16% | 14% | 260 | 326 | 100% | – |
| flash | busy | 44/44 | 70% | 100% | 16% | 14% | 380 | 437 | 100% | – |
| decima | idle | 44/44 | 45% | 84% | 0% | 55% | 25 | 61 | – | – |
| decima | busy | 44/44 | 45% | 84% | 0% | 55% | 28 | 69 | – | – |
| race | idle | 44/44 | 70% | 100% | 16% | 14% | 260 | 326 | – | 100% |
| race | busy | 44/44 | 70% | 100% | 16% | 14% | 380 | 437 | – | 100% |

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
| flash | idle | 66/66 | 68% | 100% | 11% | 21% | 239 | 326 | 100% | – |
| flash | busy | 66/66 | 70% | 100% | 11% | 20% | 359 | 446 | 98% | – |
| decima | idle | 66/66 | 45% | 85% | 3% | 52% | 18 | 62 | – | – |
| decima | busy | 66/66 | 45% | 85% | 3% | 52% | 21 | 69 | – | – |
| race | idle | 66/66 | 68% | 100% | 11% | 21% | 239 | 326 | – | 100% |
| race | busy | 66/66 | 68% | 98% | 11% | 21% | 359 | 446 | – | 98% |

## Openers vs follow-ups (all items)

### Openers

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 45/45 | 62% | 100% | 9% | 29% | 227 | 326 | 100% | – |
| flash | busy | 45/45 | 64% | 100% | 9% | 27% | 350 | 437 | 98% | – |
| decima | idle | 45/45 | 49% | 91% | 4% | 47% | 15 | 62 | – | – |
| decima | busy | 45/45 | 49% | 91% | 4% | 47% | 19 | 66 | – | – |
| race | idle | 45/45 | 62% | 100% | 9% | 29% | 227 | 326 | – | 100% |
| race | busy | 45/45 | 62% | 98% | 9% | 29% | 350 | 437 | – | 98% |

### Follow-ups

| arm | condition | answered | exact | within one | too little | too much | p50 ms | p95 ms | flash ≤500 ms | race used flash |
|---|---|---|---|---|---|---|---|---|---|---|
| flash | idle | 21/21 | 81% | 100% | 14% | 5% | 303 | 326 | 100% | – |
| flash | busy | 21/21 | 81% | 100% | 14% | 5% | 415 | 446 | 100% | – |
| decima | idle | 21/21 | 38% | 71% | 0% | 62% | 41 | 61 | – | – |
| decima | busy | 21/21 | 38% | 71% | 0% | 62% | 49 | 69 | – | – |
| race | idle | 21/21 | 81% | 100% | 14% | 5% | 303 | 326 | – | 100% |
| race | busy | 21/21 | 81% | 100% | 14% | 5% | 415 | 446 | – | 100% |

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
| 0.55–0.70 | 11 | 45% | 63% |
| 0.70–0.85 | 17 | 65% | 79% |
| 0.85–1.00 | 35 | 80% | 94% |

ECE: 0.149

### decima

| confidence | items | accuracy | mean confidence |
|---|---|---|---|
| 0.25–0.40 | 5 | 100% | 38% |
| 0.40–0.55 | 26 | 38% | 49% |
| 0.55–0.70 | 20 | 50% | 62% |
| 0.70–0.85 | 13 | 31% | 75% |
| 0.85–1.00 | 2 | 50% | 92% |

ECE: 0.226

## Errors

- flash idle: {}
- decima idle: {}
- flash busy: {}
- decima busy: {}
