# flash-auto Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pi virtual model `spark/flash-auto` that sends every request to `spark/qwen3.8-flash-next` at a reasoning level flash chooses for itself, with true-zero "off".

**Architecture:** A pure decision function (`src/router.ts`) implements the spec's routing table with injected dependencies (classify, running check, clock), so every row is unit-tested without pi or a GPU. A thin pi extension (`src/extension.ts`) registers one virtual model per entry in `src/models.ts`, maps decisions to physical routes, keeps router state, and appends a decision log. The benchmark's `src/flash.ts` / `src/input.ts` are reused unchanged in behaviour.

**Tech Stack:** Node v26 (native TS), `node:test`, pi 1.0.2 extension API (`ExtensionAPI.registerVirtualModel`, `ModelRouteRequest`, `ModelRoute` from `@earendil-works/pi-coding-agent`), vLLM behind llama-swap `:9000`.

**Spec:** `docs/superpowers/specs/2026-10-26-flash-auto-router-design.md`

## Global Constraints

- One shared **500 ms** deadline covers the `/running` check and the classify call (`ROUTER_BUDGET_MS = 500`). A `/running` timeout counts as "not running".
- The classifier is only called when flash is already the running, ready model. Never trigger a llama-swap swap.
- Fallback level: **previous level, else `medium`**.
- Continuations and retries keep the turn's level; the physical model is always the config's physical model (`spark` / `qwen3.8-flash-next`), never `request.previous.model`.
- Go-ahead list includes at least: `do it`, `yes`, `yep`, `go ahead`, `go for it`, `ok`, `ok do it`, `sounds good`, `proceed`, `continue`, `ship it`, `lgtm`, `yes please`, `please do` (≤ 40 chars, trimmed, lowercased, trailing punctuation stripped).
- Steering messages (the message before the new user message is a `toolResult`, or an assistant message containing a `toolCall` block) keep the previous level.
- Classifier wording is frozen at the benchmarked versions; don't change `src/flash.ts` prompts or `src/levels.ts` descriptions.
- Decision log: `~/.pi/agent/flash-auto.jsonl`, one line per `user` decision, no prompt text. Log failures never affect routing.
- Back up `~/.pi/agent/models.json` and `~/.pi/agent/settings.json` before editing them.
- Commits: `git -c user.name="Michael Gutensohn" -c user.email=michael@gutensohn.me commit ...`, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `feat/router`.

## Review Focus

1. A session switched to flash-auto after turns on another model (`request.previous.model` is the 27B): continuations must still dispatch to flash, carrying only the level. Test in Task 3.
2. The user presses Esc while the router is classifying (`request.signal` aborts): the decision returns promptly with the fallback level and the route doesn't throw. Test in Task 2.
3. An image-only or empty user message (no text): no classify call; fallback level. Test in Task 2.
4. The decision log can't be written (directory missing, permissions): routing still returns normally. Test in Task 3.
5. The physical model is missing from pi's registry (models.json changed): route throws an error naming `spark/qwen3.8-flash-next`, instead of an obscure crash. Test in Task 3.

---

### Task 1: Model config and go-ahead detection

**Files:**
- Create: `src/models.ts`, `src/goahead.ts`
- Modify: `package.json` (add `"keywords": ["pi-package"]`, `"pi": { "extensions": ["./src/extension.ts"] }`, devDependency `@earendil-works/pi-coding-agent` pointing at the installed release for types only: `"file:/home/michael/.pi/agent/install/releases/1.0.2/node_modules/@earendil-works/pi-coding-agent"`; if that fails to install, use a local `src/pi-types.ts` with the `ModelRouteRequest`/`ModelRoute`/`VirtualModelDefinition` shapes copied from `dist/core/virtual-models.d.ts` and ledger it)
- Test: `test/goahead.test.ts`, `test/models.test.ts`

**Interfaces:**
- Produces:
  - `src/models.ts`: `export interface AutoModel { virtualId: string; name: string; provider: string; physicalId: string; baseUrl: string; swapModel: string }` and `export const AUTO_MODELS: AutoModel[]` with one entry: `{ virtualId: "flash-auto", name: "Qwen3.8 Flash-Next (auto)", provider: "spark", physicalId: "qwen3.8-flash-next", baseUrl: "http://localhost:9000", swapModel: "qwen3.8-flash-next" }`.
  - `src/goahead.ts`: `export function isGoAhead(text: string): boolean`.

- [ ] **Step 1: Write failing tests:** every listed phrase → true, including `"Do it!"`, `"  yes. "`, `"LGTM"`; `"yes, but also refactor the auth module and add tests for every handler"` → false (over 40 chars); `"do it differently"` → false; `""` → false. `AUTO_MODELS` has exactly one entry and its `virtualId !== physicalId`.
- [ ] **Step 2: Run** `npm test` → new tests FAIL (modules missing).
- [ ] **Step 3: Implement** both files; update `package.json`; `npm install`.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: auto-model config and go-ahead detection`.

### Task 2: Decision function

**Files:**
- Create: `src/router.ts`
- Modify: `src/flash.ts` — `isFlashRunning(opts?: FlashOptions, signal?: AbortSignal)`: combine `signal` with its own timeout; an abort or timeout returns `false`. Behaviour otherwise unchanged.
- Test: `test/router.test.ts`

**Interfaces:**
- Consumes: `Level`, `Classification`, `ClassifierInput`, `buildClassifierInput`, `isGoAhead`.
- Produces:
  - `export const ROUTER_BUDGET_MS = 500`
  - `export interface RouterState { level: Level; source: Decision["source"]; confidence?: number }`
  - `export interface Decision { level: Level; source: "classified" | "go-ahead" | "steering" | "fallback" | "sticky"; confidence?: number; probs?: Record<Level, number>; latencyMs: number; error?: string }`
  - `export interface DecideInput { reason: "user" | "continuation" | "retry" | "direct"; messages: readonly { role: string; content: unknown }[]; previousLevel?: Level; signal?: AbortSignal }`
  - `export interface DecideDeps { isRunning(signal: AbortSignal): Promise<boolean>; classify(input: ClassifierInput, signal: AbortSignal): Promise<Classification>; budgetMs?: number }`
  - `export async function decide(input: DecideInput, deps: DecideDeps): Promise<Decision>` — implements the spec's routing table in order:
    - `continuation` / `retry` → `sticky` with previous level (else `medium`), no calls.
    - `direct` → `fallback` with previous level else `medium`, no calls.
    - `user`: find the last user message; its text = joined `text` blocks (or the string content).
      - Steering (the message right before it is `role: "toolResult"`, or an assistant whose content has a `toolCall` block) and a previous level exists → `steering`.
      - Go-ahead and a previous level exists → `go-ahead`.
      - Empty text → `fallback`.
      - Otherwise, one deadline `AbortSignal.any([AbortSignal.timeout(budgetMs), input.signal])`: if `!(await deps.isRunning(deadline))` → `fallback` with `error: "not running"`. Else `classify(buildClassifierInput(text, previousAssistantText), deadline)`; ok → `classified` with level/confidence/probs; not ok → `fallback` with `error`.
    - The previous assistant text is the joined text blocks of the nearest assistant message before the last user message.
  - `export function textOf(content: unknown): string` (exported for the extension).

- [ ] **Step 1: Write failing tests** (fake deps; count calls to each):
  - `continuation keeps previous level, no calls`; `retry with no previous → medium`; `direct → fallback previous`.
  - `user classified`: isRunning true, classify ok xhigh 0.8 → `{level: "xhigh", source: "classified", confidence: 0.8}`, classify got `{prompt: <text>, previous: <assistant text>}`.
  - `go-ahead keeps previous`: messages `[assistant "Plan: …", user "do it"]`, previousLevel `xhigh` → `go-ahead`/xhigh, classify not called.
  - `go-ahead without previous level is classified`.
  - `steering keeps previous`: messages `[user, assistant with toolCall block, toolResult, user "also check the tests"]`, previousLevel `medium` → `steering`/medium, no calls.
  - `not running → fallback, classify never called`; `classify error → fallback previous`; `no previous and failure → medium`.
  - `shared deadline`: isRunning takes 400 ms then true, classify takes 300 ms (honours abort) → total < 600 ms and `fallback` (the deadline expired during classify).
  - `slow running check counts as not running`: isRunning never resolves until aborted → returns `fallback` within 600 ms.
  - `user abort` (Review Focus 2): `input.signal` aborted 50 ms in, while classify waits → resolves within 200 ms, `fallback`.
  - `image-only message` (Review Focus 3): user content `[{type:"image",…}]` → `fallback`, no calls.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/router.ts` and the `isFlashRunning` signal parameter (add a test in `test/flash.test.ts`: `isFlashRunning with an aborted signal → false`, written and run red first).
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: flash-auto decision function`.

### Task 3: pi extension

**Files:**
- Create: `src/extension.ts`, `src/log.ts`
- Test: `test/extension.test.ts`

**Interfaces:**
- Consumes: `AUTO_MODELS`, `decide`, `Decision`, `RouterState`, `createFlashClassifier`, `isFlashRunning`, pi types.
- Produces:
  - `src/log.ts`: `export function appendDecision(file: string, entry: object): void` — `mkdirSync(dirname, {recursive: true})` + `appendFileSync`, all errors swallowed.
  - `src/extension.ts`: `export function createRoute(auto: AutoModel, deps: { decideDeps: DecideDeps; log: (entry: object) => void; sessionFile?: () => string | undefined })` returning `(request: ModelRouteRequest<RouterState>, ctx: { modelRegistry: { find(provider: string, id: string): Model | undefined } }) => Promise<ModelRoute<RouterState>>`; and `export default function (pi: ExtensionAPI)`, which registers one virtual model per `AUTO_MODELS` entry: `provider: auto.provider`, `id: auto.virtualId`, `name: auto.name`, `thinkingLevels: ["medium"]` (one fixed selection; the footer shows the routed level), `contextWindow: 500000`, `input: ["text", "image"]`, wired to the real classifier/running check (`baseUrl`, `swapModel`) and `appendDecision("~/.pi/agent/flash-auto.jsonl" expanded, …)`.
  - Route behaviour: `previousLevel = request.state?.level ?? request.previous?.thinkingLevel` (only if it's one of the four levels; `high`→`xhigh`, `minimal`→`low`). Call `decide`. Return `{ model: <physical from registry>, thinkingLevel: decision.level, state }`, where `state` is a new object `{level, source, confidence}` only when it differs from `request.state` (otherwise return `request.state`). For `reason === "user"`, log `{ts, session, virtual: auto.virtualId, level, source, confidence, probs, latencyMs, error}`.

- [ ] **Step 1: Write failing tests** (fake registry, fake decideDeps, captured log):
  - `routes to the physical model at the decided level`.
  - `continuation after a different model` (Review Focus 1): `request.previous = {model: <27b model>, thinkingLevel: "high"}`, reason continuation → returned model is flash, level `xhigh`.
  - `state only changes when the decision changes`: same level/source twice → second call returns `request.state` by identity.
  - `logs user decisions only`: one log entry after a `user` request, none after `continuation`; the entry has no prompt text.
  - `log failure doesn't break routing` (Review Focus 4): `appendDecision` to `/proc/nonexistent/x.jsonl` doesn't throw; route still resolves.
  - `missing physical model` (Review Focus 5): registry returns undefined → rejects with a message containing `spark/qwen3.8-flash-next`.
  - `registers one virtual model per AUTO_MODELS entry`: a fake `pi` captures `registerVirtualModel` calls → one call, `id: "flash-auto"`, `provider: "spark"`, `thinkingLevels: ["medium"]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat: flash-auto pi extension`.

### Task 4: models.json — true-zero off and context window

**Files:**
- Modify: `~/.pi/agent/models.json` (outside the repo; back up to `~/.pi/agent/models.json.bak-2026-10-26` first)
- Create: `docs/models-json-change.md` (the exact before/after of the flash entry, for the record)

- [ ] **Step 1: Back up** `models.json`; confirm the backup is byte-identical (`cmp`).
- [ ] **Step 2: Edit** the `qwen3.8-flash-next` entry: `compat: { supportsDeveloperRole: false, thinkingFormat: "chat-template", chatTemplateKwargs: { enable_thinking: { $var: "thinking.enabled" }, reasoning_effort: { $var: "effort", omitWhenOff: true } } }`, `thinkingLevelMap: { minimal: "low", low: "low", medium: "medium", high: "xhigh", xhigh: "xhigh", max: "xhigh" }` (no `off` key), `contextWindow: 500000`. Note that `compat` is currently on the provider; put the model-level `compat` on the flash entry only, and keep the provider's for the other two models. Validate it with `python3 -m json.tool`.
- [ ] **Step 3: Verify through pi** (not raw HTTP): for each of off, low, medium, xhigh, run pi non-interactively on `spark/qwen3.8-flash-next` with that thinking level and the train-catch-up prompt from the spec's pre-check (find the print-mode flags in `docs/cli.md`). Read `usage.reasoning` from the new session file's assistant message. Expected: off = 0; low < medium ≤ xhigh; no errors. If off isn't 0 or the levels are equal, **stop and report** (spec: don't send both the kwarg and the top-level field).
- [ ] **Step 4: Write** `docs/models-json-change.md` with the before/after and the measured reasoning tokens. **Commit** `docs: models.json change for true-zero off`.

### Task 5: Install and live check

**Files:**
- Modify: `~/.pi/agent/settings.json` (back up to `settings.json.bak-2026-10-26`): add `"../../workspace/flash-auto"` to `packages`.
- Modify: `README.md` (how flash-auto works, where the log is, how to disable it).

- [ ] **Step 1: Back up and edit** `settings.json`; validate the JSON.
- [ ] **Step 2: Load check:** start pi non-interactively with `--model spark/flash-auto` and the prompt `hi`. Expected: the reply arrives; the session's assistant message names `qwen3.8-flash-next` with `thinkingLevel: "off"` and reasoning 0; one log line with `source: "classified"`, `level: "off"`.
- [ ] **Step 3: Hard prompt:** same, with "Find the race condition in a job queue where jobs occasionally run twice under load; explain the fix" (no repo needed). Expected: level `xhigh` or `medium` (log `source: "classified"`), and reasoning tokens > 0.
- [ ] **Step 4: Sticky check:** in one session, a prompt that makes flash call a tool (e.g. "list the files in this directory, then tell me which is largest"). Expected: every assistant message in that turn has the same `thinkingLevel`; one log line for the turn.
- [ ] **Step 5: Go-ahead check:** continue that session with `do it` after an assistant proposal. Expected: log `source: "go-ahead"` with the previous level, no classify latency (`latencyMs` ≈ 0).
- [ ] **Step 6: Commit** README. **CHECKPOINT — hand to Michael** with the log lines and the measured levels. Steps 2–5 send a few real requests to flash; they don't need the other models idle.
