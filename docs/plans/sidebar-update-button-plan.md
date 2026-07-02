# Plan — Add an Update button to the sidebar footer

**Status:** 🔲 planned
**Type:** fix / improvement (not a numbered phase)
**Suggested commit:** `Fix: Add Update button to the sidebar footer`

## Goal

Today, when a new GitWarden release is available, the **only** places that say so are the header
notifier (a button that appears next to the profile chip) and the Settings screen's "Updates"
card. Neither is visible while the user is looking at the sidebar, and the sidebar — the app's
permanent navigation rail — has no footer affordance at all.

This adds a small **Update** button pinned to the bottom of the sidebar that appears **only when
an update is actually available**, reusing the exact same signal and click behavior the header
button already has. It is purely additive: the header keeps working exactly as it does today: this
just gives the same fact a second, always-in-view home next to the rest of the app's navigation.

**Product boundary (decided):** the sidebar button is a second **display** of the existing
"update available" signal, not a new update mechanism. It does not trigger a check itself (only
the launch auto-check and the Settings "Check for updates" button do that); it does not download
or install anything in-app; and it does not change or remove the header's existing button.

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **The header notifier is the exact behavior to mirror.** `GlobalHeader` derives
   `availableUpdate` from the store and renders a button only when it is non-null
   ([GlobalHeader.tsx:76-78](../../src/renderer/components/GlobalHeader.tsx)); the button's
   `onClick` is `window.api.shell.openExternal(availableUpdate.url)`, its `data-testid` is
   `header-update-button`, and its `aria-label`/`data-tooltip` come from
   `STR.UPDATE_BUTTON_ARIA(version)` / `STR.UPDATE_AVAILABLE(version)`
   ([GlobalHeader.tsx:258-288](../../src/renderer/components/GlobalHeader.tsx)). **Consequence:**
   the sidebar button reuses this exact derivation and click handler — no new logic.

2. **`useUpdatesStore` is the single source of truth and needs no changes.** It exposes
   `{ result, checking, check() }`; `result.status === 'update-available'` carries `release: {
version, url }` ([updatesStore.ts:1-28](../../src/renderer/store/updatesStore.ts)). The store is
   populated by a launch auto-check in `App.tsx` (skipped under Playwright via
   `navigator.webdriver`) and by the Settings screen's manual "Check for updates" button
   ([App.tsx:298-300](../../src/renderer/App.tsx),
   [SettingsScreen.tsx:120-190](../../src/renderer/screens/SettingsScreen.tsx)). **Consequence:**
   the sidebar button is a pure read of this existing store — it does not call `check()` itself.

3. **The Settings "Updates" card is the always-visible manual-check surface — explicitly not
   mirrored here.** `UpdatesCard` always renders a "Check for updates" button plus status text
   ([SettingsScreen.tsx:119-190](../../src/renderer/screens/SettingsScreen.tsx)); its own comment
   notes "no in-app install." **Consequence (decided in this plan's kickoff interview):** the
   sidebar footer only ever shows the compact "update available" state, never a persistent
   check/status control — that stays in Settings. No in-app install is inherited as-is.

4. **The sidebar has no footer region today — everything lives inside the scrollable nav list.**
   The `<nav>` element's only child is a `flex: 1; overflowY: auto` wrapper around
   `NAV_ITEMS.map(...)`, closing right before `</nav>`
   ([Sidebar.tsx:151-207](../../src/renderer/components/Sidebar.tsx)). **Consequence:** a new
   sibling `<div>` must be added after that scrollable wrapper's closing tag and before `</nav>`,
   with `flexShrink: 0` so it never scrolls out of view.

5. **The collapsed/expanded rendering pattern to reuse is already established per nav item.**
   `showExpandedLabels` (derived from the `collapsed` prop and a `labelsVisible` transition state)
   gates icon-only vs. icon+label rendering for every nav button
   ([Sidebar.tsx:85-88](../../src/renderer/components/Sidebar.tsx),
   [Sidebar.tsx:184-200](../../src/renderer/components/Sidebar.tsx)); collapsed nav buttons carry
   `data-tooltip` + `data-tooltip-pos="right"` for the universal tooltip mechanism
   ([Sidebar.tsx:173-175](../../src/renderer/components/Sidebar.tsx)). **Consequence:** the footer
   button follows the identical collapsed-icon+tooltip / expanded-icon+label shape — no new
   disclosure pattern is invented.

6. **The e2e harness for updates already exists and needs no new fixture.** `tests/e2e/updates.spec.ts`
   launches the app with `GITWARDEN_E2E_FAKE_UPDATES=1` (+ `GITWARDEN_E2E_UPDATE_AVAILABLE=1` for the
   "available" case), drives a real check through the Settings button (the launch auto-check is
   suppressed under Playwright), then asserts on `header-update-button`
   ([updates.spec.ts:14-50](../../tests/e2e/updates.spec.ts)). **Consequence:** the same two tests
   extend with a `sidebar-update-button` assertion — no new launch harness or fake service.

7. **No new strings are needed.** `STR.UPDATE_BUTTON_LABEL` ('Update'), `STR.UPDATE_BUTTON_ARIA`,
   and `STR.UPDATE_AVAILABLE` already exist and are exactly the copy the header uses
   ([strings.ts:454-464](../../src/renderer/strings.ts)). **Consequence:** the sidebar button reuses
   these verbatim; this plan adds zero new `STR` entries.

8. **Accent styling precedent.** The header button uses `background: var(--gw-accent, #6366f1)` /
   `color: var(--gw-on-solid, #fff)` to read as an actionable CTA distinct from neutral chrome
   ([GlobalHeader.tsx:265-281](../../src/renderer/components/GlobalHeader.tsx)). **Consequence:**
   reuse the same two tokens so the two affordances read as the same signal.

## Scope

- **In:**
  - A new footer element in `Sidebar.tsx`, rendered only when `useUpdatesStore`'s result is
    `update-available`.
  - Collapsed state: icon-only with a tooltip; expanded state: icon + "Update" label — matching the
    existing nav-item collapse pattern.
  - Click opens the release URL externally, identical to the header button.
  - `tests/e2e/updates.spec.ts` extended to assert the sidebar button's visibility/hidden states
    alongside the header button's.
- **Out / Non-goals:**
  - No change to `GlobalHeader.tsx`'s existing button — both coexist unchanged.
  - No in-app download or install — clicking only opens the external release page (inherited from
    the existing Settings/header behavior).
  - No new update-check trigger — the sidebar button never calls `check()`; it only reflects
    whatever the launch auto-check or the Settings manual check already found.
  - No new `STR` entries, no new IPC, no new core/service code — this is a renderer-only view over
    the existing `updatesStore`.
  - No change to the launch auto-check cadence or its `navigator.webdriver` e2e suppression.

## Implementation

### Step 1 — Sidebar footer button

- In [Sidebar.tsx](../../src/renderer/components/Sidebar.tsx), subscribe to
  `useUpdatesStore((s) => s.result)` and derive `availableUpdate` the same way
  `GlobalHeader.tsx:77-78` does.
- Render a new `<div>` immediately after the scrollable `NAV_ITEMS` wrapper's closing tag (current
  `Sidebar.tsx:205`) and before `</nav>` (current `Sidebar.tsx:206`), with `flexShrink: 0` and a
  `borderTop: 1px solid var(--gw-border, #27272a)` divider so it reads as a distinct footer, not
  another nav group.
- Render nothing when `availableUpdate` is `null`.
- When present, render a `<button>`:
  - `data-testid="sidebar-update-button"`.
  - Collapsed (`!showExpandedLabels`): icon only (`↓`, matching the header's glyph), centered,
    `aria-label={STR.UPDATE_BUTTON_ARIA(availableUpdate.version)}`,
    `data-tooltip={STR.UPDATE_AVAILABLE(availableUpdate.version)}`, `data-tooltip-pos="right"` —
    matching every other collapsed nav button's tooltip convention.
  - Expanded: icon + `STR.UPDATE_BUTTON_LABEL` text, laid out like the header's `↓ Update`
    composition; keep the same `data-tooltip` so hovering still surfaces the version in both states.
  - Style: `background: var(--gw-accent, #6366f1)`, `color: var(--gw-on-solid, #fff)` — the same
    two tokens as the header button — so it visually reads as the same CTA.
  - `onClick={() => void window.api.shell.openExternal(availableUpdate.url)}` — identical to
    `GlobalHeader.tsx:264`.
- Verify at implementation time whether the sidebar's own collapse-toggle affordance still lives
  inside `Sidebar.tsx` or has moved elsewhere (the working tree has an in-progress, uncommitted
  change relocating it to a window titlebar) — the footer button must sit correctly relative to
  whatever the sidebar's bottom region looks like at that point; do not assume this plan's line
  numbers survive that unrelated change.

### Step 2 — Tests

- Extend the existing two tests in [updates.spec.ts](../../tests/e2e/updates.spec.ts) (no new
  launch harness, no new fake service):
  - "shows the header Update button only after a check finds a newer release": after asserting the
    header button, also assert `sidebar-update-button` is visible, contains `STR.UPDATE_BUTTON_LABEL`
    (when expanded), and has the same `aria-label` version pattern as the header button.
  - "stays hidden when the app is already up to date": also assert `sidebar-update-button` has
    count 0.
  - Add a small collapsed-state check: collapse the sidebar, re-run the "available" case (or reuse
    the same window), and assert the footer button is still present (icon-only) with its
    `data-tooltip` carrying the version.
- No new unit test — this mirrors the header button, which also has no dedicated unit test (it's a
  pure render of already-tested store state), covered instead by e2e.

### Step 3 — Docs & closeout

- Add a dated entry to [docs/progress-log.md](../../docs/progress-log.md) in the existing
  `### YYYY-MM-DD — Fix: …` format (Fixed / Files / Tests / Notes).
- Run `npm test`, `npm run e2e`, `npm run lint`. Commit **only** on green, as
  `Fix: Add Update button to the sidebar footer` with the
  `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. Do **not** push.

## Files

| Action | Path                                  |
| ------ | ------------------------------------- |
| edit   | `src/renderer/components/Sidebar.tsx` |
| edit   | `tests/e2e/updates.spec.ts`           |
| edit   | `docs/progress-log.md`                |

## Acceptance criteria

- The sidebar footer shows an "Update" button **only** when `useUpdatesStore`'s result is
  `update-available` — identical gating to the header button.
- Clicking it opens the release URL externally — identical behavior to the header button.
- It coexists with the unchanged header button; both reflect the same store state at all times.
- Works in both collapsed (icon + tooltip) and expanded (icon + label) sidebar states, using the
  sidebar's existing collapse/tooltip conventions.
- No new `STR` entries, no new IPC/core/service code.
- `npm test`, `npm run e2e`, `npm run lint` all green; one commit; not pushed.

## Decisions (resolved)

1. **Visibility:** only when an update is available (mirrors the header notifier) — not an
   always-visible manual-check control (that stays exclusive to Settings).
2. **Coexistence:** additive. The header's existing button is unchanged; the sidebar gets the same
   affordance in addition.
3. **Click action:** opens the release page externally via `window.api.shell.openExternal`,
   identical to the header button — no navigation to Settings.
4. **Decomposition:** non-phased fix (single renderer surface, no new core/IPC contract) — follows
   the `header-guard-badge` precedent; does not consume a global phase number.

## Open questions

None — the kickoff interview resolved visibility, coexistence, and click behavior; the interview
also confirmed the non-phased classification.
