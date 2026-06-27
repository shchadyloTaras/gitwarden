---
status: accepted
amends: 0007
date: 2026-06-25
phase: Phases 52–55a
source: docs/plans/ai-chat-redesign-plan.md + post-plan log entries in docs/progress-log.md
---

# 0008 — AI Chat Redesign & simplification

## Status

Accepted (Phases 52–55a + post-plan hardening). **Amends [0007 — AI Connections: advisory layer](0007-ai-connections-advisory-layer.md).**

These refine — and in two cases relax — the ADR 0007 decisions; they never weaken the advisory-only
or deterministic-safety invariants.

## Context

The original AI feature exposed six per-capability panels and a multi-step enable/consent flow. In
practice this was heavier than the common "paste a key and chat" use case warranted, while the
deterministic Safety Engine had to remain entirely independent of the AI layer.

## Decision

- **One chat surface replaces the per-capability panels.** The six AI panels (push-brief, history,
  repo-onboarding, failure-explain, safety-explain, agentic-proposal) were retired (Phase 55) in
  favour of a single chat panel driven by slash-commands (`/commit`, `/review`, `/push-brief`,
  `/history`, `/repo-brief`, `/propose`, `/explain`, `/help`). The underlying capability IPC/store
  methods are retained — the chat now invokes them. Deterministic safety reporting (`SafetyIssueRow`)
  was kept AI-free.
- **Paste-key-and-go: a stored key is the consent (Phase 55a).** Settings → AI was reduced to token →
  live model list → pick → Save; saving a credential auto-enables AI. The separate "Enable AI" toggle,
  per-repo override UI, Advanced disclosure, and built-in templates / export were removed from the UI.
  The backend precedence (`isAiSendAllowed`) and `RepositoryRecord.aiOverride` field remain as no-ops
  for forward compatibility.
  - ⚠️ _Trade-off (user-accepted):_ this **supersedes the ADR 0007 "Save and Enable are two deliberate
    steps" decision** for the shipped UI — a saved key is now both. The privacy consent is the explicit
    send, not a separate enable step.
- **The inline send-preview gate was removed; the privacy floor is redaction + explicit
  acknowledgement (Phase 55a).** The chat no longer shows a per-send `preview-each` payload→confirm
  dialog. Slash-commands and free-text send immediately; networked chat commands pass
  `expensiveSendAcknowledged: true` on explicit click/Enter, and redaction (ADR 0007 "one redaction
  ruleset", SECURITY.md §18) still runs server-side before every send.
  - ⚠️ _Trade-off (user-accepted):_ source can leave the machine without a visual post-redaction
    preview. Redaction remains best-effort, not a guarantee. The `AiPrivacyMode` model field is
    retained should a preview surface be reintroduced.
- **Streaming chat is plain-prose only.** `AiChatAssistant.chatStream` streams free-text replies over
  the `ai:chatStreamEvent` channel; structured (schema-bound) capabilities keep the non-streaming
  request path. Streaming is response-direction and does not bypass request-side redaction.
- **`/explain` accepts pasted tool output — treated as ordinary context.** `/explain` classifies its
  argument as a known `SafetyCode` token (explained from deterministic copy) or as **pasted tool/build
  output**, which is routed through the same redaction ruleset as any diff context before send.
  `@mention` / path-filtering selects which repo paths join the context.
- **Structured output uses one schema source with a compatibility fallback chain.** All structured
  assistants derive their JSON schema from `providerJsonSchemaForKind`
  (`src/core/ai/providerSchemas.ts`); the OpenAI-compatible adapter degrades gracefully on HTTP 400 —
  strict `json_schema` → non-strict → `json_object` → plain completion.

## Consequences

- One conversational entry point is easier to reason about than six panels, while the deterministic
  Safety Engine stays entirely independent of the AI layer.
- Near-zero setup for the common case; the conscious act is now "store a key + send", which the user
  does explicitly.
- The redesign optimizes for "paste key and chat"; the user accepted reducing the visible-payload gate
  to the redaction + acknowledgement floor.
- Live tokens improve chat UX, but structured outputs must be parsed/validated whole and the redaction
  gate is on the outbound request, so streaming changes neither.
- Pasted output is a new free-text input path; reusing the single redaction ruleset keeps "what we
  strip before sending" identical everywhere, with no parallel table to drift.
- One schema source prevents per-assistant drift; the fallback lets models without strict
  structured-output (e.g. Gemma) still return parseable JSON instead of hard-failing.
