---
slug: gitwarden
date: 2026-07-14
triage: no-spec
acs: []
commit: a2e696f630ee18813cccb919fc32b12bdddd0853
recurrence_of: none
---

# Fix: Landing Live Demo did not look like the real GitWarden app

## Symptom

Opening the landing Live Demo was expected to show the current GitWarden desktop interface, but it showed an invented two-pane marketing mock with an abbreviated sidebar, a context grid, and a separate Safety Check panel. The defect affected every visitor since Phase 109.

## Root cause

`landing/src/components/LiveDemo.astro` reproduced the scenario state transitions but invented a presentation layer instead of mirroring the titlebar, header, full grouped sidebar, vertical Commit screen, and right Context panel composed by `src/renderer/App.tsx`. The Phase 109 e2e coverage asserted interaction and responsive behavior but had no structural contract for the real desktop shell; its Guard color assertion also pinned the translucent issue-row token instead of the real solid header-badge token.

## The pinning test

Playwright e2e: `mirrors the real GitWarden shell instead of inventing demo-only app chrome` in `landing/tests/e2e/live-demo.spec.ts`.

GOOD RED failure before the fix:

> Locator: getByTestId('live-demo-window').getByTestId('live-demo-titlebar') — Expected: visible — element(s) not found

The test now pins both 48px bars, the complete grouped navigation inventory, three-pane geometry, Commit/Context containment, external demo controls, and removal of the invented context and Safety Check panels.

## Spec patch

No SDD spec to patch — `docs/features/gitwarden/spec.md` does not own the landing site. The existing Phase 109 visual-fidelity contract in `docs/plans/landing-live-demo-plan.md` acceptance criterion 8 was correct and is now re-verified; a broad brownfield survey is not required because the repository already has an architecture map and the fix stays inside the registered landing track.

## Follow-ups

- If the desktop shell composition changes materially, update the landing-local structural reproduction and its e2e inventory in the same change; never import `src/renderer` or `src/core` into the public landing bundle.
