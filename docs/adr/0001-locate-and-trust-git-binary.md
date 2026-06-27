---
status: accepted
date: 2026-06-23
phase: Phase 0
source: docs/plans/gitwarden-plan.md §7.1
---

# 0001 — Locating & trusting the `git` binary

## Status

Accepted (Phase 0).

## Context

GitWarden shells out to a real `git` binary for every operation. GUI-launched apps on macOS
frequently start with a minimal `PATH` that omits Homebrew, so `git` may not be discoverable the way
it is in a login shell. We need a deterministic, trustworthy way to locate and validate `git` before
any repo operation — and a non-silent failure mode when it is missing.

## Decision

- **Resolution order:** user-configured path (Settings) → `PATH` lookup (`which git` on macOS/Linux,
  `where git` on Windows) → known common locations.
- **Common-location fallbacks:**
  - macOS: `/opt/homebrew/bin/git`, `/usr/local/bin/git`, `/usr/bin/git`.
  - Linux: `/usr/bin/git`, `/usr/local/bin/git`.
  - Windows: `C:\Program Files\Git\cmd\git.exe`, `C:\Program Files (x86)\Git\cmd\git.exe`.
- **Verification:** a resolved binary is trusted only after `git --version` succeeds and parses as a
  git version.
- **First-run "git not found" UX:** if no candidate verifies, show a **blocking** first-run screen
  with per-OS install guidance (macOS: Xcode CLT / Homebrew; Linux: distro package manager; Windows:
  Git for Windows) plus a "Locate git manually…" file picker and a "Re-check" button. Never fail
  silently or degrade to a half-working state.

## Consequences

- An explicit user override always wins; `PATH` covers the common case; fixed fallbacks rescue
  GUI-launched apps that don't inherit the login shell's `PATH`.
- The version check confirms the path is a real, runnable git — not a stale or wrong executable —
  before any repo operation.
- `git` is a hard dependency, so the user must resolve it explicitly and the app must make the fix
  obvious and self-service.
