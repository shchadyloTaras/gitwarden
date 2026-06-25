# GitWarden — AI Connections Phase Prompts

Copy-paste prompts to drive the AI Connections feature one phase at a time. Each prompt is self-contained, points at the plan, and **ends with the standard progress block** that appends an entry to `docs/progress-log.md`.

**How to use:** run prompts in order (28 → 39). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. The **recommended MVP cut is Phases 28–34** (Connections + credential safety + custom providers + redaction/preview + commit drafting + change review + safety explanations) — you may ship there. Phases 35–38 are value-ordered add-ons; **Phase 39 (agentic) is deferred** and must not be designed until the advisory MVP is stable. References: feature plan in `docs/plans/ai-integration-plan.md`, OAuth plan in `docs/plans/github-oauth-plan.md`, base plan in `docs/plans/gitwarden-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

**No human prerequisite for tests.** Every AI phase is verified with **fake adapters / fake stores** — Playwright AI flows run under `GITWARDEN_E2E_FAKE_AI=1` and **no real AI network call runs in CI**. No API key is needed for any phase's tests. The only manual step is the optional real-connection smoke check (plan Appendix A), done by a maintainer with their own key **before considering the MVP (28–34) shippable**.

**Global invariants (true for every prompt below):**

- `src/core/` stays **pure** — no `child_process`, `fs`, Electron, or DOM imports. AI types, Zod schemas, redaction rules, mapping schemas, and result models live there.
- All AI network calls live in `src/main/ai/` behind **injected adapters**; the renderer never reaches a provider directly. **AI never calls `GitRunner`** — Git execution stays app-owned, deterministic, serialized, user-confirmed.
- **No blocker, gate, or Git mutation may depend on model output.** The AI is advisory: it explains, drafts, recommends. Deterministic controls stand alone.
- Secrets go through `AiCredentialStore` (Electron `safeStorage`), never into `AiConnection` JSON, never back to the renderer after save, never into logs.
- Every AI IPC payload and result is **Zod-validated** at the boundary; channel names follow house style (`ai:listConnections`, `ai:testConnection`, `ai:draftCommit`).
- **Default-off** with fixed precedence **repo override → global enable → `connection.enabled`**; a more specific opt-out always wins.
- All new user-facing strings are externalized in `src/renderer/strings.ts`.

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

## Phase 28 — AI Foundations, Decisions & Connection Contracts

```
Work on Phase 28 of GitWarden (see docs/plans/ai-integration-plan.md §3, §4, §5, §6, §8 Phase 28). Pure core only — no network, no UI, no Electron. Define the AI connection model and safety boundaries before any implementation.

Tasks (all in src/core/, PURE):
- Add the AI types and Zod schemas from the plan §5: AiConnectionKind, AiPrivacyMode (default is 'preview-each'; 'preview-first-run' is a conscious downgrade), AiRequestKind, AiConnection, AiConnectionCapabilities (note: localOnly is DERIVED from the resolved host / loopback, NOT from kind), AiCredentialMetadata, AiProviderDetection, CustomHttpMapping (responseMapping strings are a SAFE JSONPath subset — dotted-key/index only, no filter/script/wildcard), AiUsageEstimate, AiReviewFinding, plus the per-feature structured-output schemas used by later phases (commit draft, change summary, change review).
- AiConnection is non-secret JSON (including baseUrl, the send destination); secret material is referenced only by connectionId and lives in AiCredentialStore. Stored as a list (AiConnection[]) even though the MVP UI shows one active connection.
- Add deterministic redaction-rule fixtures in pure core: tokens, private keys, GitHub tokens, common env secrets, credential URLs. This is the SINGLE ruleset later reused by the Phase 33 secret scanner — do not plan a second pattern table.
- Update DECISIONS.md with: token-first single-active-connection UX; advisory-only AI (no autonomous Git mutation); Custom HTTP constraints incl. safe JSONPath subset; zero-retention / default-off policy; privacy-flag precedence (repo → global → connection); single shared redaction/secret-scanner ruleset; localOnly-by-host.
- Update SECURITY.md with: source-code-to-provider risk; credential handling; custom-endpoint constraints; safe JSONPath subset; prompt redaction (run before chunking); retention state; baseUrl tampering as a send-destination risk (non-secret JSON → preview shows the host).

Exit criteria: src/core/ stays pure; `npx tsc --noEmit` clean on tsconfig.node.json and tsconfig.web.json; Vitest covers the schemas, CustomHttpMapping validation (rejects unsafe JSONPath/placeholders), and the redaction fixtures; DECISIONS.md and SECURITY.md updated.

Then run the standard progress footer.
```

---

## Phase 29 — AI Connections Manager & Credential Store

```
Work on Phase 29 (docs/plans/ai-integration-plan.md §1, §6.1, §6.2, §8 Phase 29). Users can create, test, edit, disable, and delete a reusable AI Connection. Token-first UX with near-zero settings.

Tasks:
- AiConnectionService over JSON storage for non-secret connection records (AiConnection[]).
- AiCredentialStore over the existing SecretStore (Electron safeStorage) for encrypted API keys and custom header secrets. Secrets NEVER persist in connection JSON and NEVER cross back to the renderer after save.
- Connection CRUD IPC (Zod-validated): ai:listConnections, ai:createConnection, ai:updateConnection, ai:deleteConnection, ai:setActiveConnection.
- Credential IPC: ai:saveCredential, ai:deleteCredential — return ONLY AiCredentialMetadata (label, maskedPreview, secretFields, updatedAt), never the raw secret.
- ai:detectProvider for API-key prefix detection with PROGRESSIVE DISCLOSURE: sk-or- → OpenRouter, sk-ant- → Anthropic, gsk_ → Groq (all zero extra fields); sk-lm- → LM Studio (one base URL field pre-filled with http://localhost:1234/v1); bare sk-/sk-proj- → ambiguous OpenAI-compatible (one base URL field, default OpenAI); unknown → Advanced. The renderer receives only AiProviderDetection and a masked key label, never the raw key.
- Settings → AI UI (token-first, SINGLE active connection — not a manager of many): paste-key field as the primary entry; progressive disclosure (one base URL field only when the key is ambiguous); a model picker populated by the model-list fetch (that fetch IS the connection test — no separate Test button on this path), filtered to structured-output-capable models with a 'recommended' tag; a "Save connection" action and a SEPARATE "Enable AI" toggle (two deliberate steps); masked credential display; retention/privacy status (local connections shown as safest); an Advanced disclosure for Custom HTTP / manual base URL; a per-repo override entry point. Externalize all strings in strings.ts.

Exit criteria: Vitest proves credentials round-trip through encrypted storage and never persist in connection JSON; provider detection + progressive disclosure covered (sk-or-, sk-ant-, gsk_, sk-lm- → LM Studio prefill, ambiguous sk- → base-URL prompt, unknown → Advanced); enabling AI is a separate action from saving a connection (saving with AI still disabled sends nothing); IPC rejects malformed connection/credential payloads with Zod. Playwright with a fake store: create → save credential → edit → disable → delete. Renderer cannot read raw credentials after save. tsc --noEmit clean on both tsconfigs.

Then run the standard progress footer.
```

---

## Phase 30 — Adapter Registry, Built-in Providers & Custom HTTP

```
Work on Phase 30 (docs/plans/ai-integration-plan.md §3, §6.1, §6.3, §8 Phase 30). One registry routes AI requests to built-in or custom connections. All HTTP goes through the injected HttpClient seam so tests use fake HTTP only.

Tasks (src/main/ai/):
- AiAdapter interface: testConnection(connectionId), listModels(connectionId), generateStructured<T>(request), estimateUsage(request), cancel(requestId).
- AiAdapterRegistry that resolves a connection to its adapter.
- Built-ins: OpenRouterAdapter; OpenAICompatibleAdapter (ALSO the path for local servers — LM Studio / vLLM / llama.cpp — via a loopback base URL; treat structured output as a SERVER capability, do not pre-filter local models away; set localOnly from the resolved host); AnthropicAdapter; OllamaAdapter.
- CustomHttpAdapter driven by CustomHttpMapping. Supported placeholders only ({{apiKey}}, {{model}}, {{messagesJson}}, {{promptJson}}, {{responseSchemaJson}}, {{metadataJson}}); response mapping is a SAFE JSONPath subset (reject filter/script/wildcard expressions, don't silently ignore); mask secret header values everywhere.
- Transport rule for EVERY adapter (built-in and custom): https:// only, except http://localhost, http://127.0.0.1, http://[::1].
- Built-in adapters request structured JSON and parse responses through GitWarden's Zod schemas; fail closed on mismatch.
- Spend/rate guard: per-request token cap, daily soft cap, explicit warning before an expensive send.
- IPC (Zod-validated): ai:testConnection, ai:listModels, ai:estimateUsage, ai:cancel.

Exit criteria: unit tests use fake HTTP only; built-in adapters validate request shape and parse mapped responses through Zod; built-in adapters accept http:// loopback base URLs (LM Studio/Ollama/vLLM) and reject non-loopback http://, with localOnly set from the resolved host; Custom HTTP rejects non-HTTPS non-localhost URLs, unsupported placeholders, secret-leaking mappings, malformed response mappings, and any filter/script/wildcard JSONPath; the spend/rate guard refuses requests over cap. Playwright verifies test connection / list models with fake adapters.

Then run the standard progress footer.
```

---

## Phase 31 — Context Builder, Redaction & Send Preview

```
Work on Phase 31 (docs/plans/ai-integration-plan.md §4, §8 Phase 31). Privacy backbone — this MUST land before any feature sends a real diff.

Tasks:
- AiContextBuilder in main, assembled from existing services only: status, staged diff, selected unstaged diff, branch, remotes, the Safety Engine result, recent commits. NEVER call GitRunner directly from AI code — go through the existing app services.
- Deterministic redaction in pure core (tokens, private keys, GitHub tokens, common env secrets, credential URLs). This is the SINGLE source reused by the Phase 33 secret scanner — one implementation, not a parallel table.
- Run redaction on the FULL context BEFORE any chunk/truncation, so no split boundary leaks an un-scanned secret.
- A "show what will be sent" preview, 'preview-each' by default, displaying the post-redaction payload AND the destination host. 'preview-first-run' is a conscious downgrade the user opts into.
- Enforce the per-repo AI enable/disable override with fixed precedence (repo → global → connection): an opted-out repo blocks context assembly entirely.
- Deterministic chunk/truncation strategy for large diffs, applied AFTER redaction.

Exit criteria: Vitest redaction matrix passes, including a case proving redaction runs before chunking (a secret straddling a chunk boundary is still removed); large diffs chunk/truncate predictably after redaction; captured fake-adapter payloads contain no redacted fixture shapes (with the explicit caveat that this proves fixtures, not real-world completeness); the per-repo override blocks context assembly for opted-out repos (precedence repo → global → connection). Playwright verifies the preview — post-redaction payload and destination host — appears before sending a diff.

Then run the standard progress footer.
```

---

## Phase 32 — Smart Commit Assistant

```
Work on Phase 32 (docs/plans/ai-integration-plan.md §8 Phase 32). First useful vertical slice. The AI drafts; it never commits.

Tasks:
- On the Commit screen, add "Draft message" and "Summarize staged changes."
- Inputs come ONLY from AiContextBuilder (Phase 31) — never a fresh raw diff path.
- Outputs are structured and Zod-parsed: a conventional-commit option, a plain option, a concise summary, and an optional body.
- The user clicks to insert the chosen text; the AI must not commit. The existing Safety Engine commit gate still fully controls whether a commit can happen.
- Externalize all new strings in strings.ts.

Exit criteria: Vitest validates the structured commit-output schema and rejects malformed adapter output; Playwright with a fake adapter: staged diff → preview → draft appears → user inserts → the existing Safety Engine commit gate still controls the commit.

Then run the standard progress footer.
```

---

## Phase 33 — Change Review Assistant

```
Work on Phase 33 (docs/plans/ai-integration-plan.md §8 Phase 33). Help developers catch risk before commit — and keep a deterministic floor that works with AI off.

Tasks:
- Add a "Review staged changes" panel.
- Findings cover: risky files, secret-like changes, migrations, lockfiles, generated files, missing tests, destructive changes.
- Separate deterministic findings from AI findings via AiReviewFinding.source; add confidence labels and a "why this matters" line per finding.
- Ship a deterministic secret scanner in pure core that works with AI DISABLED, built on the SAME redaction ruleset from Phase 31 (one implementation, not a parallel pattern table).
- Externalize all strings.

Exit criteria: a fake AI review renders grouped findings with source/confidence labels; the deterministic secret scanner warns/blocks with AI disabled; a model "all clear" CANNOT clear a deterministic finding.

Then run the standard progress footer.
```

---

## Phase 34 — Safety Copilot _(recommended MVP stop point)_

```
Work on Phase 34 (docs/plans/ai-integration-plan.md §8 Phase 34). Explain safety issues and suggest safe repairs. This is the recommended MVP stop point — the advisory experience is complete here. Never auto-apply anything.

Tasks:
- In the Safety Center and the push sheet, add "Explain this" per issue.
- Cover the real SafetyCode union: NO_ACTIVE_PROFILE, REPO_UNASSIGNED, PROFILE_MISMATCH, IDENTITY_UNSET, EMAIL_MISMATCH, EMAIL_FROM_GLOBAL_ONLY, NOTHING_STAGED, EMPTY_MESSAGE, HAS_CONFLICTS, NO_REMOTE, REMOTE_HOST_MISMATCH, GITHUB_ACCOUNT_MISMATCH, GITHUB_TOKEN_MISSING, GITHUB_TOKEN_INVALID, GITHUB_NOT_CONNECTED.
- Suggest safe next actions using EXISTING app actions only: set local identity, switch active profile, assign repo profile, reconnect GitHub. The AI never applies the action — it only points the user at the existing control.
- Externalize all strings.

Exit criteria: every SafetyCode has deterministic fallback copy (so an explanation exists with AI disabled); unit tests cover issue → suggested-action mapping; Playwright proves the explanation does NOT enable a blocked commit/push.

Then run the standard progress footer.
```

---

## Phase 35 — Push Brief & History Intelligence

```
Work on Phase 35 (docs/plans/ai-integration-plan.md §8 Phase 35). Make remote operations less opaque. Push still requires explicit confirmation.

Tasks:
- Before push, summarize the commits ahead of upstream and explain what will be published.
- Highlight the identity/account used for the push via the Phase 27 push context.
- Add History summaries: a release-notes draft, branch activity, and a changelog draft.
- Externalize all strings.

Exit criteria: works offline with a fake adapter; push still requires explicit confirmation; no summary includes token/credential material.

Then run the standard progress footer.
```

---

## Phase 36 — Repo Onboarding Assistant

```
Work on Phase 36 (docs/plans/ai-integration-plan.md §8 Phase 36). Help users understand an unfamiliar repo, from allowlisted files only.

Tasks:
- Generate a project brief from ALLOWLISTED files: README, package scripts, config files, recent commits.
- Identify likely test/build commands WITHOUT running them.
- Add a "How do I work on this repo?" panel.
- Externalize all strings.

Exit criteria: context is limited to allowlisted files by default; the user can inspect the included files before send; the renderer security invariants still hold (contextIsolation, sandbox, no Node in renderer).

Then run the standard progress footer.
```

---

## Phase 37 — Failure Explainer

```
Work on Phase 37 (docs/plans/ai-integration-plan.md §8 Phase 37). Turn Git/test errors into next steps. The explanation is additive — the deterministic message stands alone with AI off.

Tasks:
- Explain failed git operations from the existing GitCommandError / ErrorMapper.
- Explain pasted or selected test/lint output.
- Map errors to categories aligned with GitErrorCode.
- Suggest existing safe app actions.
- Externalize all strings.

Exit criteria: unit tests cover GitErrorCode → category → suggested action; the AI explanation is additive and the ErrorMapper deterministic message stands alone with AI disabled.

Then run the standard progress footer.
```

---

## Phase 38 — Connection Templates, Import/Export & Team Handoff

```
Work on Phase 38 (docs/plans/ai-integration-plan.md §6, §8 Phase 38). Make the connection system reusable WITHOUT sharing secrets.

Tasks:
- Add built-in connection templates: OpenRouter, OpenAI-compatible, Anthropic, Ollama, and Custom HTTP examples.
- Allow export/import of connection templates WITHOUT credentials.
- Add "duplicate connection" and "test after import."
- Add an optional per-repo recommended-connection assignment.
- Externalize all strings.

Exit criteria: exported templates contain NO secrets; imported templates require fresh credential entry before activation; Playwright: export template → import template → add credential → test → use with a fake adapter.

Then run the standard progress footer.
```

---

## Phase 39 — Optional Agentic Actions _(deferred; allowlist-only)_

```
Work on Phase 39 (docs/plans/ai-integration-plan.md §7, §8 Phase 39). DEFERRED — do not start until the advisory MVP (28–34) is stable. The only phase where AI influences file/action proposals, and it stays inside a closed allowlist.

Tasks:
- AI may propose patches or action plans mapped ONLY to existing, app-owned, allowlisted operations. Enumerate the allowlist BY NAME (like the SafetyCode union in Phase 34) — it must exclude anything that writes .git/config, stages, pushes, changes identity, or runs shell.
- Require preview → diff review → explicit confirmation for every proposal.
- No arbitrary shell, no push, no global git config, no destructive commands — even with confirmation.
- Tests run only on explicit confirm. Approved actions dispatch through the existing app action layers, preserving all safety gates.

Exit criteria: proposals are schema-validated and rejected if they reference a non-allowlisted action; the app shows the exact files/actions before execution; an E2E test proves that rejecting a proposal leaves the repo unchanged.

Then run the standard progress footer.
```

---

## After the MVP (28–34): manual real-connection smoke check

Before considering the MVP shippable, a maintainer runs the plan's Appendix A by hand (with their own key — this is the only step that touches a real provider):

1. Create an OpenRouter connection by pasting a key; verify detection, test connection, model selection, masked credential display.
2. Create a Custom OpenAI-compatible connection with a base URL/model (e.g. a local LM Studio at http://localhost:1234/v1); verify test connection and the local "source stays on this machine" status.
3. Create a Custom HTTP connection against a test endpoint; verify template rendering and response mapping.
4. Confirm raw credentials are not readable from the renderer and do not appear in exported templates.
5. Draft a commit message on a real staged diff, review the post-redaction payload preview (payload + destination host), and confirm the retention/privacy state is visible.
