# One-token readout by engine — test set

Items: 66 (44 real, 22 synthetic). Idle condition. Rates are over the items the engine's readout answered. *Too little* = predicted below the label (risk of wrong answers); *too much* = above it (only slower).

## Real messages

| engine | answered | exact | within one | too little | too much | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|
| flash-next | 44/44 | 70% | 100% | 16% | 14% | 260 | 326 |
| 27b-pi | 44/44 | 75% | 100% | 18% | 7% | 334 | 370 |
| 35b-a3b | 44/44 | 45% | 91% | 43% | 11% | 305 | 345 |
| inkling | 44/44 | 68% | 100% | 27% | 5% | 182 | 2106 |

## Synthetic prompts

| engine | answered | exact | within one | too little | too much | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|
| flash-next | 22/22 | 64% | 100% | 0% | 36% | 223 | 364 |
| 27b-pi | 22/22 | 68% | 100% | 9% | 23% | 318 | 380 |
| 35b-a3b | 22/22 | 73% | 100% | 18% | 9% | 276 | 360 |
| inkling | 22/22 | 64% | 95% | 14% | 23% | 127 | 1849 |

## All items

| engine | answered | exact | within one | too little | too much | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|
| flash-next | 66/66 | 68% | 100% | 11% | 21% | 239 | 326 |
| 27b-pi | 66/66 | 73% | 100% | 15% | 12% | 320 | 371 |
| 35b-a3b | 66/66 | 55% | 94% | 35% | 11% | 285 | 360 |
| inkling | 66/66 | 67% | 98% | 23% | 11% | 134 | 2106 |

## Openers

| engine | answered | exact | within one | too little | too much | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|
| flash-next | 45/45 | 62% | 100% | 9% | 29% | 227 | 326 |
| 27b-pi | 45/45 | 69% | 100% | 13% | 18% | 318 | 369 |
| 35b-a3b | 45/45 | 67% | 100% | 18% | 16% | 275 | 332 |
| inkling | 45/45 | 64% | 98% | 20% | 16% | 129 | 1849 |

## Follow-ups

| engine | answered | exact | within one | too little | too much | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|
| flash-next | 21/21 | 81% | 100% | 14% | 5% | 303 | 326 |
| 27b-pi | 21/21 | 81% | 100% | 19% | 0% | 353 | 371 |
| 35b-a3b | 21/21 | 29% | 81% | 71% | 0% | 330 | 378 |
| inkling | 21/21 | 71% | 100% | 29% | 0% | 1864 | 2202 |

## Confusion (all items)

### flash-next

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 8 | 3 | 0 | 0 |
| **low** | 2 | 15 | 7 | 0 |
| **medium** | 0 | 2 | 14 | 4 |
| **xhigh** | 0 | 0 | 3 | 8 |

Errors: {}; ECE 0.149

### 27b-pi

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 10 | 1 | 0 | 0 |
| **low** | 6 | 13 | 5 | 0 |
| **medium** | 0 | 2 | 16 | 2 |
| **xhigh** | 0 | 0 | 2 | 9 |

Errors: {}; ECE 0.061

### 35b-a3b

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 11 | 0 | 0 | 0 |
| **low** | 15 | 6 | 3 | 0 |
| **medium** | 3 | 3 | 10 | 4 |
| **xhigh** | 0 | 1 | 1 | 9 |

Errors: {}; ECE 0.182

### inkling

| true ↓ / predicted → | off | low | medium | xhigh |
|---|---|---|---|---|
| **off** | 8 | 3 | 0 | 0 |
| **low** | 4 | 16 | 4 | 0 |
| **medium** | 0 | 3 | 17 | 0 |
| **xhigh** | 0 | 1 | 7 | 3 |

Errors: {}; ECE 0.225
