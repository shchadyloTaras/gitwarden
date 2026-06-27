# GitWarden — Generative UI Blocks Plan

> Extend the AI chat from text-only bubbles to **controlled Generative UI**: capability results
> (and, later, free-text answers) are carried to the renderer as typed, **Zod-validated blocks**
> rendered as native cards — instead of being flattened into strings. The union is a **closed
> allowlist**: the model only fills the typed fields of a _known_ block; it never emits arbitrary
> HTML/JSX or chooses a component freely.
>
> This is a **UX/rendering** layer. It introduces **no new AI authority**: no new IPC, no new send
> path, no Git action. The chat stays advisory-only and subordinate to the deterministic Safety
> Engine (AI plan §2). Every card renders data already fetched through the existing redaction +
> adapter pipeline, and any action on a card routes through an **existing** gate.

## 0. How to Read This Plan

Continues the AI Chat Redesign (`docs/plans/ai-chat-redesign-plan.md`, Phases 52–55). Same
conventions: each phase has a **Goal**, **Tasks**, and explicit **Exit criteria**; build
**logic-first** (pure core + injected services with green Vitest before UI); a phase is done only
when its exit criteria are green and `docs/progress-log.md` is updated; **commit per phase, never
push automatically**.

**Phase numbering.** The global counter is shared across features. Phases 56–59 are reserved by the
Client Branch Access feature, so this feature starts at **Phase 60**:

> The ✅/_(shipped)_ markers below are a derived convenience view; the authoritative completion state
> is the Phase Checklist in `docs/progress-log.md`. If they disagree, the checklist wins.

- **Phase 60 — GenUI Block Contracts, Store & Review Findings card** ✅ _(shipped)_
- **Phase 61 — Commit Draft card** ✅ _(shipped)_
- **Phase 62 — Free-text model-chosen blocks (Level 2)** ✅ _(shipped)_

**Verifiability principle:** the block union + validation live in pure `src/core/ai/` (Vitest under
plain Node); the renderer maps a validated block to a whitelisted native card. No real AI network
call runs in CI — Playwright continues to drive the chat with the injected fake adapter
(`GITWARDEN_E2E_FAKE_AI=1`).

---

## 1. Background & Product Direction

The chat redesign (Phases 52–55) consolidated seven AI panels into one chat. Those panels rendered
**rich cards**; consolidation flattened every capability result into a plain-text bubble
(`runCapability` in `src/renderer/store/aiChatStore.ts` stringifies the typed output). The
structured data we already generate — and Zod-validate — is discarded at the last step.

This feature restores that richness inside the unified chat, framed as the industry pattern
**controlled / declarative Generative UI**.

**What the market does (and how it maps to our stack):**

| Approach                             | What it is                                                                         | Fit for Electron + sandboxed renderer                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Vercel AI SDK `streamUI` (RSC)       | server streams React components via tool calls                                     | ❌ requires React Server Components + Server Actions; we have no RSC and a sandboxed renderer                            |
| CopilotKit / AG-UI                   | full agentic framework, JSON-protocol → UI (Controlled / Declarative / Open-ended) | ⚠️ owns the chat + transport; too large for an advisory layer                                                            |
| assistant-ui                         | React chat primitives with a GenUI primitive                                       | ⚠️ owns the chat; we already built ours                                                                                  |
| Thesys C1 / OpenUI                   | hosted endpoint that returns UI; OpenUI = component-registry standard              | ❌ C1 ships repo context to a third-party host (privacy); OpenUI is a useful _pattern_ reference                         |
| **Native `ChatUiBlock`** (this plan) | closed union + Zod in `core/` + a renderer registry                                | ✅ we already have ~80% (Zod core, adapter registry, structured outputs, `kind` discriminant, `/propose` card precedent) |

**Decision: borrow the controlled-GenUI pattern, build it natively.** The portable idea across all
frameworks is identical — _the model returns a typed block from a closed allowlist; the client maps
the block type to a whitelisted native component._ Implementing it natively is less code than
adopting any framework and keeps the chat subordinate to the Safety Engine.

References: [Vercel AI SDK 3.0 — Generative UI](https://vercel.com/blog/ai-sdk-3-generative-ui),
[AI SDK RSC `streamUI`](https://ai-sdk.dev/docs/ai-sdk-rsc/streaming-react-components),
[CopilotKit — Developer's Guide to GenUI 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026),
[Thesys OpenUI](https://github.com/thesysdev/openui).

---

## 2. Rules (non-negotiable)

Extend `AGENTS.md` and the AI plan's rules; they do not replace them.

- **Controlled, closed allowlist.** `ChatUiBlock` is a discriminated union of _known_ block kinds.
  The model never emits markup or picks a component — it only fills typed fields, validated
  fail-closed by Zod.
- **Render from validated data only.** A card is built from an already-parsed structured output, not
  from re-parsing free text.
- **No new AI authority.** No new IPC, no new send path, no Git action. Redaction / enablement /
  precedence are untouched.
- **Actions route through existing gates.** Insert a commit draft → fills the commit box (the user
  still commits via the Safety Engine); apply edits → the existing `/propose` preview→confirm flow;
  "go to Safety Center" → navigation. No card introduces a path that mutates git / identity / config.
- **Graceful fallback.** An unknown/future block kind falls back to the message's plain-text
  `content`. The flattened text is always kept on the message (a11y, copy, fallback).
- **`src/core/` stays pure.** Block types + schemas live in `src/core/ai/`; no `fs`/electron/DOM.
- **All new user-facing strings externalized** in `src/renderer/strings.ts`.

---

## 3. Architecture & Key Files

- `src/core/ai/chatBlocks.ts` (pure) — the `ChatUiBlock` discriminated union + `ChatUiBlockSchema`
  (Zod, **reusing** the existing per-feature schemas, e.g. `AiChangeReviewSchema`) + small
  `*Block()` constructors. Exported via the `src/core/ai/index.ts` barrel.
- `src/renderer/store/aiChatStore.ts` — `ChatMessage` carries an optional `block?: ChatUiBlock`
  alongside `content`. `runCapability` keeps the flattened `content` (fallback) and additionally
  attaches the typed block.
- `src/renderer/components/chatBlocks/` — one component per block kind + a registry
  `ChatBlockView({ block })` that switches on `block.kind` (unknown → `null`, text fallback wins).
- `src/renderer/components/AiChatPanel.tsx` — `MessageRow` renders `<ChatBlockView>` when a block is
  present, else the existing text body.

---

## 4. Phases

### Phase 60 — GenUI Block Contracts, Store & Review Findings card ✅ (shipped)

**Goal:** stop discarding the typed `/review` output — carry it to the renderer and render a native
findings card. Establish the block union + renderer registry so later cards drop in without a
refactor.

**Tasks (done):**

- `src/core/ai/chatBlocks.ts`: `ChatUiBlock` (seeded with `review-findings`), `ChatUiBlockSchema`
  reusing `AiChangeReviewSchema`, `reviewFindingsBlock()`; barrel export.
- `aiChatStore.ts`: `block?: ChatUiBlock` on `ChatMessage`; `case 'review'` attaches
  `reviewFindingsBlock(review)` while keeping `content`.
- `src/renderer/components/chatBlocks/ReviewFindingsCard.tsx` (severity chip by confidence, category,
  file chip, rationale; empty-state) + `index.tsx` (`ChatBlockView` registry).
- `AiChatPanel.tsx` `MessageRow` renders the block when present.
- New `REVIEW_*` strings; `tests/unit/chat-blocks.test.ts`; e2e assertion (`ai-chat-review-card`).

**Exit criteria:** ✅ Vitest validates/rejects the block union; `/review` renders a native card
(text `why` still present, so the existing assertion stays green); `src/core/` pure; web + node
`tsc --noEmit` clean; ESLint/Prettier clean.

### Phase 61 — Commit Draft card ✅ (shipped)

**Goal:** render `/commit` as a `CommitDraftCard` with a real action.

**Tasks:** add `{ kind: 'commit-draft'; draft: AiCommitDraft }` to the union; `case 'commit'`
attaches the block; `CommitDraftCard` shows conventional/plain (+ body) with an **Insert** button
that fills the Commit screen's message draft (reusing the existing commit-draft insert path — the
user still commits through the Safety Engine).

**Exit criteria:** Vitest covers the new variant; Playwright: `/commit` renders the card and Insert
populates the commit message; no new mutate path; core pure; typecheck/lint clean.

### Phase 62 — Free-text model-chosen blocks (Level 2) ✅ (shipped)

**Goal:** let a free-text answer optionally surface a model-chosen card from the closed allowlist —
not only slash-commands.

**Streaming decision (documented):** the **hybrid** path. Free-text keeps streaming token-by-token
exactly as before (no regression). After the stream finishes, a small **fail-closed structured
pass** (`AiChatAssistant.suggestBlock` via a dedicated `ai:chatSuggestBlock` IPC) MAY upgrade the
finished bubble with one allowlisted block. The streamed prose is never parsed for in-band signals.
The pass is **scoped to `commit-draft`** — the only block derivable from the conversation alone,
since the chat context carries no diffs (a model-"reviewed" findings block would be fabricated);
`review-findings` stays slash-command-only. Cost: one extra small structured call per free-text
message.

**Shipped:** `ChatBlockSuggestionSchema` + `parseChatBlockSuggestion` (fail-closed, commit-draft
only) in `chatBlocks.ts`; `suggestBlock` on the assistant; `ai:chatSuggestBlock` IPC + preload +
typings; the store runs the pass after a successful stream and sets `blockAugmentsText` so
`MessageRow` renders the prose **above** the card.

**Exit criteria:** ✅ Vitest proves the assistant pass (block / null / throw) and the parser's
fail-closed allowlist (commit-draft accepted; review-findings, null, garbage → no block); the
closed allowlist holds; advisory-only / no-new-authority invariants unchanged; both tsconfigs +
ESLint + Prettier clean.

---

## 5. Testing & Verifiability

- **Logic-first:** the block union + schema ship with Vitest before any card UI.
- **Fake adapters in CI:** `GITWARDEN_E2E_FAKE_AI=1` drives all Playwright chat flows; no real AI
  network call in CI.
- **No regression:** the flattened `content` stays on every message, so existing text assertions and
  copy/accessibility are preserved; unknown block kinds fall back to text.
- **Safety:** cards render only from already-validated data; no card adds an IPC, send, or
  git/identity/config mutation path.

## References

- Internal: `docs/plans/ai-chat-redesign-plan.md`, `docs/plans/ai-integration-plan.md` (privacy §4,
  advisory rationale §2, agentic boundary §7), `DECISIONS.md`, `SECURITY.md`, `docs/progress-log.md`
- Prompts: `docs/prompts/genui-blocks-prompts.md`
- Reused surfaces: `src/core/ai/schemas.ts` (per-feature schemas), `src/renderer/store/aiChatStore.ts`,
  `src/renderer/components/AiChatPanel.tsx`
