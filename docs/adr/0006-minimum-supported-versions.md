---
status: accepted
date: 2026-06-23
phase: Phase 0
source: docs/plans/gitwarden-plan.md §7 (Minimum supported versions)
---

# 0006 — Minimum supported versions

## Status

Accepted (Phase 0).

## Context

The app needs a stable floor for the runtime APIs it depends on (`child_process`/`fs`), the renderer
security lockdown the threat model requires, and git's porcelain/config surface the Safety Engine
parses.

## Decision

- **Node.js:** ≥ 20 LTS.
- **Electron:** ≥ 30.
- **git:** ≥ 2.30 (resolved at runtime, not bundled).

## Consequences

- **Node ≥ 20 LTS** matches the Node bundled by current Electron and provides a stable, supported
  `child_process`/`fs` API surface.
- **Electron ≥ 30** is recent enough to default-enable the renderer lockdown the threat model requires
  (`sandbox: true`, `contextIsolation`) and to ship current Chromium security fixes.
- **git ≥ 2.30** is a baseline with stable porcelain v2 status output and the config/env flags the
  Safety Engine relies on.
