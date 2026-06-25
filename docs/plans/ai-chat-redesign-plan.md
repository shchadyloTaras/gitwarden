# GitWarden — AI Chat Redesign Plan

> Collapse GitWarden's **seven scattered AI panels** into **one persistent, context-aware chat** docked in a tabbed right panel (Cursor-style), and make provider/API-token setup feel like **Claude** — paste a key, switch models, go. The AI's capabilities and safety posture do not change: this is a **UX consolidation**, not a new AI mandate.
>
> The chat stays **advisory-only and subordinate to the deterministic Safety Engine** (see `docs/plans/ai-integration-plan.md` §2). It owns no Git action, never bypasses a blocker, and every networked send still passes the existing **redaction + send-preview privacy gate** (AI plan §4). Default-off and the fixed precedence (per-repo override → global enable → `connection.enabled`) are unchanged.

## 0. How to Read This Plan

This continues the AI Connections plan (`docs/plans/ai-integration-plan.md`, Phases 28–39). Same conventions: each phase has a **Goal**, **Tasks**, and explicit **Exit criteria**; build **logic-first** (pure core + injected services with green Vitest before UI); a phase is done only when its exit criteria are green and `docs/progress-log.md` is updated; **commit per phase, never push automatically**.

Phase order (continues the global counter; the Landing-Page track ends at Phase 51):

- **Phase 52 — Chat Backend: General-Chat Assistant & `ai:chat` IPC** (main, fake-adapter tested)
- **Phase 53 — Chat State & Slash-Command Router** (renderer store + pure routing logic, unit-tested)
- **Phase 54 — Tabbed Right Panel, Chat UI & Inline Registration** (the visible redesign)
- **Phase 55 — Panel Retirement & Cleanup** (remove the six replaced panels, keep the inline commit helper)

**Recommended cut:** ship all four (52–55). Phases 52–54 are additive and safe to land while the old panels still exist; Phase 55 removes the redundant UI only once the chat demonstrably covers it.

**Verifiability principle:** the new general-chat path goes through the **existing injected adapter registry** (`src/main/ai/`), so it is unit-tested under Vitest with fake adapters. Playwright continues to use the injected fake AI connection (`GITWARDEN_E2E_FAKE_AI=1`). No real AI network call runs in CI.

---

## 1. Product Direction: One Chat, Many Capabilities

Today AI is spread across seven panels (`AgenticProposalPanel`, `FailureExplainPanel`, `HistorySummaryPanel`, `PushBriefPanel`, `RepoOnboardingPanel`, `SafetyIssueExplain`) plus inline cards in `CommitScreen`. Each re-implements the same _deterministic → preview → AI enhance_ flow in its own corner of its own screen. The result is hard to discover and visually noisy.

The redesign replaces that with **one chat** that knows the active repo, branch, and screen, and exposes every existing capability either as a typed message or a slash-command.

### Primary flow (the 80% path)

```text
Right panel → AI Chat tab
  (no connection yet?) → inline "paste your API key" setup  ← Claude-style, reuses Phase 29 logic
  Type a question, or use a slash-command:
    /commit       → draft commit message        (draftCommitMessage)
    /review       → review staged changes        (reviewStagedChanges)
    /push-brief   → pre-push brief               (generatePushBrief)
    /history      → release notes / changelog    (generateHistorySummary)
    /repo-brief   → onboarding brief             (generateRepoBrief)
    /explain      → safety issue / git failure   (explainSafetyIssue / explainGitFailure)
    /propose      → allowlisted file edits        (proposeAgenticActions → execute on confirm)
  → for any networked send: the SAME redaction + send-preview gate appears inline → confirm → send
```

### Two surfaces for setup (per the agreed scope)

1. **Inline, in the chat panel** — when there is no active connection or AI is disabled, the chat shows a compact paste-key setup (reuses the Phase 29 `SetupForm` logic: `detectProvider` → `createConnection` → `saveCredential` → `listModels`) and a one-click enable. A small **provider/model switcher** lives in the chat panel header (reuses `setActiveConnection` + `listModels`).
2. **Full management, in Settings** — `AiConnectionSettings` stays as the advanced surface (duplicate/export/delete/templates/per-repo override). Nothing is removed from Settings.

### Hybrid, not pure free-text

Slash-commands map to the **structured** assistants so their typed outputs (commit drafts, briefs, findings) and the privacy preview survive. Free-text questions route to a new lightweight **general-chat** capability (Phase 52). This is the only backend addition; everything else is renderer work over the existing `window.api.ai.*` surface.

---

## 2. Redesign Rules (non-negotiable)

These extend `AGENTS.md` and the AI plan's rules; they do not replace them.

- **No new AI authority.** The chat is advisory-only. It never commits, pushes, changes identity/config, or clears a deterministic Safety finding. The agreed agentic boundary (AI plan §7) is unchanged: `/propose` still requires preview → diff review → explicit confirm and is allowlist-only.
- **The privacy gate is preserved, not bypassed.** Every networked send from the chat shows the post-redaction payload **and the destination host** before sending (`previewContext`), respecting `preview-each` / `preview-first-run` exactly as the panels do today.
- **Reuse, don't re-implement.** Slash-commands call the existing `aiStore` methods; the chat adds orchestration, not duplicate IPC. The only new IPC is `ai:chat` for free-text.
- **`src/core/` stays pure.** New chat types/schemas (message shape, chat request/response) go in `src/core/ai/` with Zod validation; no `fs`/`child_process`/Electron/DOM.
- **The general-chat path obeys the same gates.** It runs through `AiContextBuilder` (enablement precedence, redaction, preview) and the injected adapter registry — no direct provider calls, no `GitRunner`.
- **Default-off + fixed precedence unchanged.** per-repo override → global enable → `connection.enabled`.
- **All new user-facing strings externalized** in `src/renderer/strings.ts`.
- **No secret ever reaches the renderer.** Inline setup reuses `saveCredential`, which returns only masked `AiCredentialMetadata` — identical to the Settings path.

---

## 3. Architecture & Key Files

### Backend (Phase 52)

- `src/core/ai/chat.ts` + schema in `src/core/ai/schemas.ts` — pure `AiChatRequest` / `AiChatResponse` / `AiChatMessage` types and Zod validation. Add `'chat'` to the `AiRequestKind` union (`src/core/ai/types.ts`) so context building, estimation, and preview treat it like any other request kind.
- `src/main/ai/AiChatAssistant.ts` — small assistant mirroring the existing per-feature assistants: builds context via `AiContextBuilder`, sends through the adapter registry, returns a Zod-parsed structured response (assistant text + optional suggested follow-up actions referencing existing capabilities). No new provider code.
- IPC: `ai:chat` registered in `src/main/ipc/ipc-handlers.ts`, validated in `src/main/ipc/ipc-schemas.ts`, exposed via `preload/index.ts` and typed in `src/renderer/types/window.d.ts` as `window.api.ai.chat(...)`.
- Test fake: extend `src/main/testing/aiFakes.ts` so the fake adapter answers chat requests deterministically.

### Renderer state (Phase 53)

- `src/renderer/store/appStore.ts` — add `rightPanelTab: 'context' | 'chat'` (default `'context'`) and `setRightPanelTab`. Keep `inspectorOpen`/`toggleInspector` working; the header toggle opens the panel, and opening to the chat sets the tab to `'chat'`.
- `src/renderer/store/aiChatStore.ts` (new) — `messages: AiChatMessage[]`, `pending`, `error`; actions `sendMessage(text)`, `runCommand(cmd, args?)`, `clear()`. It is a thin orchestrator: a **pure** command parser/router (`src/core/ai/chatCommands.ts`, unit-tested) maps slash-input → capability; the store calls the matching `aiStore` method (or `ai:chat` for free-text) using active repo/branch from `appStore`, and appends results as messages with their preview metadata.
- `src/core/ai/chatCommands.ts` (new, pure) — parse `/cmd args` → `{ kind, args }`, list available commands, validate against the active screen/context. Pure and unit-tested; no DOM.

### Renderer UI (Phase 54)

- `src/renderer/components/RightPanel.tsx` (new) — replaces the bare `<Inspector />` in `src/renderer/App.tsx`. Renders a two-tab strip (**Context** | **AI Chat**) bound to `appStore.rightPanelTab`, and mounts `<Inspector />` or `<AiChatPanel />`. Honors `inspectorOpen` for show/hide.
- `src/renderer/components/AiChatPanel.tsx` (new) — message list (user/assistant bubbles, monospace for diffs/briefs), input with send, slash-command hint row + quick-action buttons, inline send-preview confirm, inline "paste API key" setup when `!aiEnabled || no active connection`, and a header provider/model switcher.
- `src/renderer/components/GlobalHeader.tsx` — keep the Inspector toggle; add a chat affordance that opens the panel on the **AI Chat** tab; optional shortcut (e.g. Cmd/Ctrl+L) to focus chat.
- `src/renderer/strings.ts` — chat labels, command hints, inline-setup copy.

### Cleanup (Phase 55)

- Remove from their screens and **delete** the now-unused components: `FailureExplainPanel` (Status), `PushBriefPanel` (Remote), `HistorySummaryPanel` (History), `RepoOnboardingPanel` (Repositories), `SafetyIssueExplain` (Safety Center + Remote push issues), `AgenticProposalPanel` (Commit).
- **Keep** the inline AI commit-message helper card in `src/renderer/screens/CommitScreen.tsx`.
- Remove dead strings, dead `aiStore`/`window.api` references only used by deleted panels (keep the underlying IPC — the chat uses it), and update/remove the affected e2e specs.

---

## 4. Phases

### Phase 52 — Chat Backend: General-Chat Assistant & `ai:chat` IPC

**Goal:** a lightweight, advisory free-text chat capability that reuses the existing context + adapter pipeline.

**Tasks:**

- Add pure `AiChatMessage` / `AiChatRequest` / `AiChatResponse` types + Zod schemas in `src/core/ai/`; add `'chat'` to `AiRequestKind`.
- Implement `AiChatAssistant` in `src/main/ai/` that builds context via `AiContextBuilder`, sends through the adapter registry, and returns a Zod-parsed structured response.
- Register `ai:chat` IPC with Zod payload/result validation; expose `window.api.ai.chat` in preload + `window.d.ts`.
- Extend `aiFakes.ts` so chat requests get deterministic fake responses for tests.

**Exit criteria:**

- Vitest: chat request/response schemas validate and reject malformed shapes; assistant returns Zod-parsed output with a fake adapter.
- Enablement precedence and preview/redaction apply to `'chat'` exactly as to other kinds (a disabled repo or disabled AI blocks the chat send).
- IPC rejects malformed `ai:chat` payloads.
- `src/core/` stays pure; `tsc --noEmit` clean on both tsconfigs.

### Phase 53 — Chat State & Slash-Command Router

**Goal:** the renderer can turn a typed line into the right capability call, with no UI yet.

**Tasks:**

- Add pure `chatCommands.ts` (parse `/cmd args`, enumerate commands, map to `AiRequestKind` / capability).
- Add `aiChatStore.ts` orchestrating messages, `sendMessage`, `runCommand`, `clear`, wired to existing `aiStore` methods + `ai:chat`, pulling active repo/branch from `appStore`.
- Extend `appStore.ts` with `rightPanelTab` + `setRightPanelTab` (Inspector toggle still works).

**Exit criteria:**

- Vitest: command parser maps each slash-command to the correct capability and rejects unknown/!applicable commands; free-text routes to `ai:chat`.
- Vitest: store appends user + assistant messages, surfaces errors, and carries preview metadata; secrets never enter store state.
- `appStore` tab state toggles without breaking existing `inspectorOpen` behavior.

### Phase 54 — Tabbed Right Panel, Chat UI & Inline Registration

**Goal:** the visible redesign — one Cursor-style chat with Claude-style inline setup.

**Tasks:**

- Add `RightPanel.tsx` (tabbed Context | AI Chat) and mount it in `App.tsx` in place of `<Inspector />`.
- Add `AiChatPanel.tsx`: message list, input, slash-command hints + quick actions, inline send-preview confirm, inline paste-key setup (reusing Phase 29 logic), header provider/model switcher.
- Wire `GlobalHeader` chat affordance + optional shortcut.
- Externalize all new strings.

**Exit criteria:**

- Playwright (fake AI): open right panel → switch to AI Chat tab → with no connection, inline setup creates a connection and enables AI → run `/commit` → preview appears → confirm → draft renders as a message.
- Switching tabs preserves Inspector context content.
- Provider/model switcher changes the active connection (fake adapter) without leaking secrets.
- The chat respects default-off: with AI disabled, it shows setup/enable, not a send.

### Phase 55 — Panel Retirement & Cleanup

**Goal:** remove the redundant panels now that the chat covers them; keep the inline commit helper.

**Tasks:**

- Remove and delete `FailureExplainPanel`, `PushBriefPanel`, `HistorySummaryPanel`, `RepoOnboardingPanel`, `SafetyIssueExplain`, `AgenticProposalPanel`; strip their imports from `StatusScreen`, `RemoteScreen`, `HistoryScreen`, `RepositoriesScreen`, `SafetyCenterScreen`, `CommitScreen`.
- Keep the inline AI commit-message helper in `CommitScreen`.
- Remove now-dead strings and panel-only store/window references (keep shared IPC the chat uses).
- Update/remove e2e specs tied to deleted panels; add/confirm chat coverage for the equivalent flows.

**Exit criteria:**

- App compiles with no TS/ESLint errors in touched files; no dangling imports/strings.
- Deleted panels no longer render on any screen; the inline commit helper still works.
- Full `npm test` and `npm run e2e` green (specs updated for the new chat surface).
- Every capability formerly reachable via a deleted panel is reachable via the chat.

---

## 5. Testing & Verifiability

- **Logic-first:** chat schemas, command router, and store ship with Vitest before the panel UI.
- **Fake adapters in CI:** `GITWARDEN_E2E_FAKE_AI=1` drives all Playwright chat flows; no real AI network call in CI.
- **Privacy assertions:** the send-preview (payload + destination host) appears before any chat/slash-command send; redaction runs before send; precedence (repo → global → connection) holds for `'chat'`.
- **Credential assertions:** inline setup stores secrets only via `saveCredential`; raw secrets never appear in IPC responses, chat store state, messages, or logs.
- **Regression:** deleting the six panels removes no capability — each is proven reachable through the chat.

## References

- Internal: `docs/plans/ai-integration-plan.md` (privacy model §4, advisory rationale §2, agentic boundary §7), `docs/plans/gitwarden-plan.md`, `DECISIONS.md`, `SECURITY.md`, `docs/progress-log.md`
- Existing surfaces reused: `window.api.ai.*` (preload), `src/main/ai/` assistants + `AiContextBuilder`, `src/renderer/store/aiStore.ts`, `src/renderer/components/AiConnectionSettings.tsx`
