# GitWarden — Profile Repository Summary Phase Prompts

Copy-paste prompts to drive the **Profile Repository Summary** feature one phase at a time. Each
prompt is self-contained, points at the approved plan in
`docs/plans/profile-repository-summary-plan.md`, and ends with the standard progress footer that
records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (117 → 118). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phase 117 is the pure-core checkpoint;
Phase 118 is the renderer/e2e feature-complete stop point. One commit per phase; write the progress
entry before the commit.

**Product boundary:** counts represent assigned local `RepositoryRecord`s, not linked GitHub
accounts. Duplicate local working copies remain distinct. Repository names and paths appear only
in the read-only Context panel; Edit Profile, activation behavior, persistence, IPC, and Git
execution remain unchanged.

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
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md and re-derive any affected derived views (Feature Track Status row, AGENTS.md build order).
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 117 — Profile repository summary selector (pure core)

```
Work on Phase 117 of GitWarden (docs/plans/profile-repository-summary-plan.md §"Phase 117 — Profile repository summary selector (pure core)"). Pure core only — no renderer, IPC, Electron, fs, child_process, or DOM imports (AGENTS.md #1).

Tasks:
- Add src/core/profiles/profileRepositorySummary.ts exporting ProfileRepositoryEntry, ProfileRepositorySummary, and buildProfileRepositorySummary(profileId, repositories) exactly as the plan contract defines.
- Include only records whose assignedProfileId exactly matches profileId. Count records, not unique names, paths, or remotes; duplicate local working copies remain separate.
- Return only id/name/localPath in a new array, sorted deterministically by case-insensitive name, then localPath, then id. Do not mutate or reorder the input.
- Add tests/unit/profile-repository-summary.test.ts with table-driven coverage for zero, one, many, unassigned and unrelated profiles, duplicate names/remotes, distinct local paths, deterministic ordering, count/list consistency, and input immutability.

Exit: npx tsc --noEmit clean for both TypeScript configs; npm test green including the new suite; npm run lint clean; core-purity review passes for src/core/profiles/profileRepositorySummary.ts.

Then run the standard progress footer.
```

---

## Phase 118 — Profile badges and screen-aware Context details (renderer + e2e)

```
Work on Phase 118 of GitWarden (docs/plans/profile-repository-summary-plan.md §"Phase 118 — Profile badges and screen-aware Context details (renderer + e2e)"). Renderer + e2e; no main, preload, IPC, persistence, or Git execution changes. Begin only after Phase 117's progress-log gate is ✅.

Tasks:
- Add selectedProfileId and its setter to appStore as transient renderer state. Profiles selection writes it; New Profile and deletion clear it; a missing profile id is treated as no selection.
- Use the Phase-117 selector and repository-store load state to show a compact count badge in every profile row. Keep zero visible but muted; show loading/unavailable honestly instead of false zero; mark retained data stale after a failed refresh. Do not change the Active / Set Active action or row hit target.
- On the Profiles screen only, split Context into ACTIVE WORKSPACE and SELECTED PROFILE. Keep the existing active workspace fields, then show the selected profile and ASSIGNED REPOSITORIES · N with read-only repository name/path rows. Ellipsize long paths while retaining the full value in title and accessible text; keep the Inspector usable at narrow widths and with long lists.
- Do not add repositories to Edit Profile, activate a selected profile, open/switch the right panel, disturb AI Chat, or change Context on other screens. Externalize all new visible and assistive strings and add stable test ids for every new surface/state.
- Extend tests/e2e/profiles.spec.ts using the existing typed bridge. Cover 0/1/many, duplicate local working copies, active Personal while selected Eleken, full-path access, create/deleted-selection cleanup, away-navigation hiding Context details, badges with the panel closed or AI Chat selected, and Edit Profile/activation non-regression.

Exit: npx tsc --noEmit clean for both TypeScript configs; npm test green; npm run lint clean; targeted profiles Playwright green; full Playwright suite green in safe chunks; narrow and wide Inspector visual checks recorded; every approved state automated or explicitly recorded.

Then run the standard progress footer.
```
