# GitWarden — Landing Live Demo Phase Prompts

Copy-paste prompts to drive the **Landing Live Demo** feature one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/landing-live-demo-plan.md`, and **ends with the
standard progress footer** that records progress in `docs/progress-log.md`. Rules live in
`CLAUDE.md` / `AGENTS.md`.

**How to use:** run prompts in order (108 → 109). Don't start a phase until the previous phase's
entry in `docs/progress-log.md` shows Exit criteria ✅. Phase 108 is the landing-local pure-state
checkpoint; Phase 109 is the Astro/e2e feature-complete stop point. One commit per phase; the
progress-log entry written **before** the commit.

**Prerequisites / offline note:** Work inside the isolated `landing/` package and run its commands
from that directory. No network, GitHub account, repository fixture, backend, Electron process,
desktop-app import, or new dependency is required. Playwright uses the existing fixture release
mode and blocks the GitHub self-heal request.

**Product boundary (do not cross):** this is a deterministic public simulation. It may copy the
approved warning strings into landing copy, but it must never import or expose the Safety Engine,
`src/core`, `src/renderer`, Electron, preload, IPC, or any app service in the landing bundle. It
never runs Git, persists profile state, calls a backend, or changes the desktop app.

Background facts (already verified against the tree — don't re-litigate):

- `landing/src/pages/index.astro` renders Hero immediately before Why GitWarden, which is the exact
  insertion seam for a second `#live-demo` section. `DownloadHero.astro` mutates only its
  `data-gw-cta` container during release self-healing, so the demo anchor belongs outside it.
- The landing is static Astro with vanilla TypeScript and no React runtime. All visible copy lives
  in `landing/src/content/copy.ts`; no new UI dependency is needed.
- The fixed scenario is `northwind-portal`, assigned profile Client, effective local identity
  Client, branch `main`, one staged file, and a prefilled message. Personal starts active; Personal
  and Work are blocked, Client is ready.
- The copied app strings are exact contracts: `Guard · Ready`, `Guard · Blocked`, the three
  profile/name/email mismatch messages, `Switch to "Client"`, `Fixing…`, and `Commit Changes`.
- The desktop mock follows current `GlobalHeader`, `CommitScreen`, `RemediationButton`, and
  `theme.css` contracts. Mobile is a simplified version of the same interaction, never autoplay.
- Existing landing Playwright coverage already pins fixture-only builds, no-JS reachability, axe,
  light/dark themes, reduced motion, and 375px overflow behavior.

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

## Phase 108 — Scripted demo model and copy contract (landing-local pure TypeScript)

```
Work on Phase 108 of GitWarden (docs/plans/landing-live-demo-plan.md §"Phase 108 — Scripted demo model and copy contract (landing-local pure TypeScript)"). Landing-local pure TypeScript only — no Astro UI, DOM, browser API, desktop import, or shared-doc registration.

Tasks:
- Add `landing/src/lib/liveDemo.ts` with `LiveDemoProfile`, `LiveDemoOutcome`, `LiveDemoState`, `LiveDemoEvent`, the deterministic initial state, `reduceLiveDemo`, and `deriveLiveDemoView` exactly as defined by the plan. Keep the assigned profile and effective local identity fixed to Client.
- Implement the full transition contract: Personal/Work derive blocked; Client derives ready; wrong `attempt-commit` reveals blockers; `apply-profile-fix` selects Client and clears them; a ready `attempt-commit` completes the simulation; every profile selection clears stale attempt/completion state; reset returns Personal + idle. Use no timer, random value, DOM, storage, fetch, or side effect.
- Extend `landing/src/content/copy.ts` with one `liveDemo` object containing the section, scenario, mock-window, controls, accessibility, no-JS, and completion strings. Add provenance comments beside literals copied from the app.
- Pin these exact literals without paraphrase or punctuation normalization: `Guard · Ready`; `Guard · Blocked`; `The active profile does not match this repository’s assigned profile.`; `Your Git author name does not match the active profile.`; `Your Git author email does not match the active profile.`; `Switch to "Client"`; `Fixing…`; and `Commit Changes`.
- Add `landing/src/lib/liveDemo.test.ts` covering the initial state, all profiles, wrong attempt, exact copy strings, quick fix, direct Client selection, safe completion, profile change after completion, repeated actions, and reset.
- Add a focused source-boundary assertion proving the landing demo model imports nothing from the repo-root `src/`, Electron, preload, or IPC. Approved string duplication is allowed; executable desktop/core sharing is not.
- Do not create `LiveDemo.astro`, edit page order/styles, add a client script/dependency, or repeat the feature registration in this phase.

Exit: from `landing/`, `npm run check`, `npm run typecheck`, `npm test`, and `npm run lint` are green; every reducer transition and exact copied string is covered; the source-boundary assertion is green.

Then run the standard progress footer.
```

---

## Phase 109 — App-faithful Live Demo UI and landing integration (Astro + e2e) — feature-complete stop point

```
Work on Phase 109 of GitWarden (docs/plans/landing-live-demo-plan.md §"Phase 109 — App-faithful Live Demo UI and landing integration (Astro + e2e)"). Astro + landing e2e; feature-complete stop point. Begin only after Phase 108's progress-log gate is ✅.

Tasks:
- Add `landing/src/components/LiveDemo.astro` with a labelled `#live-demo` section and an app-faithful mock GitWarden window using the existing `/favicon.svg`. Recreate only the required header/repo/branch/Guard/profile chrome, compact Commit-selected sidebar, assigned-profile context, staged change/message, safety area, Commit action, and Reset.
- Render a useful server-side initial frame: `northwind-portal`, assigned/effective identity Client, branch `main`, Personal active, and `Guard · Blocked`. Add a concise `<noscript>` explanation while keeping all download paths and the anchor usable without JavaScript.
- Progressively attach native button/radio-group behavior with the Phase 108 reducer. Provide programmatic selected state, visible focus, a polite live region for profile/Guard changes, `role="alert"` only for revealed blockers, an explicit simulated-completion status, and predictable Reset focus.
- Keep the initial unsafe `Commit Changes` operable as the narrative attempt trigger. Under Personal or Work it reveals all three exact blocker rows plus `Switch to "Client"`, then adopts the real disabled Commit styling. The quick fix selects Client, clears the alert, flips `Guard · Ready`, and enables Commit. A second Commit reports simulation completion without a hash or claim that Git changed.
- Import and render `LiveDemo` between `DownloadHero` and `WhyGitWarden` in `landing/src/pages/index.astro`. Add `Try the live demo ↓` below the hero download/version area in `DownloadHero.astro`, outside `data-gw-cta`, so release self-healing cannot remove it and Download remains primary.
- Extend `landing/src/styles/global.css` with exact missing dark/light app tokens and scoped `.live-demo-*` styles matching the current header, Commit surface, Guard badge, issue rows, remediation, typography, and spacing. Do not create a separate palette.
- At `max-width: 640px`, collapse nonessential chrome and stack the same interaction with 44px touch targets, readable warnings, and no horizontal overflow. Never autoplay. Under reduced motion, remove decorative transitions without changing immediate state behavior.
- Keep the client code component-scoped and small: only landing-local imports, one attachment, no new dependency, fetch, storage, analytics, backend, or leaked global listener.
- Add `landing/tests/e2e/live-demo.spec.ts` for exact section order/anchor, unchanged primary download, all profile/Guard states, wrong Commit + exact blockers, one-click fix, ready completion, Reset, keyboard/focus/live-region/alert semantics, no-JS fallback, light/dark states, reduced motion, and the simplified 375px layout.
- Update `landing/tests/e2e/marketing.spec.ts` so the section inventory includes `live-demo`. Keep the existing home axe smoke green.
- Inspect built assets and prove no `src/core`, `src/renderer`, Electron, preload, IPC, or desktop implementation path ships. Confirm no runtime dependency was added and the landing's Lighthouse ≥95 mobile targets are not regressed.

Exit: from `landing/`, `npm run check`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, and `npm run e2e` are green; the full wrong-profile → blocked → one-click fix → ready → simulated-complete loop passes on desktop and 375px; axe has no critical/serious WCAG A/AA findings; download/fallback behavior is unchanged; built output contains no desktop/core implementation.

Then run the standard progress footer.
```
