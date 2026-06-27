---
status: accepted
date: 2026-06-23
phase: Phase 0
source: docs/plans/gitwarden-plan.md §7.2
---

# 0002 — SSH model: GitWarden does not manage SSH keys (MVP)

## Status

Accepted (Phase 0).

## Context

Key management (creation, import, rotation, storage) is high-risk and would dramatically enlarge the
app's blast radius. The safety value GitWarden offers is **visibility** into which identity/key a
push will use — not control over keys.

## Decision

- **The app does NOT manage SSH keys in MVP.** It relies on the user's existing `~/.ssh/config`,
  `ssh-agent` (macOS/Linux), or the **Windows OpenSSH agent**. No key creation, import, or rotation.
- **`sshKeyAlias` mapping:** a profile's `sshKeyAlias` maps to an **existing** ssh `Host` alias /
  `IdentityFile` entry in the user's ssh config. The app _surfaces which_ alias/key a push will use;
  it does not write or modify ssh config.
- **Env forwarded to git/ssh:** `GitRunner` forwards only what git/ssh need — `HOME` (macOS/Linux) /
  `USERPROFILE` (Windows), `PATH`, and `SSH_AUTH_SOCK` (macOS/Linux agent socket).
- **Windows agent:** Windows OpenSSH uses a **named-pipe** agent (not `SSH_AUTH_SOCK`); the
  requirement is that `ssh` is on `PATH` so git can find it. Documented as a setup precondition.

## Consequences

- Reusing the OS/ssh-agent infrastructure keeps the blast radius small and avoids storing private
  keys.
- The safety value is visibility ("you're about to push with the Work key"), not control — so the app
  reads and displays, never mutates.
- Minimal env reduces the chance of leaking host state into git and keeps behavior reproducible.
- The named-pipe agent needs no socket env var, but git-over-ssh on Windows only works if `ssh.exe`
  is resolvable — so we document that instead of forwarding a socket that doesn't exist there.
