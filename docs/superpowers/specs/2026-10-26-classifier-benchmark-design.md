# Reasoning-level classifiers: flash readout vs Decima — design

Date: 2026-10-26 · Status: ready for Michael's review (builder-checked)

## Intent

Michael wants pi to pick the reasoning level for `spark/qwen3.8-flash-next` automatically on each user turn (the planned `spark/flash-auto` virtual model). Before building that router, he wants two candidate classifiers implemented and measured against each other on his own prompts, so the router is built around whichever one actually works. **This phase ends with numbers and a report, not a router.** Michael reviews the results, and the router is a separate, later request.

Why these two (from the 2026-10-26 research review, `~/vault/research/decision-models-for-reasoning-routing.md`):
- **Flash readout**: the already-loaded flash-next answers a multiple-choice question in one forward pass (`max_tokens: 1`, thinking off) and its option-letter logprobs become probabilities. It needs no extra memory (only about 8 GB is free next to flash at `GPU_MEM=0.80`). Large-LLM readout has the best external evidence available (so1 readout on Qwen3.6-27B scored 73.7 vs Jev-1.13's 72.7).
- **Decima-small**: a 122M encoder, already running as a systemd user service on `127.0.0.1:8017` (`POST /v1/systemone`, Jev wire format). It takes 10–30 ms on CPU, gives the same answer whatever the option order, and is reasonably calibrated. It is the likely fallback when flash is loading or busy.

## Goals

1. Two classifier clients with the same interface: input = conversation context, output = probabilities over four levels + latency + error.
2. A labelled test set of about 50 real user turns from Michael's pi sessions: any message Michael typed (what pi's router sees as `reason: "user"`), not only the first message of a session.
3. A benchmark script that runs both classifiers on the test set and writes a results report.
4. A report clear enough for Michael to choose the primary classifier and whether to use the other as fallback.

## Non-goals

- The pi router / virtual model itself (next phase, after Michael reads the numbers).
- Tool-use approvals. Decima showed no signal there (it ranked `git push --force` safer than `ls`); approvals stay rule-based and are a separate topic.
- Other models (hosted Jev, Deem-4B, JEV-9B). The harness should make adding one later cheap, but none are run now.
- Changing pi's `models.json` (including the true-zero-thinking `chat-template` compat change and the 262144 vs 500000 context mismatch). Those are noted for the router phase.

## Anti-goals (failure even if it "works")

- Tuning the prompt wording against the same prompts used to score it. The numbers would flatter both classifiers.
- Giving the two classifiers different information or different questions, so the comparison isn't fair.
- Labels that reflect Claude's taste rather than Michael's.
- Disrupting Michael's live use of flash. The benchmark runs requests one at a time and must not trigger a model swap in llama-swap.

## Decided

**The four levels** (A–D in the readout prompt), mapped to pi thinking levels:

| Label | Meaning | pi level |
|---|---|---|
| A / off | greeting, thanks, trivial lookup or command explanation | off |
| B / low | simple single-step change or question | low |
| C / medium | ordinary feature or fix that needs some investigation | medium |
| D / xhigh | hard debugging, design, cross-cutting multi-file work | xhigh |

Both classifiers are asked this same four-way question directly, with the same option descriptions. This replaces ROUTER_PLAN.md's task-type question ("bugfix/feature/...") and its decision table, because on realistic wording the task type was unreliable.

**Input to both classifiers**: the user message being routed, plus the previous assistant message trimmed to its last ~600 characters when one exists, so "yes, go ahead" is judged in context. Decima has a 512-token state limit, so the same trimmed input goes to both. Long user messages are trimmed head+tail to fit, identically for both.

**Flash readout mechanics** (verified working 2026-10-26): `POST http://localhost:9000/v1/chat/completions`, model `qwen3.8-flash-next`, `chat_template_kwargs: {enable_thinking: false}`, `max_tokens: 1`, `temperature: 0`, `logprobs: true`, `top_logprobs: 20`. Sum the probability mass of tokens that strip to `A`/`B`/`C`/`D` (e.g. `"D"` and `" D"`), then renormalize over the four. Before each readout, check `GET localhost:9000/running`. If flash isn't the running model, record the item as "unavailable" instead of sending a request that would make llama-swap swap models. Observed latency: ~210 ms warm, ~830 ms cold.

**When flash is unavailable during a run** *(Claude's call)*: the runner pauses and polls `/running` until flash is back, rather than skipping, so both classifiers are scored on identical items. Items still unanswered after a long wait (~10 min) are re-run in a later pass. The headline comparison uses only items both classifiers answered. The cascade simulation uses measured latencies, not live outages. The small gap between checking `/running` and sending the request is accepted: llama-swap swaps only when a request for another model arrives, and a pre-run note tells Michael to keep the other models idle during the run.

**Decima mechanics**: one `choice` question over the four levels with the same descriptions as criteria. It runs at its shipped temperature, with no recalibration in this phase.

**Turns sampled** *(Claude's call)*: both opening messages and follow-ups, since follow-ups are most of what a router sees. For a follow-up, the sampler pulls the preceding assistant message from the session file, and the label sheet shows it to Michael next to the prompt. The report splits results into turns with and without previous context.

**Labels**: Claude pulls candidate prompts from `~/.pi/agent/sessions/**/*.jsonl` (102 user messages exist; median 106 chars) and proposes a level and a one-line reason for each. Michael reviews and corrects them. Michael's corrected labels are the ground truth. Sampling should cover all four levels. If real prompts leave a level badly under-represented (fewer than ~6), Claude adds clearly marked hand-written prompts to fill it, and the report gives results with and without them.

**Dev/test split**: ~15 items are a dev set for fixing prompt wording and bugs. ~35 are a frozen test set. The question wording is frozen before the test set is scored, and the report states this.

**Metrics** (per classifier, on the test set; dev reported separately):
- exact accuracy, and accuracy within one level
- a severity-weighted error (distance between predicted and true level), and confusion matrix
- under-thinking vs over-thinking misses, counted separately (under is worse: wrong answers; over is just slower)
- calibration: accuracy bucketed by top-probability confidence, plus ECE
- latency p50 / p95, and error/unavailable counts
- simulated cascade: flash, falling back to Decima when flash is unavailable or slower than an 800 ms budget; and Decima alone with flash consulted below a confidence threshold. Report accuracy and latency for each.

**Code**: TypeScript in a new local git repo `~/workspace/flash-auto` (no remote until Michael says). Classifier clients are written so the later pi extension can import them unchanged. The benchmark is a node script reusing them. `ROUTER_PLAN.md` is **copied** here from `~/jeff` and annotated as superseded by this phase's results *(Claude's call)*. `~/jeff` is left untouched, since the original is uncommitted there and deleting it would be irreversible.

**Privacy**: the test set contains Michael's own prompts and stays in this local repo. Nothing goes to any external service; both classifiers are local.

## Left to the builder

- Repo layout, file names, test framework, how the report is rendered (markdown is fine).
- How Michael reviews labels (e.g. an editable markdown/JSONL sheet), as long as it's quick for ~50 items.
- Exact readout prompt wording beyond the decided level descriptions (tuned on dev only).
- Timeouts and retry behaviour inside the benchmark.
- Whether to reuse anything from `~/jeff/bench` (Python); the new code is TypeScript regardless.

## Done when

Both clients pass their tests. The labelled set is reviewed by Michael. The benchmark has run on the frozen test set. A report in the repo shows the metrics above with a plain-language recommendation for primary/fallback. Michael then decides on the router phase.
