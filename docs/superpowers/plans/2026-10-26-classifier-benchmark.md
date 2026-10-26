# Reasoning-Level Classifier Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two reasoning-level classifiers (flash-next logprob readout, Decima-small) behind one interface, build a labelled test set from Michael's pi sessions, and benchmark both, plus the 300 ms race between them, idle and under load.

**Architecture:** Zero-runtime-dependency TypeScript run directly by Node 26 (native type stripping). `src/` holds what the future pi router imports unchanged (levels, input trimming, the two classifiers, race resolution). `bench/` holds session sampling, the label sheet, the runner, metrics and the report. HTTP goes through an injectable `fetch` so every client is unit-tested with fakes; live checks are separate smoke commands.

**Tech Stack:** Node v26.9.0, `node:test` + `node:assert/strict`, TypeScript (type-check only, devDependency), vLLM OpenAI-compatible API via llama-swap `:9000`, Decima `POST /v1/systemone` on `127.0.0.1:8017`.

**Spec:** `docs/superpowers/specs/2026-10-26-classifier-benchmark-design.md`

## Global Constraints

- Decision budget: **300 ms** added before the model starts replying (`BUDGET_MS = 300`).
- Levels, in order: `off`, `low`, `medium`, `xhigh` ↔ letters `A`, `B`, `C`, `D`. Both classifiers get the same four descriptions (`LEVEL_DESCRIPTIONS` in `src/levels.ts`).
- Both classifiers receive identical trimmed input: the user message, plus the previous assistant message's last **600** characters when there is one.
- Flash readout request: model `qwen3.8-flash-next`, `chat_template_kwargs: {enable_thinking: false}`, `max_tokens: 1`, `temperature: 0`, `logprobs: true`, `top_logprobs: 20`, fixed instructions first and the message last.
- Never trigger a llama-swap model swap: check `GET /running` before flash requests; while flash isn't running, pause and poll (every 10 s, up to 10 min), never skip.
- Dev split ~15 items, test ~35. Question wording is frozen (hashed) before the test set is scored.
- All data stays in this local repo; no external services; no git remote.
- `~/jeff` is not modified (ROUTER_PLAN.md is copied, not moved).
- Git commits use `git -c user.name="Michael Gutensohn" -c user.email=michael@gutensohn.me commit ...` (no global identity on this box) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Flash's top logprobs contain none of A–D (the model starts with "The" or a space-only token): classify returns `{ok:false, error:"parse"}`, never uniform or `NaN` probabilities. Test in Task 2.
2. A prompt that contains the readout delimiter (`>>>`) or a huge pasted log: the trimmed input stays within limits and the delimiter can't end the message block early. Tests in Tasks 1 and 2.
3. Session files with branches, compaction/system entries, string-vs-array content and image-only user messages: extraction skips non-text turns and finds the previous assistant along the `parentId` chain, not the file order. Test in Task 5.
4. Load generation dies mid-run, so the "busy" condition isn't actually busy: each row records `loadActive`, and metrics exclude busy rows where it is false. Tests in Tasks 7 and 8.
5. The first flash call after load is cold (~830 ms) and would skew latency: the runner sends one discarded warm-up call per run. Test in Task 7.

---

### Task 1: Scaffold, levels, input trimming

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `src/levels.ts`, `src/input.ts`, `src/types.ts`, `ROUTER_PLAN.md` (copy of `~/jeff/ROUTER_PLAN.md` with a header line: `> Superseded by docs/superpowers/specs/2026-10-26-classifier-benchmark-design.md; kept for history.`)
- Test: `test/input.test.ts`

**Interfaces:**
- Produces:
  - `src/levels.ts`: `export const LEVELS = ["off","low","medium","xhigh"] as const; export type Level = typeof LEVELS[number]; export const LETTERS: Record<Level,"A"|"B"|"C"|"D">; export const LEVEL_DESCRIPTIONS: Record<Level,string>; export function levelDistance(a: Level, b: Level): number` (absolute index difference). Descriptions, verbatim:
    - off: `greeting, thanks, trivial lookup or command explanation`
    - low: `simple single-step change or question`
    - medium: `ordinary feature or fix that needs some investigation`
    - xhigh: `hard debugging, design, cross-cutting multi-file work`
  - `src/input.ts`: `export interface ClassifierInput { prompt: string; previous?: string }`; `export function buildClassifierInput(prompt: string, previousAssistant?: string): ClassifierInput`; constants `PREVIOUS_MAX_CHARS = 600`, `PROMPT_MAX_CHARS = 1000`, `PROMPT_HEAD_CHARS = 700`, `PROMPT_TAIL_CHARS = 300`.
  - `src/types.ts`: `export type Probs = Record<Level, number>`; `export type Classification = { ok: true; probs: Probs; level: Level; confidence: number; latencyMs: number } | { ok: false; error: "timeout"|"unavailable"|"http"|"parse"; detail: string; latencyMs: number }`; `export interface Classifier { name: "flash"|"decima"; classify(input: ClassifierInput, signal?: AbortSignal): Promise<Classification> }`; `export function fromProbs(probs: Probs, latencyMs: number): Classification` (normalises so the probabilities sum to 1, sets level = argmax and confidence = max).

- [ ] **Step 1: Scaffold.** `package.json`: `"type":"module"`, `"private":true`, scripts `"test": "node --test test/*.test.ts"`, `"typecheck": "tsc --noEmit"`; devDependencies `typescript`, `@types/node`. `tsconfig.json`: `"allowImportingTsExtensions": true, "noEmit": true, "erasableSyntaxOnly": true, "strict": true, "module": "nodenext"`. Imports use explicit `.ts` extensions. `.gitignore`: `node_modules/`. Copy ROUTER_PLAN.md as listed. `npm install`.
- [ ] **Step 2: Write failing tests** in `test/input.test.ts`:
  - `short prompt passes through`: `buildClassifierInput("hi")` deep-equals `{prompt:"hi"}` (no `previous` key).
  - `previous keeps last 600 chars`: previous = `"x".repeat(1000)+"END"` → `previous.length === 600`, ends with `"END"`.
  - `long prompt keeps head and tail`: prompt = `"H"+"m".repeat(5000)+"T"` → length ≤ 1000 + marker length, starts with `"H"`, ends with `"T"`, contains `"\n…\n"`.
  - `empty previous is dropped`: `buildClassifierInput("x", "   ")` has no `previous`.
  - `fromProbs normalises`: `fromProbs({off:1,low:1,medium:2,xhigh:0},5)` → `level==="medium"`, `confidence===0.5`.
- [ ] **Step 3: Run** `npm test` → FAIL (modules missing).
- [ ] **Step 4: Implement** `levels.ts`, `types.ts`, `input.ts`. The trim marker is `"\n…\n"`.
- [ ] **Step 5: Run** `npm test && npm run typecheck` → PASS, no type errors.
- [ ] **Step 6: Commit** `feat: scaffold, levels and classifier input trimming`.

### Task 2: Flash readout classifier

**Files:**
- Create: `src/flash.ts`, `bench/smoke.ts`
- Test: `test/flash.test.ts`

**Interfaces:**
- Consumes: `ClassifierInput`, `Classifier`, `Classification`, `fromProbs`, `LEVELS`, `LETTERS`, `LEVEL_DESCRIPTIONS`.
- Produces (`src/flash.ts`):
  - `export interface FlashOptions { baseUrl?: string /* default "http://localhost:9000" */; model?: string /* "qwen3.8-flash-next" */; timeoutMs?: number /* default 5000 */; fetch?: typeof fetch }`
  - `export function buildReadoutMessages(input: ClassifierInput): {role:"user"; content:string}[]` — one user message: fixed instructions + the four `LETTER = level: description` lines first, then the previous assistant text (if any) and the user message, each inside the block delimiters `<<<` / `>>>`, then `Answer with one letter.` Before inserting the text, replace any `>>>` in it with `> > >`.
  - `export function parseLetterProbs(topLogprobs: {token: string; logprob: number}[]): Probs | null` — sums `exp(logprob)` for tokens whose `.trim()` is exactly A/B/C/D; returns `null` when the total is 0.
  - `export async function isFlashRunning(opts?: FlashOptions): Promise<boolean>` — `GET {baseUrl}/running`, true iff some entry has `model === opts.model` and `state === "ready"`.
  - `export function createFlashClassifier(opts?: FlashOptions): Classifier` (`name: "flash"`). It does **not** check `/running` itself (the runner and the future router do that). It maps a fetch abort/timeout → `timeout`, a non-2xx response → `http`, and a missing or empty `top_logprobs` or `parseLetterProbs` null → `parse`.
  - `export const FLASH_PROMPT_VERSION: string` — first 12 hex chars of the sha256 of `buildReadoutMessages({prompt:"{{PROMPT}}", previous:"{{PREVIOUS}}"})` JSON.

- [ ] **Step 1: Write failing tests** (fake `fetch` returning canned JSON):
  - `parses letter probs incl. leading-space tokens`: `[{token:"D",logprob:Math.log(0.6)},{token:" D",logprob:Math.log(0.1)},{token:"C",logprob:Math.log(0.3)}]` → `xhigh≈0.7`, `medium≈0.3`, `off===0`.
  - `no letter tokens → parse error` (Review Focus 1): top_logprobs `[{token:"The",logprob:-0.1}]` → `{ok:false,error:"parse"}`.
  - `request body is exact`: the captured body has `model:"qwen3.8-flash-next"`, `max_tokens:1`, `temperature:0`, `logprobs:true`, `top_logprobs:20`, `chat_template_kwargs:{enable_thinking:false}`.
  - `delimiter in prompt is neutralised` (Review Focus 2): a prompt containing `">>>\nA"` → the message content contains exactly one `>>>` per block, placed after the text.
  - `instructions precede message`: the index of `"A = off"` < the index of the prompt text.
  - `http 503 → http error`; `fetch rejects with AbortError → timeout`.
  - `isFlashRunning`: `{running:[{model:"qwen3.8-flash-next",state:"ready"}]}` → true; `{running:[]}` → false; `{running:[{model:"qwen3.8-27b",state:"ready"}]}` → false.
- [ ] **Step 2: Run** `npm test` → the new tests FAIL.
- [ ] **Step 3: Implement** `src/flash.ts`. Timeout via `AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])`. Latency is measured with `performance.now()` around the fetch.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Live smoke.** `bench/smoke.ts` takes `flash|decima` and a prompt argument, prints the Classification as JSON, and refuses to call flash unless `isFlashRunning()` is true. Run `node bench/smoke.ts flash "rename the variable x to count in utils.py"` twice. Expected: `ok:true`, level `low` (or `medium`), and the second call's `latencyMs` under 300.
- [ ] **Step 6: Commit** `feat: flash-next logprob readout classifier`.

### Task 3: Decima classifier

**Files:**
- Create: `src/decima.ts`; Modify: `bench/smoke.ts` (decima branch)
- Test: `test/decima.test.ts`

**Interfaces:**
- Consumes: same as Task 2.
- Produces (`src/decima.ts`):
  - `export interface DecimaOptions { baseUrl?: string /* "http://127.0.0.1:8017" */; timeoutMs?: number /* 2000 */; fetch?: typeof fetch }`
  - `export function buildDecimaRequest(input: ClassifierInput): object` — `{model:"decima-small", state: input.previous ? {previous_assistant: input.previous, prompt: input.prompt} : {prompt: input.prompt}, questions:{level:{type:"choice", instructions: DECIMA_INSTRUCTIONS, criteria: LEVEL_DESCRIPTIONS}}}`, where the criteria keys are the level names and `DECIMA_INSTRUCTIONS` = `"How much reasoning does a coding agent need to handle \`prompt\` well?"`.
  - `export function parseDecimaResponse(json: unknown): Probs | null` — reads `answers.level.probabilities`; null if any of the four levels is missing.
  - `export function createDecimaClassifier(opts?: DecimaOptions): Classifier` (`name: "decima"`), with the same error mapping as flash.
  - `export const DECIMA_PROMPT_VERSION: string` — 12-hex sha256 of `DECIMA_INSTRUCTIONS + JSON.stringify(LEVEL_DESCRIPTIONS)`.

- [ ] **Step 1: Write failing tests:** the request has `criteria` deep-equal to `LEVEL_DESCRIPTIONS`; `state.previous_assistant` is present only when `previous` is set; probabilities parse; a missing `xhigh` key → `parse` error; connection refused (fetch rejects with `TypeError`) → `unavailable`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Live smoke + overlong check.** Run `node bench/smoke.ts decima "hi"` → `ok:true`, level `off`, latency < 60 ms. Then run it with a 3,000-character code-heavy prompt (trimmed by `buildClassifierInput` to ≤1000 chars + 600 previous). Expected: `ok:true` (Decima truncates internally; record in README.md that inputs past 512 tokens are cut by Decima). If it returns an HTTP error instead, lower `PROMPT_MAX_CHARS` to 800 (head 560 / tail 240), update the Task 1 test values, and re-run.
- [ ] **Step 6: Commit** `feat: Decima classifier client`.

### Task 4: Race resolution

**Files:**
- Create: `src/race.ts`
- Test: `test/race.test.ts`

**Interfaces:**
- Consumes: `Classification`, `Level`.
- Produces:
  - `export const BUDGET_MS = 300`
  - `export type RaceOutcome = { source: "flash"|"decima"|"none"; level: Level | null; addedDelayMs: number }`
  - `export function resolveRace(flash: Classification, decima: Classification, budgetMs = BUDGET_MS): RaceOutcome` — the pure rule: if flash is ok and `flash.latencyMs <= budgetMs`, the answer is flash with delay `flash.latencyMs`. Otherwise, if decima is ok, the answer is decima with delay `min(budgetMs, max(decima.latencyMs, flash.ok ? budgetMs : flash.latencyMs))`: an early flash failure lets Decima's answer go out as soon as it is ready. Otherwise `none`, level null, delay `budgetMs`.
  - `export async function raceClassify(flash: Classifier, decima: Classifier, input: ClassifierInput, budgetMs = BUDGET_MS, signal?: AbortSignal): Promise<RaceOutcome & { flash: Classification; decima: Classification }>` — starts both at once, aborts flash at the budget, and applies `resolveRace`. (The benchmark uses `resolveRace` on recorded results; the router will use `raceClassify`.)

- [ ] **Step 1: Write failing tests** for `resolveRace`: flash ok @210 → flash/210; flash ok @450 & decima ok @20 → decima/300; flash `http` error @15 & decima ok @25 → decima/25; both fail → none/300. For `raceClassify` with fake classifiers (flash resolves after 1000 ms, decima after 10 ms): resolves in < 400 ms wall time with source `decima`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: 300 ms flash/decima race`.

### Task 5: Turn extraction from pi sessions

**Files:**
- Create: `bench/turns.ts`, `test/fixtures/session-branchy.jsonl`
- Test: `test/turns.test.ts`

**Interfaces:**
- Produces:
  - `export interface Turn { id: string /* "<sessionFileBasename>#<entryId>" */; prompt: string; previous?: string; kind: "opener"|"follow-up"; source: "session" }`
  - `export function extractTurns(jsonl: string, fileId: string): Turn[]` — the entries are `{type:"message", id, parentId, message:{role, content}}`. Content is a string or an array of blocks; user text = the joined `type:"text"` blocks. Skip user messages whose text is empty after trimming (image-only). For each user message, walk `parentId` upward to the nearest `role:"assistant"` entry. If it has text blocks (ignore `thinking`/`toolCall` blocks), that joined text is `previous` and the turn is a `follow-up`. If the walk reaches the root without an assistant, it's an `opener`. Malformed lines are skipped.
  - CLI `node bench/turns.ts` → reads `~/.pi/agent/sessions/**/*.jsonl` and writes `data/turns.jsonl` (all turns, deduped by exact prompt text), then prints counts by kind.

- [ ] **Step 1: Write the fixture** (Review Focus 3): a session with a system entry, a user opener, an assistant with only `thinking`+`toolCall` blocks, a toolResult, an assistant with text "Plan: do X", then two **sibling** user replies with the same parentId (a branch), an image-only user message, and one malformed line.
- [ ] **Step 2: Write failing tests:** 3 turns are extracted (opener + both branch replies); both branch replies have `previous === "Plan: do X"` and kind `follow-up`; the opener has no `previous`; the image-only message and the malformed line are absent.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Run the CLI.** `node bench/turns.ts` → `data/turns.jsonl` exists; the printed total is ≤102 and > 50.
- [ ] **Step 7: Commit** `feat: extract user turns from pi sessions` (include `data/turns.jsonl`).

### Task 6: Label sheet, draft labels, Michael's review

**Files:**
- Create: `bench/labels.ts`, `data/labels.md` (drafted by the implementer), `data/testset.jsonl` (generated)
- Test: `test/labels.test.ts`

**Interfaces:**
- Consumes: `Turn`, `LEVELS`, `Level`.
- Produces:
  - `export interface LabeledItem extends Turn { level: Level; reason: string; split: "dev"|"test"; handwritten: boolean }`
  - `export function renderLabelSheet(items: Omit<LabeledItem,"split">[]): string` / `export function parseLabelSheet(md: string): Omit<LabeledItem,"split">[]` — one `## <id> · <kind>[ · handwritten]` section per item, with `**Previous assistant:**` and `**Prompt:**` as `>`-quoted blocks, then the lines `level: <level>` and `reason: <text>`. Parsing throws, naming the item id, on an unknown level.
  - `export function assignSplits(items, devCount = 15, seed = 42): LabeledItem[]` — a deterministic seeded shuffle, stratified by level, so the dev set gets a proportional share of every level.
  - CLI `node bench/labels.ts build` → parses `data/labels.md` and writes `data/testset.jsonl`, then prints counts per level × split × kind.

- [ ] **Step 1: Write failing tests:** render→parse round-trips three items, including multi-line prompts and a prompt containing `level: off`, which must not be taken as the label line; parsing `level: high` throws with the item id; `assignSplits` returns exactly 15 dev, is identical across two calls, and every level with ≥3 items has ≥1 in dev.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Commit** `feat: label sheet format and splits`.
- [ ] **Step 5: Draft labels (manual judgement).** From `data/turns.jsonl`, choose ~50 turns. Include both openers and follow-ups (at least 15 follow-ups if available), and skip near-duplicates and slash-command-only messages. Propose a level and a one-line reason for each, judged by the Global Constraints descriptions. If any level has fewer than 6 items, add hand-written prompts marked `handwritten` to reach 6. Write `data/labels.md` via `renderLabelSheet`. Commit `data: draft labels for review`.
- [ ] **Step 6: CHECKPOINT — Michael reviews `data/labels.md`.** Stop and ask him to edit the `level:` lines he disagrees with. Do not continue until he says the sheet is done.
- [ ] **Step 7:** `node bench/labels.ts build` → `data/testset.jsonl` with 15 dev items. Commit `data: reviewed labels and dev/test split`.

### Task 7: Benchmark runner (idle and busy)

**Files:**
- Create: `bench/run.ts`, `bench/load.ts`
- Test: `test/run.test.ts`

**Interfaces:**
- Consumes: `createFlashClassifier`, `isFlashRunning`, `createDecimaClassifier`, `buildClassifierInput`, `LabeledItem`, `FLASH_PROMPT_VERSION`, `DECIMA_PROMPT_VERSION`.
- Produces:
  - `export interface RunRow { itemId: string; condition: "idle"|"busy"; flash: Classification; decima: Classification; loadActive: boolean; promptVersion: { flash: string; decima: string }; at: string }`
  - `export async function waitForFlash(isRunning: () => Promise<boolean>, opts?: { intervalMs?: number /* 10000 */; maxWaitMs?: number /* 600000 */; sleep?: (ms:number)=>Promise<void> }): Promise<boolean>`
  - `export async function runBenchmark(opts: { items: LabeledItem[]; condition: "idle"|"busy"; outFile: string; flash: Classifier; decima: Classifier; isFlashRunning: () => Promise<boolean>; load?: LoadHandle; waitOpts?: Parameters<typeof waitForFlash>[1] }): Promise<{ written: number; skipped: number; missing: string[] }>` — appends JSONL rows. On resume, items whose existing row has `flash.ok && decima.ok` are skipped, so re-running the same command fills gaps. Before the first item it sends one warm-up flash call, which is discarded. For each item it calls `waitForFlash`, and if that returns false it adds the id to `missing` and moves on. It runs both classifiers **concurrently** (`Promise.all`). `loadActive` = `load?.isActive() ?? false`.
  - `bench/load.ts`: `export interface LoadHandle { isActive(): boolean; stop(): Promise<void> }`; `export function startLoad(opts?: FlashOptions): LoadHandle` — loops streaming chat completions (thinking off, `max_tokens: 4000`, prompt `"Write a very long, detailed technical essay about distributed databases."`) back-to-back until stopped. `isActive` is true while a stream is open and has produced a token within the last 2 s.
  - CLI `node bench/run.ts --set dev|test --condition idle|busy` → writes `results/<set>-<condition>.jsonl`. A busy run starts the load, waits until `isActive()` (max 30 s, otherwise exits with an error), and stops it at the end. It prints a reminder before starting: "keep qwen3.8-27b / qwen3.6-35b idle during the run".

- [ ] **Step 1: Write failing tests** (fake classifiers, fake `isFlashRunning`, temp outFile):
  - `warm-up call is discarded` (Review Focus 5): with 2 items, the fake flash is called 3 times and 2 rows are written.
  - `pauses until flash returns`: isRunning returns false twice then true; with an injected no-op `sleep`, the row is still written and `missing` is empty.
  - `gives up after maxWaitMs`: isRunning is always false → `missing` contains the id and no row is written.
  - `resume skips complete rows`: with a pre-existing ok/ok row for item 1, only item 2 is written.
  - `loadActive recorded` (Review Focus 4): a fake load whose `isActive` flips to false before item 2 → row 2 has `loadActive:false`.
  - `both run concurrently`: two fakes that each take 100 ms → the per-item wall time is < 180 ms.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Live dev run.** `node bench/run.ts --set dev --condition idle` → `results/dev-idle.jsonl` has 15 rows, and `missing` is empty. Then the same with `--condition busy` → 15 rows, all `loadActive:true`.
- [ ] **Step 6: Commit** `feat: benchmark runner with load generator` (include the dev results).

### Task 8: Metrics

**Files:**
- Create: `bench/metrics.ts`
- Test: `test/metrics.test.ts`

**Interfaces:**
- Consumes: `RunRow`, `LabeledItem`, `resolveRace`, `levelDistance`, `BUDGET_MS`.
- Produces:
  - `export type Arm = "flash"|"decima"|"race"`
  - `export interface Metrics { n: number; answered: number; exact: number; withinOne: number; meanDistance: number; under: number; over: number; confusion: Record<Level, Record<Level, number>> /* [true][pred] */; calibration: { lo: number; hi: number; n: number; accuracy: number; meanConf: number }[]; ece: number; latency: { p50: number; p95: number; max: number }; errors: Record<string, number>; withinBudget?: number /* share of flash answers ≤ BUDGET_MS */; flashShare?: number /* race only */ }`
  - `export function computeMetrics(rows: RunRow[], items: Map<string, LabeledItem>, arm: Arm): Metrics` — for the race arm, the answer and latency come from `resolveRace(row.flash, row.decima)`, and the race has no calibration (its `calibration` is `[]`, `ece` NaN). Rows with `condition === "busy" && !loadActive` are excluded. Accuracy, calibration and latency use only rows where **both** `flash.ok` and `decima.ok` (spec: the headline compares identical items); `errors` counts every row, and `answered` is that both-ok count. `under` = predicted level below the true level. Calibration buckets on top probability: `[0.25,0.4)`, `[0.4,0.55)`, `[0.55,0.7)`, `[0.7,0.85)`, `[0.85,1]`. ECE = Σ (n_b/answered)·|accuracy_b − meanConf_b|. Percentiles use the nearest-rank method.
  - `export function filterItems(items: LabeledItem[], f: { split?: "dev"|"test"; kind?: "opener"|"follow-up"; includeHandwritten?: boolean }): LabeledItem[]`

- [ ] **Step 1: Write failing tests** with hand-built rows: (a) true medium / pred xhigh → `over:1`, `meanDistance:1`; (b) true xhigh / pred off → `under:1`, distance 3; (c) a confusion cell count; (d) ECE for two items at 0.9 confidence, one right and one wrong → `0.4`; (e) p95 of `[10,20,…,200]` (20 values) → `190`; (f) a busy row with `loadActive:false` is excluded (Review Focus 4); (g) race arm: a flash at 450 ms + decima ok → race takes decima's level, `flashShare:0`; (h) a row with a flash `parse` error is counted in `errors.parse` for the flash arm but excluded from the accuracy of all three arms.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: benchmark metrics`.

### Task 9: Report, freeze, test run, recommendation

**Files:**
- Create: `bench/report.ts`, `results/REPORT.md`
- Test: `test/report.test.ts`

**Interfaces:**
- Consumes: `computeMetrics`, `filterItems`, `RunRow`, `LabeledItem`, the prompt-version constants.
- Produces: CLI `node bench/report.ts --set dev|test` → writes `results/REPORT-<set>.md` with: a headline table (arms × conditions: exact, within-one, under, over, p50/p95 latency, flash-within-budget, race flash share); confusion matrices; calibration tables; breakdowns for openers vs follow-ups and with/without handwritten items; the prompt versions; and the item counts plus missing ids. It exits non-zero if the rows' `promptVersion` doesn't match the current constants.

- [ ] **Step 1: Write a failing test:** `renderReport` on two fixture rows produces markdown containing `| race | idle |` and the prompt-version hashes, and throws on a version mismatch.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. Commit `feat: benchmark report`.
- [ ] **Step 5: Dev iteration.** `node bench/report.ts --set dev`. Wording may be tweaked here (flash instructions, `DECIMA_INSTRUCTIONS`), but **not** the level descriptions, which are spec-fixed. Re-run the dev set after each tweak; at most 3 iterations. Commit each tweak with its dev numbers in the message.
- [ ] **Step 6: Freeze.** Record `FLASH_PROMPT_VERSION` and `DECIMA_PROMPT_VERSION` in `README.md` under "Frozen for test run". Commit `chore: freeze classifier wording`.
- [ ] **Step 7: Test run.** `node bench/run.ts --set test --condition idle`, then `--condition busy`. Re-run either command until `missing` is empty (or report the remaining ids). Then `node bench/report.ts --set test`. Expected: `results/REPORT-test.md` is written, with no version-mismatch error.
- [ ] **Step 8: Write the recommendation by hand** at the top of `results/REPORT.md`, linking the dev and test reports. In plain language: which classifier should be primary, whether the 300 ms race is worth it versus Decima alone (using the busy-condition flash share), the under-thinking rate of each, and any surprises. Commit `docs: benchmark results and recommendation`.
- [ ] **Step 9: CHECKPOINT — hand the report to Michael.** Stop. The router phase is a separate request.
