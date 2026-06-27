# GitWarden — Generative UI Blocks Phase Prompts

Copy-paste prompts to drive the Generative UI Blocks feature one phase at a time. Each prompt is
self-contained, points at the plan, and **ends with the standard progress footer** that records
progress in `docs/progress-log.md`.

**How to use:** run prompts in order (60 → 62). Don't start a phase until the previous phase's entry
in `docs/progress-log.md` shows Exit criteria ✅. **Phase 60** is the foundation + first card
(shipped); **Phase 61** adds the commit-draft card; **Phase 62** is the optional Level-2 step
(free-text model-chosen blocks). References: feature plan in `docs/plans/genui-blocks-plan.md`, AI
plan in `docs/plans/ai-integration-plan.md`, chat redesign in `docs/plans/ai-chat-redesign-plan.md`,
rules in `CLAUDE.md` / `AGENTS.md`.

**No external prerequisite.** Advisory-only and offline-testable: no new IPC, no network call —
Playwright uses the injected fake AI adapter (`GITWARDEN_E2E_FAKE_AI=1`).

---

## 🔁 Standard progress footer (included in every prompt)

Every prompt below ends with this block. It is the mechanism that records progress:

```
When the phase's Exit criteria are met:
1. Append an entry to the "## Progress Log" section of docs/progress-log.md (newest last, do not rewrite past entries):
   ### <today's date> — Phase N: <name>
   - Built: <what was implemented>
   - Files: <files added/changed>
   - Tests: <exact vitest/playwright result, e.g. "12 passed">
   - Exit criteria: ✅ met  (or ⚠️ partial — explain what's left)
   - Notes / follow-ups: <anything worth knowing for next phase>
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md.
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 60 — GenUI Block Contracts, Store & Review Findings card

```
Work on Phase 60 of GitWarden (see docs/plans/genui-blocks-plan.md §2, §3, §4 Phase 60). Controlled Generative UI: carry the typed /review output to the renderer as a validated block and render a native card. No new IPC, no new send path, no Git action.

Tasks:
- Add src/core/ai/chatBlocks.ts (PURE — no node/electron/DOM): a closed discriminated union ChatUiBlock seeded with { kind: 'review-findings'; review: AiChangeReview }; ChatUiBlockSchema via z.discriminatedUnion REUSING AiChangeReviewSchema from schemas.ts (do not re-validate findings by hand); a reviewFindingsBlock(review) constructor. Export it from the src/core/ai/index.ts barrel.
- In src/renderer/store/aiChatStore.ts: add block?: ChatUiBlock to ChatMessage; in runCapability case 'review', keep the existing flattened content (fallback) AND attach block: reviewFindingsBlock(review).
- Add src/renderer/components/chatBlocks/ReviewFindingsCard.tsx: render optional overall, then one row per finding — a confidence chip (high→--gw-danger, medium→--gw-warning, low→--gw-success, theme var() tokens only), humanized category, optional file as a monospace chip, and the why text; empty findings → STR.REVIEW_NO_FINDINGS. data-testid: ai-chat-review-card (container), ai-chat-finding (row).
- Add src/renderer/components/chatBlocks/index.tsx: ChatBlockView({ block }) switching on block.kind (unknown → null; text fallback wins in MessageRow).
- In AiChatPanel.tsx MessageRow: when message.block is set, render <ChatBlockView block={message.block} /> in place of the text body; otherwise render content as before.
- Externalize new strings in src/renderer/strings.ts (REVIEW_NO_FINDINGS, REVIEW_CONFIDENCE_HIGH/MEDIUM/LOW).

Exit criteria: Vitest (tests/unit/chat-blocks.test.ts) accepts a valid review-findings block and rejects an unknown kind / malformed finding; /review renders the card with the fake adapter (extend tests/e2e/ai-chat-panel.spec.ts to assert ai-chat-review-card is visible; the existing why-text assertion still passes); src/core/ stays pure; `npx tsc --noEmit` clean on tsconfig.web.json AND tsconfig.node.json; ESLint + Prettier clean on touched files.

Then run the standard progress footer.
```

---

## Phase 61 — Commit Draft card

```
Work on Phase 61 (docs/plans/genui-blocks-plan.md §4 Phase 61). Add a second GenUI card with a real, gated action. Builds on the Phase 60 union + registry.

Tasks:
- Extend ChatUiBlock with { kind: 'commit-draft'; draft: AiCommitDraft } and ChatUiBlockSchema with the matching variant (reuse AiCommitDraftSchema). Add a commitDraftBlock(draft) constructor.
- In aiChatStore.ts runCapability case 'commit': keep the flattened content AND attach commitDraftBlock(draft).
- Add src/renderer/components/chatBlocks/CommitDraftCard.tsx: show conventional / plain (and body if present) with an Insert button that fills the Commit screen's message draft via the EXISTING insert path (the user still commits through the Safety Engine — no new mutate path). Register it in ChatBlockView.
- Externalize any new strings.

Exit criteria: Vitest covers the commit-draft variant (accept valid / reject malformed); Playwright: /commit renders the card and Insert populates the commit message box; no new IPC / send / git mutation path; src/core/ pure; `npx tsc --noEmit` clean on both tsconfigs; ESLint + Prettier clean.

Then run the standard progress footer.
```

---

## Phase 62 — Free-text model-chosen blocks (Level 2)

```
Work on Phase 62 (docs/plans/genui-blocks-plan.md §4 Phase 62). Let a FREE-TEXT chat answer return a model-chosen block from the closed allowlist (true controlled-GenUI intent), not just slash-commands. Advisory-only; the union stays closed and fail-closed.

Tasks:
- Decide and document the streaming trade-off: structured blocks cannot stream token-by-token like the current plain-text path. Pick one — (a) a post-stream structured pass that may upgrade the finished bubble to a block, or (b) non-streamed responses when a block is returned — and record it in the plan + progress log.
- Teach the chat assistant (src/main/ai/AiChatAssistant.ts) to OPTIONALLY emit a block intent drawn ONLY from the existing ChatUiBlock allowlist, validated fail-closed with the Zod union; on any mismatch, fall back to the plain-text reply (never throw, never render an unknown block).
- Wire the renderer so a block returned by free-text chat renders via the existing ChatBlockView; the flattened text remains the fallback.

Exit criteria: Vitest exercises the assistant block-intent path with the fake adapter (valid block → rendered; malformed → text fallback); the closed allowlist + fail-closed behavior is proven; streaming decision documented; redaction / advisory-only / no-new-authority invariants unchanged; `npx tsc --noEmit` clean on both tsconfigs; ESLint + Prettier clean.

Then run the standard progress footer.
```
