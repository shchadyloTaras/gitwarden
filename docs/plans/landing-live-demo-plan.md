# Plan — Landing Live Demo: let visitors experience the Guard aha moment

**Status:** ✅ complete — Phases 108–109 — **derived view**; the
authoritative state is the Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 108 → 109.
**Feature-complete stop point:** Phase 109.
**Prompts:** [`docs/prompts/landing-live-demo-prompts.md`](../prompts/landing-live-demo-prompts.md).

## Goal

The landing page explains that GitWarden blocks wrong-identity commits, but visitors cannot feel
that protection before downloading the app. This feature adds a compact, app-faithful live demo
directly below the hero: a Client repository starts under the wrong active profile, the header
Guard changes as the visitor selects Personal / Work / Client, an unsafe commit attempt reveals
the real blocking messages, and `Switch to "Client"` makes the check pass in one click.

**Product boundary (decided — scripted public simulation):** the demo is a deterministic landing-
only state machine and presentation. It never runs Git, calls a backend, reads a local repository,
persists profile data, or imports any desktop-app/core module into the public bundle. It copies the
current app's approved warning labels verbatim into landing copy, with source-provenance comments,
but ships none of the closed-source Safety Engine.

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **The home page has one exact second-section insertion seam.** `index.astro` renders
   `DownloadHero` first and `WhyGitWarden` immediately after it
   ([index.astro:57-67](../../landing/src/pages/index.astro)). **Consequence:** add `LiveDemo`
   between those two components so it is structurally the second section, not merely moved there
   with CSS.

2. **The hero already has a clear primary/secondary CTA hierarchy.** The OS-aware download lives
   inside `.cta`, with a separate version line below it
   ([DownloadHero.astro:19-50](../../landing/src/components/DownloadHero.astro)); the client script
   replaces only the contents of the `data-gw-cta` container when release data changes
   ([DownloadHero.astro:81-110](../../landing/src/components/DownloadHero.astro)). **Consequence:**
   place `Try the live demo ↓` outside `data-gw-cta`, below the download/version area, so download
   remains the primary action and release self-healing cannot remove the anchor.

3. **The landing is a static, isolated Astro app with no React runtime.** Astro emits static output
   and wires only Tailwind plus the changelog plugin
   ([astro.config.mjs:40-55](../../landing/astro.config.mjs)); the landing package has no React
   dependency and already supports Vitest and Playwright
   ([package.json:9-41](../../landing/package.json)). **Consequence:** implement the demo as an
   `.astro` component plus a small vanilla-TypeScript client script and a pure landing-local model;
   do not add a UI framework or desktop-app dependency.

4. **Landing copy and client enhancement already have canonical homes.** Every visible string is
   required to live in `landing/src/content/copy.ts`
   ([copy.ts:1-10](../../landing/src/content/copy.ts)), while `DownloadHero.astro` demonstrates a
   progressively enhanced typed client script that leaves useful server-rendered HTML behind
   ([DownloadHero.astro:52-121](../../landing/src/components/DownloadHero.astro)). **Consequence:**
   add one `copy.liveDemo` object, keep the state reducer string-free, and render a truthful static
   initial frame before JavaScript attaches.

5. **The exact safety and remediation strings are already authoritative in the app.** The primary
   mismatch and its related name/email blockers are:
   `The active profile does not match this repository’s assigned profile.`,
   `Your Git author name does not match the active profile.`, and
   `Your Git author email does not match the active profile.`
   ([safetyMessages.ts:31-45](../../src/core/safety/safetyMessages.ts)). Guard labels are
   `Guard · Ready` / `Guard · Blocked`
   ([strings.ts:24-33](../../src/renderer/strings.ts)), and the app's executable fix label is
   `Switch to "<profile>"`
   ([strings.ts:601-611](../../src/renderer/strings.ts)). **Consequence:** copy these literals
   verbatim into `copy.liveDemo`; do not paraphrase them and do not import their source modules.

6. **One-click profile switching is a real, bounded remediation.** `PROFILE_MISMATCH` maps to the
   existing `switch-active-profile` action
   ([safetyCopilotMessages.ts:70-94](../../src/core/ai/safetyCopilotMessages.ts)); its executor writes
   only the assigned profile id to app settings
   ([remediationExecutor.ts:75-90](../../src/main/ipc/remediationExecutor.ts)). The actual safety
   check compares repository assignment and effective name/email with the active profile
   ([SafetyCheckService.ts:74-103](../../src/core/safety/SafetyCheckService.ts)). **Consequence:**
   the scenario fixes the effective identity as Client and varies only the active profile: Personal
   and Work produce the three real blockers; switching to Client resolves all three without
   pretending to rewrite Git config.

7. **The real app supplies concrete visual contracts for the mock window.** The header uses a
   48px surface bar, current typography, border, and spacing
   ([GlobalHeader.tsx:149-165](../../src/renderer/components/GlobalHeader.tsx)); its green/red Guard
   mapping and badge geometry are explicit
   ([GlobalHeader.tsx:15-34](../../src/renderer/components/GlobalHeader.tsx),
   [GlobalHeader.tsx:305-353](../../src/renderer/components/GlobalHeader.tsx)). The Commit screen's
   blocker stack uses danger background/border/text tokens
   ([CommitScreen.tsx:240-318](../../src/renderer/screens/CommitScreen.tsx)), and its disabled/ready
   commit button is defined separately
   ([CommitScreen.tsx:348-380](../../src/renderer/screens/CommitScreen.tsx)). **Consequence:**
   reproduce those proportions, labels, tokens, and states instead of inventing a generic browser
   card that only loosely resembles GitWarden.

8. **The one-click fix has an existing presentation contract.** Executable remediations use a
   primary button with a 4px radius and 14px text
   ([RemediationButton.tsx:37-60](../../src/renderer/components/RemediationButton.tsx)); the assigned
   profile is resolved into the switch label
   ([RemediationButton.tsx:156-185](../../src/renderer/components/RemediationButton.tsx)).
   **Consequence:** the mock's `Switch to "Client"` action matches the real component rather than
   becoming a marketing-style CTA.

9. **The landing palette intentionally mirrors the app but currently exposes only a subset.** The
   landing's dark/light `--color-gw-*` tokens are derived from the app
   ([global.css:3-61](../../landing/src/styles/global.css)), while the app defines the missing
   success, danger, warning, disabled, and surface-3 values in both themes
   ([theme.css:3-49](../../src/renderer/theme.css),
   [theme.css:51-97](../../src/renderer/theme.css)). **Consequence:** extend landing-local demo
   tokens with the exact app values needed by the mock; keep them scoped and avoid a second color
   system.

10. **Reduced motion and responsive behavior are already gates.** The layout enables reveal motion
    only when the visitor has not requested reduced motion
    ([Base.astro:69-79](../../landing/src/layouts/Base.astro)); global CSS disables animation and
    transitions for reduced-motion visitors and already has a 640px mobile seam
    ([global.css:622-706](../../landing/src/styles/global.css)). **Consequence:** mobile keeps the
    same interaction in a simplified, stacked shell with no autoplay, and all decorative state
    transitions disappear under `prefers-reduced-motion: reduce`.

11. **The landing test harness already covers the relevant quality gates offline.** Playwright
    builds from fixture release data and serves static output
    ([playwright.config.ts:3-21](../../landing/playwright.config.ts)); current coverage includes a
    no-JavaScript route, an axe WCAG A/AA smoke, theme persistence, and 375px overflow detection
    ([home.spec.ts:55-107](../../landing/tests/e2e/home.spec.ts),
    [marketing.spec.ts:55-88](../../landing/tests/e2e/marketing.spec.ts)). **Consequence:** add
    deterministic reducer tests and a focused live-demo e2e spec; do not introduce network,
    timing-dependent autoplay, or screenshot-only assertions.

12. **The Screenshots section establishes the required fidelity bar with real app captures.** It
    imports optimized dark Status and light Repositories images and renders both with accessible
    alternative text
    ([Screenshots.astro:1-25](../../landing/src/components/Screenshots.astro)). **Consequence:** the
    demo is not a replacement for those captures; it must visually agree with the current app while
    the later Screenshots section continues to prove the full desktop product.

## Scope

- **In:**
  - A `#live-demo` section rendered second, immediately below the hero.
  - A secondary `Try the live demo ↓` hero anchor below the download CTA; download remains primary.
  - A deterministic, landing-only Personal / Work / Client state model with reset, unsafe-attempt,
    quick-fix, ready, and simulated-success states.
  - A compact dark-first GitWarden window matching the real header, navigation, Commit screen,
    Guard badge, blocker stack, remediation button, disabled button, typography, and tokens.
  - A fixed scenario: `northwind-portal`, assigned profile Client, effective local identity Client,
    branch `main`, one staged file, and a prefilled commit message.
  - Exact app strings for `Guard · Ready`, `Guard · Blocked`, the three identity blockers,
    `Switch to "Client"`, `Fixing…`, and `Commit Changes`, copied into landing content with provenance.
  - A simplified but fully interactive mobile layout: nonessential chrome collapses, while profile
    selection, Guard, commit attempt, blocking messages, quick fix, completion, and reset remain.
  - Server-rendered initial context plus a no-JavaScript explanation; no-JS never affects download.
  - Keyboard, screen-reader, reduced-motion, light/dark, responsive, offline, and bundle-boundary
    verification.
- **Out / Non-goals:**
  - Importing `src/core`, `src/renderer`, Electron, preload, IPC, or any app service into landing.
  - Running Git, opening a repository, reading browser files, authenticating, calling an API, or
    persisting the selected profile.
  - Reusing or exposing the Safety Engine implementation; the demo contains only fixed scenario
    transitions and copied public strings.
  - Changing desktop-app behavior, warnings, remediation logic, screenshots, or tests.
  - A backend, telemetry event schema, lead form, account flow, video/GIF, or autoplay carousel.
  - Reordering any section other than inserting Live Demo between Hero and Why GitWarden.

## Landing-local demo contract

```ts
export type LiveDemoProfile = 'Personal' | 'Work' | 'Client'
export type LiveDemoOutcome = 'idle' | 'blocked' | 'ready' | 'complete'

export interface LiveDemoState {
  activeProfile: LiveDemoProfile
  outcome: LiveDemoOutcome
}

export type LiveDemoEvent =
  | { type: 'select-profile'; profile: LiveDemoProfile }
  | { type: 'attempt-commit' }
  | { type: 'apply-profile-fix' }
  | { type: 'reset' }

export function reduceLiveDemo(state: LiveDemoState, event: LiveDemoEvent): LiveDemoState
export function deriveLiveDemoView(state: LiveDemoState): {
  guard: 'ready' | 'blocked'
  issuesVisible: boolean
  canCommit: boolean
}
```

The initial state is Personal + idle. The Guard is already red because the active profile does not
match the Client context, but the issue stack stays hidden until `attempt-commit` so the demo has a
clear cause-and-effect reveal. That first click is deliberately a narrative attempt trigger; once
the blockers appear, the Commit button adopts the real disabled styling. Selecting Client directly
or applying the one-click fix produces `Guard · Ready` and an enabled Commit button. A subsequent
safe commit changes only the simulation to `complete`; it never calls Git. Any profile selection
clears the prior attempt/completion so the next result cannot be stale. Reset returns exactly to the
initial Personal + idle frame.

The reducer contains no display strings, timers, DOM access, storage, network access, imports from
outside `landing/`, or random values. The Astro component maps the derived view to `copy.liveDemo`.

## Phase 108 — Scripted demo model and copy contract (landing-local pure TypeScript)

**Goal:** define and prove the entire fixed scenario without UI, browser APIs, desktop imports, or
timing.

**Implementation:**

- Add [`landing/src/lib/liveDemo.ts`](../../landing/src/lib/liveDemo.ts) with the types, initial
  state, reducer, and derived view above. Keep the assigned profile and effective identity fixed to
  Client; Personal and Work are unsafe, Client is ready.
- Model the exact transition contract: wrong-profile selection flips the Guard immediately;
  `attempt-commit` reveals blockers; `apply-profile-fix` selects Client and clears them; a safe
  `attempt-commit` completes the demo; profile changes clear stale outcomes; reset is deterministic.
- Extend [`landing/src/content/copy.ts`](../../landing/src/content/copy.ts) with all section,
  scenario, mock-window, control, accessibility, no-JS, and completion copy. Add source-provenance
  comments beside copied app strings. Pin the three blocker strings and remediation label exactly;
  do not normalize curly apostrophes or quote characters.
- Add [`landing/src/lib/liveDemo.test.ts`](../../landing/src/lib/liveDemo.test.ts) covering the
  initial state, all three profiles, wrong commit attempt, exact blocker-copy literals, quick fix,
  direct Client selection, safe completion, profile change after completion, repeated actions, and
  reset.
- Add an explicit source-boundary test or lint assertion proving the reducer/component contract has
  no import path into `../../src`, Electron, preload, or IPC. The public demo may duplicate approved
  literals; it may not share executable app code.
- Do not add an Astro component, page insertion, styles, client DOM script, dependency, or shared-
  doc registration in this phase.

**Exit criteria:** from `landing/`, `npm run check`, `npm run typecheck`, `npm test`, and
`npm run lint` are green; reducer coverage proves every event/profile outcome; exact copied strings
match the verified app literals; the boundary assertion proves no desktop/core import is reachable
from the demo model.

**Files:** new `landing/src/lib/liveDemo.ts`; new `landing/src/lib/liveDemo.test.ts`; edit
`landing/src/content/copy.ts`.

---

## Phase 109 — App-faithful Live Demo UI and landing integration (Astro + e2e) — feature-complete stop point

**Goal:** make the Guard aha moment visible, responsive, and accessible directly below the hero
without weakening download, performance, privacy, or the closed-source boundary.

**Implementation:**

- Add [`landing/src/components/LiveDemo.astro`](../../landing/src/components/LiveDemo.astro) with a
  labelled `#live-demo` section, concise benefit-led intro, and a high-fidelity mock GitWarden
  window. Use `/favicon.svg` for the existing mark; recreate only the chrome needed for this flow:
  header/repo/branch/Guard/profile, compact sidebar with Commit selected, assigned-profile context,
  staged change/message, safety area, Commit button, and Reset.
- Keep the server-rendered initial frame useful: it names the Client assignment and Personal active
  profile and shows `Guard · Blocked`. JavaScript progressively attaches native button behavior.
  A `<noscript>` explanation says the interaction needs JavaScript while leaving the scenario and
  every download path readable.
- Use a radio-group or equivalent native-button contract for Personal / Work / Client with a
  programmatic selected state, a polite live region for Guard/profile changes, `role="alert"` only
  when blockers are revealed, and a completion status that explicitly says this was a simulation.
  Reset must have an accessible name and return focus predictably.
- Make the unsafe Commit button initially operable as the decided narrative trigger. After it is
  pressed under Personal or Work, show all three verified blocker rows, show
  `Switch to "Client"`, and apply the real disabled Commit styling. The quick fix selects Client,
  removes the alert, flips the Guard green, and enables Commit. A subsequent Commit reports the
  simulated completion; it does not fabricate a hash or imply a real repository changed.
- Add the component between `DownloadHero` and `WhyGitWarden` in
  [`landing/src/pages/index.astro`](../../landing/src/pages/index.astro). Add the secondary
  `Try the live demo ↓` anchor in
  [`landing/src/components/DownloadHero.astro`](../../landing/src/components/DownloadHero.astro)
  outside the mutable `data-gw-cta` node, preserving release-error and OS-detection behavior.
- Extend [`landing/src/styles/global.css`](../../landing/src/styles/global.css) with the exact
  missing app tokens and scoped `.live-demo-*` styles. Desktop should read as the current app at a
  glance: 48px header, dark-first shell, surface divisions, selected Commit nav, danger issue rows,
  primary remediation, and correct green/red Guard. Light theme must use the app's light token
  values rather than CSS filters.
- At `max-width: 640px`, remove nonessential mock chrome and stack the context, profile controls,
  issue rows, and action area without changing the state contract. Keep minimum 44px touch targets,
  no horizontal scrolling, no clipped warning text, and no autoplay. Under reduced motion, remove
  state/reveal animation while preserving immediate state changes.
- Keep the client code small and local: import only `landing/src/lib/liveDemo.ts` and landing copy,
  use event delegation within the component root, and attach once. Add no dependency, fetch,
  storage write, analytics event, or global listener that survives the component.
- Add [`landing/tests/e2e/live-demo.spec.ts`](../../landing/tests/e2e/live-demo.spec.ts) covering:
  exact section order and hero anchor; download CTA still primary/functional; Personal/Work/Client
  Guard changes; wrong Commit reveals the exact three messages; quick fix selects Client and makes
  Commit pass; safe completion and Reset; keyboard operation/focus; live-region and alert semantics;
  no-JS static fallback; dark/light token states; reduced motion; and the simplified 375px layout
  with no overflow or hidden controls.
- Update [`landing/tests/e2e/marketing.spec.ts`](../../landing/tests/e2e/marketing.spec.ts) so its
  section inventory includes `live-demo`. Keep the existing axe smoke green and extend its settling
  condition only if the new section introduces a deterministic initial enhancement frame.
- Run a built-output boundary check: no emitted landing asset may contain an import/module path for
  `src/core`, `src/renderer`, Electron, preload, or IPC. Confirm no new runtime dependency and no
  regression to the landing plan's Lighthouse ≥ 95 mobile targets.

**Exit criteria:** from `landing/`, `npm run check`, `npm run typecheck`, `npm test`,
`npm run lint`, `npm run build`, and `npm run e2e` are green; the focused e2e spec proves the full
wrong-profile → blocked → one-click fix → ready → simulated-complete loop on desktop and the
simplified interaction at 375px; axe reports no critical/serious WCAG A/AA issues; download and
release fallback behavior remains unchanged; built output contains no desktop/core implementation.

**Files:** new `landing/src/components/LiveDemo.astro`; new
`landing/tests/e2e/live-demo.spec.ts`; edit `landing/src/pages/index.astro`,
`landing/src/components/DownloadHero.astro`, `landing/src/styles/global.css`, and
`landing/tests/e2e/marketing.spec.ts`.

## Acceptance criteria (feature)

1. `#live-demo` is the second home-page section, directly after Hero and before Why GitWarden.
2. `Try the live demo ↓` appears below the download area and scrolls to `#live-demo`; OS-specific
   download, secondary installer, version, and release-error states remain the primary CTA flow.
3. The mock names `northwind-portal` as assigned to Client, shows effective Client identity context,
   starts with Personal active, and renders `Guard · Blocked` before any attempt.
4. Selecting Personal or Work keeps the Guard red; selecting Client flips it to
   `Guard · Ready`; returning to a wrong profile flips it back and clears stale outcomes.
5. Pressing Commit under Personal or Work reveals all three verified app blocker strings verbatim,
   exposes `Switch to "Client"`, and gives the Commit button the real disabled visual state.
6. One click on `Switch to "Client"` selects Client, clears the alert, turns the Guard green, and
   makes Commit pass without changing Git config or contacting any service.
7. Pressing Commit in the ready state shows a clearly labelled simulated completion, never a fake
   network/Git result; Reset restores the initial Personal + blocked frame.
8. The desktop demo matches the current GitWarden header, Commit surface, badge, issue rows,
   remediation, spacing, typography, and dark/light tokens closely enough to sit beside the real
   Screenshots section without looking like a separate product.
9. At 375px the demo remains interactive but removes nonessential chrome, keeps every warning and
   control readable/tappable, and introduces no horizontal overflow. It never autoplays.
10. Every control is keyboard reachable and visibly focused; selected profile state, Guard changes,
    blockers, completion, and reset are announced with correct radio/button/live-region/alert
    semantics. Reduced-motion visitors receive no decorative motion.
11. With JavaScript disabled, the fixed scenario and a concise explanation remain visible, the hero
    anchor still reaches the section, and all download paths remain functional.
12. All user-facing strings live in `copy.ts`; tests run offline; no new dependency, backend,
    storage, telemetry, desktop-app change, or emitted import of closed-source app/core code exists.

## Decisions (resolved)

- **Slug / numbering:** `landing-live-demo`, Phases 108–109, feature-complete at 109.
- **Placement:** second section directly below Hero; Why GitWarden and every later section retain
  their relative order.
- **CTA hierarchy:** Download remains primary; `Try the live demo ↓` is a quiet secondary anchor
  below it and outside the release island's mutable container.
- **Scenario:** `northwind-portal` is assigned to Client and already has Client local identity;
  Personal is the initial active profile, so switching to Client resolves the real mismatch set.
- **Interaction:** profile controls update the Guard immediately; the first unsafe Commit click is a
  deliberate narrative attempt that reveals the blockers and then adopts the real disabled state.
- **Quick fix:** use the real `Switch to "Client"` remediation label and clear all three identity
  blockers because the effective local identity is already Client.
- **Public-code boundary:** copied literals plus a landing-local deterministic reducer only. No
  Safety Engine, app component, IPC type, or runtime service ships in the site bundle.
- **Visual fidelity:** current app source/tokens are the contract; the existing screenshots remain
  separate evidence of the full product.
- **Mobile:** simplified interaction, not autoplay. The complete scenario remains user-controlled
  and accessible; only nonessential app chrome collapses.
- **Motion:** no timer-driven scenario on any viewport; reduced-motion disables decorative
  transitions without changing state behavior.
- **Persistence / privacy:** Reset is local in-memory state. No storage, network, telemetry, or PII.

## Open questions (resolve at kickoff)

None.
