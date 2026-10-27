# models.json change for flash (2026-10-26)

File: `~/.pi/agent/models.json`, entry `spark` → `qwen3.8-flash-next`. Backup: `~/.pi/agent/models.json.bak-2026-10-26`.

| | Before | After |
|---|---|---|
| `contextWindow` | 262144 | 500000 (vLLM serves `--max-model-len 500000`) |
| `thinkingLevelMap.off` | `"low"` (off silently meant low) | removed |
| `compat` | provider-level `{ supportsDeveloperRole: false }` only | model-level `{ supportsDeveloperRole: false, thinkingFormat: "chat-template", chatTemplateKwargs: { enable_thinking: {$var: "thinking.enabled"}, reasoning_effort: {$var: "effort", omitWhenOff: true} } }` |

The other two models (27B, 35B-A3B) are unchanged.

## Verified through pi

`pi --mode json --model spark/qwen3.8-flash-next --thinking <level>` on the train catch-up prompt:

| level | reasoning tokens | output tokens |
|---|---|---|
| off | 0 | 52 |
| low | 76 | 95 |
| medium | 113 | 132 |
| xhigh | 121 | 140 |

No errors. One sample per level; medium and xhigh are close on a prompt this easy.

To undo: `cp ~/.pi/agent/models.json.bak-2026-10-26 ~/.pi/agent/models.json`.
