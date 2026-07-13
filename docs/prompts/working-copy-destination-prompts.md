# GitWarden — Working-Copy Destination Phase Prompts

Copy-paste prompts to drive the **Working-Copy Destination** feature one phase at a time. Each
prompt is self-contained, points at the plan in `docs/plans/working-copy-destination-plan.md`, and
**ends with the standard progress footer** that records progress in `docs/progress-log.md`. Rules
live in `CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (106 → 107). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phase 106 is the pure-core logic checkpoint;
Phase 107 is the renderer/e2e feature-complete stop point. One commit per phase; the progress-log
entry written **before** the commit.

**Prerequisites / offline note:** No network, no GitHub account, no new dependency, and no new
IPC. Unit tests stay framework-free where applicable; renderer and e2e coverage uses the existing
offline test harness and local repository fixtures.

**Product boundary (do not cross):** this is persistent Status-screen information architecture,
not a banner, modal, warning, or Git action. Do not change staging, switching, committing, Git
execution, IPC, or ownership of branch state.

Background facts (already verified against the tree — don't re-litigate):

- `FileChange` has one stable `path` plus index/worktree statuses, and `GitStatus` already carries
  `files`, `branch`, and `detached`. The porcelain parser normally emits one record per changed
  path, but Status deliberately displays an `MM` record in both staged and unstaged lists.
- `statusStore.loadStatus` keeps an existing same-repository result rendered during a refresh; it
  clears only when the repository changes. The card therefore uses `null` solely for unknown
  initial status, never a fake zero.
- `appStore.currentBranch` is the destination source. `branchStore` is its sole writer and updates
  it only after `git.switchBranch` succeeds, so a failed or blocked switch truthfully retains the
  previous branch without a new store or optimistic update.
- `StatusScreen` owns the Status toolbar insertion point and the current `UNTRACKED FILES` label.
  `GlobalHeader` has separate branch-dropdown, fallback, and detached `on` render paths.
- User-facing strings are centralized in `src/renderer/strings.ts`; `theme.css` already provides
  shared `--gw-*` light/dark tokens. Existing Status and switch UX specs cover a dual-state file
  and a blocked dirty-tree switch.

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

## Phase 106 — Unique working-copy count (pure core)

```
Work on Phase 106 of GitWarden (docs/plans/working-copy-destination-plan.md §"Phase 106 — Unique working-copy count (pure core)"). Pure core only — no IPC, no UI.

Tasks:
- Add `src/core/status/workingCopy.ts` with the framework-free export `countUniqueChangedFiles(files: readonly FileChange[]): number`. Use `FileChange.path` as identity and count each changed path once, even when an input is duplicated or a file is both staged and unstaged.
- Treat a path as changed when either its index or worktree status represents a real change. `unmodified`-only and `ignored`-only input must not contribute. An `MM` file, a conflicted file, and an untracked file each contribute exactly one.
- Keep `src/core/` pure: no Electron, DOM, renderer, filesystem, or child-process import. Do not modify the porcelain parser, `GitStatus`, `statusStore`, or any renderer file.
- Add `tests/unit/working-copy-count.test.ts` covering empty/clean input; one changed file; `MM`; duplicate input for one path; untracked; conflicted; ignored/unmodified-only records; and a mixed multi-path set.

Exit: `npx tsc -p tsconfig.node.json --noEmit` and `npx tsc -p tsconfig.web.json --noEmit` clean; `npm test` green including the new helper tests; core-purity passes; `npm run lint` clean.

Then run the standard progress footer.
```

---

## Phase 107 — Working-copy destination card and truthful labels (renderer + e2e) — feature-complete stop point

```
Work on Phase 107 of GitWarden (docs/plans/working-copy-destination-plan.md §"Phase 107 — Working-copy destination card and truthful labels (renderer + e2e)"). Renderer + e2e; feature-complete stop point. Begin only after Phase 106's progress-log gate is ✅.

Tasks:
- Add the reusable presentation-only `src/renderer/components/WorkingCopyDestinationCard.tsx`. Its only data props are `count: number | null`, `branch: string | null`, and `detached: boolean`; it must not read a store, call Git/IPC, or expose an action. Render a labelled semantic region and concise screen-reader summary.
- Implement the full compact card states from the plan: dirty count with singular/plural `N uncommitted change(s)` and muted `Not in any branch yet.`; clean `Working copy clean` plus `No changes are waiting to commit.`; initial unknown `Checking working copy…` without a numeric zero; normal destination `DESTINATION BRANCH`, `Checked out: <branch>`, and `Changes join this branch only after commit.`; detached HEAD with an honest no-branch destination; and an unknown-branch fallback that does not invent a branch name. Keep the center `COMMIT →` connector non-interactive.
- In `src/renderer/screens/StatusScreen.tsx`, render the card immediately below the Status toolbar and above the stash-conflict banner only when an active repository exists. Pass `countUniqueChangedFiles(status.files)` when status exists and `null` otherwise; pass the confirmed `status.detached`; read the destination only from `appStore.currentBranch`. Preserve existing same-repository refresh behavior so the prior card stays visible while a background refresh is pending.
- Extend the local `SectionHeader` only as needed to support a muted subtitle, rename `UNTRACKED FILES` to `NEW FILES`, and add `Not yet in Git history.` without changing existing file actions or test IDs.
- In `src/renderer/components/GlobalHeader.tsx`, replace every visible branch-context `on` prefix (dropdown, fallback, detached) with externalized `Checked out:` wording. Preserve the existing branch-picker behavior and make its accessible label agree with that wording.
- Externalize all new visible and accessible copy in `src/renderer/strings.ts`. Add scoped card styles in `src/renderer/theme.css` using existing `--gw-*` tokens: compact three-part layout wide, wrapped/stacked layout narrow, and a visually hidden summary utility. It must work in light and dark themes without clipping.
- Add stable test IDs only when an accessible selector cannot express the behavior. Do not add a branch store, change the sole-writer rule, add IPC, add dependencies, or alter switch/stage/commit mechanics.
- Add `tests/unit/working-copy-destination-card.test.tsx` using existing React/React-DOM tooling for loading, dirty, singular/plural, clean, normal-branch, and detached copy. Extend `tests/e2e/status.spec.ts` to prove an `MM` file counts once, the clean card remains full, a successful header switch updates its confirmed destination, and the new header/new-files labels appear. Extend `tests/e2e/switch-ux.spec.ts` to prove a blocked dirty switch leaves the destination card on the previous branch. Add detached-HEAD and narrow-width wrapping coverage without relying on color screenshots alone.

Exit: `npx tsc -p tsconfig.node.json --noEmit` and `npx tsc -p tsconfig.web.json --noEmit` clean; `npm test` green including count and presentation tests; `npm run lint` clean; relevant Playwright Status and switch-UX specs green; every acceptance criterion in the plan is met.

Then run the standard progress footer.
```
