# GitWarden — Sidebar Update Button prompts

Copy-paste prompts to drive the **"Add an Update button to the sidebar footer"** fix one step at
a time. Each prompt is self-contained and points at the plan in
`docs/plans/sidebar-update-button-plan.md`. Rules live in `CLAUDE.md` / `AGENTS.md`.

**This is a single fix, not a numbered phase** — it lands as **one commit** at the very end
(`Fix: Add Update button to the sidebar footer`). Run the steps in order; **do not commit between
steps**. Renderer-only: no core/IPC layer is touched.

**No external prerequisite.** No network, no GitHub account, no token. E2E reuses the existing fake
update service (`GITWARDEN_E2E_FAKE_UPDATES` / `GITWARDEN_E2E_UPDATE_AVAILABLE`) already wired in
`tests/e2e/updates.spec.ts` — no new fixture or launch harness.

Background facts (already verified against the tree — don't re-litigate):

- The header notifier is the exact behavior to mirror: `GlobalHeader` derives `availableUpdate`
  from `useUpdatesStore` and shows a button only when it's non-null; `onClick` opens
  `availableUpdate.url` externally (`GlobalHeader.tsx:76-78,258-288`).
- `useUpdatesStore` (`{ result, checking, check() }`) is the single source of truth and needs no
  changes — the sidebar button only **reads** it, never calls `check()` itself
  (`updatesStore.ts:1-28`).
- The Settings "Updates" card (always-visible manual check) is explicitly **not** mirrored — the
  sidebar only ever shows the compact "update available" state (`SettingsScreen.tsx:119-190`).
- The sidebar has **no footer region today** — the `<nav>`'s only child is a `flex:1;
overflowY:auto` wrapper around `NAV_ITEMS.map(...)` (`Sidebar.tsx:151-207`). A new footer sibling
  goes after that wrapper's closing tag, before `</nav>`.
- Reuse the existing collapsed/expanded nav-item pattern (`showExpandedLabels`,
  `data-tooltip`/`data-tooltip-pos="right"`) — do not invent a new disclosure mechanism
  (`Sidebar.tsx:85-88,173-175,184-200`).
- **The working tree may have an unrelated, uncommitted WIP** relocating the sidebar's
  collapse-toggle into a window titlebar. Re-verify the sidebar's current bottom-region layout at
  implementation time rather than trusting the plan's line numbers if that WIP has changed further.
- No new `STR` entries are needed — reuse `UPDATE_BUTTON_LABEL`, `UPDATE_BUTTON_ARIA`,
  `UPDATE_AVAILABLE` verbatim (`strings.ts:454-464`).

---

## 🔁 Closeout footer (run only at the end of Step 2)

```
When all acceptance criteria in docs/plans/sidebar-update-button-plan.md are met and tests are green:
1. Append a dated entry to docs/progress-log.md in the existing fix format (newest last, do not rewrite past entries):
   ### <today's date> — Fix: Add Update button to the sidebar footer
   - Fixed: <what changed and why — sidebar footer now shows the same "update available" signal as the header notifier>
   - Files: <files added/changed>
   - Tests: <exact vitest + playwright results, e.g. "e2e N passed">
   - Notes / follow-ups: <anything worth knowing>
2. Commit ALL changes as ONE commit (only if everything is green):
   git add -A
   git commit -m "Fix: Add Update button to the sidebar footer" -m "<one-line summary>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
3. Report the test output to me honestly. If anything failed or was skipped, say so explicitly.
```

---

## Step 1 — Sidebar footer button

```
Work on Step 1 of the sidebar-update-button fix (see docs/plans/sidebar-update-button-plan.md §"Step 1" and §"Codebase findings"). Renderer only. Do NOT commit.

Tasks:
- In src/renderer/components/Sidebar.tsx, subscribe to useUpdatesStore((s) => s.result) and derive `availableUpdate` the same way GlobalHeader.tsx:77-78 does (result?.status === 'update-available' ? result.release : null).
- Re-check the sidebar's current bottom-region layout first (there may be an unrelated, uncommitted WIP moving the collapse-toggle into a window titlebar) — the footer must sit as a non-scrolling sibling AFTER the scrollable NAV_ITEMS wrapper and BEFORE the closing </nav>, whatever that wrapper's current line numbers are.
- Render nothing when availableUpdate is null. When present, render a <button data-testid="sidebar-update-button">:
    - Wrap it in a footer <div> with flexShrink: 0 and a borderTop: 1px solid var(--gw-border, #27272a) divider.
    - Collapsed (!showExpandedLabels): icon only ("↓"), centered, aria-label={STR.UPDATE_BUTTON_ARIA(availableUpdate.version)}, data-tooltip={STR.UPDATE_AVAILABLE(availableUpdate.version)}, data-tooltip-pos="right" — matching every other collapsed nav button.
    - Expanded: icon + STR.UPDATE_BUTTON_LABEL text (mirrors the header's "↓ Update" composition); keep the same data-tooltip in both states.
    - Style with background: var(--gw-accent, #6366f1) / color: var(--gw-on-solid, #fff) — the same two tokens the header button uses.
    - onClick={() => void window.api.shell.openExternal(availableUpdate.url)} — identical to GlobalHeader.tsx:264.
- Do NOT add any new STR entries — reuse UPDATE_BUTTON_LABEL / UPDATE_BUTTON_ARIA / UPDATE_AVAILABLE verbatim.
- Do NOT touch GlobalHeader.tsx, updatesStore.ts, or SettingsScreen.tsx — this step is additive-only in Sidebar.tsx.

Exit: `npx tsc --noEmit` clean on both tsconfigs; `npm run lint` clean; manual sanity check that the button only renders when an update is present. Do NOT commit yet.
```

---

## Step 2 — Tests, docs & closeout commit

```
Work on Step 2 of the sidebar-update-button fix (docs/plans/sidebar-update-button-plan.md §"Step 2", §"Step 3", §"Acceptance criteria"). This step ends with the single commit.

Tasks:
- Extend tests/e2e/updates.spec.ts (reuse the existing launchApp harness — no new fixture, no new fake service):
    - In "shows the header Update button only after a check finds a newer release": after asserting the header button, also assert sidebar-update-button is visible, contains STR.UPDATE_BUTTON_LABEL text, and carries the same aria-label version pattern (/99\.0\.0/) as the header button.
    - In "stays hidden when the app is already up to date": also assert sidebar-update-button has count 0.
    - Add a small collapsed-state check: collapse the sidebar and assert the footer button is still present (icon-only) with its data-tooltip carrying the version.
- No new unit test is needed — this mirrors the header button (no dedicated unit test), covered by e2e only.

Verify (all must be green):
  npm test
  npm run e2e
  npm run lint

Then run the closeout footer at the top of this file (progress-log entry + the single
`Fix: Add Update button to the sidebar footer` commit). Do NOT push.
```
