---
status: accepted
date: 2026-06-30
phase: Phase 66 (Guard Quick-Fix)
amends: 0002
source: docs/plans/guard-quick-fix-plan.md §"Phase 66 — SSH Transport Binding"
---

# 0009 — SSH transport binding: bind a repo's remote to the profile's declared ssh alias

## Status

Accepted (Phase 66, Guard Quick-Fix). **Amends** ADR 0002 — narrows its "surface, never act"
stance for one specific, bounded action. Every other part of 0002 still stands.

## Context

ADR 0002 set an SSH model of **"visibility, not control":** GitWarden surfaces _which_ key/alias a
push will use but never manages keys, never writes or parses `~/.ssh/config`, and sets no
`GIT_SSH_COMMAND`. That left a gap: when a repo's assigned profile uses SSH, the profile does **not**
actually govern which key authenticates — key selection is whatever the ambient ssh-agent / OS
client resolves for the remote host. So a wrong profile can **silently push under a different
account's key** (the failure mode that motivated Guard Quick-Fix), and Phase 65's
`switch-profile-and-retry-push` cannot change the SSH identity on retry (it only swaps the HTTPS
token). Meanwhile `sshKeyAlias` — a profile's declared ssh `Host` alias (per ADR 0002) — is stored
but **unused**.

## Decision

- GitWarden MAY rewrite a repository's **`--local` git remote host** to the assigned profile's
  declared `sshKeyAlias`, e.g. `git@github.com:owner/repo.git` → `git@<alias>:owner/repo.git`
  (owner/repo path preserved; host only). This makes the profile's declared transport identity
  **actual** — key choice is still resolved by the user's own ssh config entry for that alias.
- This is a **git-config (`--local`) change** — the same scope GitWarden already writes for
  `user.name`/`user.email`. It is **not** ssh-config management.
- The binding is **scoped**: only when the assigned profile's `authenticationMethod === 'ssh'` AND
  `sshKeyAlias` is set AND the origin is an SSH GitHub remote. HTTPS remotes and token-auth profiles
  are untouched (they keep the existing per-push token path). On unassign / switch to a profile
  without an ssh alias, the canonical host is restored.

## What still holds from 0002 (unchanged)

- GitWarden still does **not** create, import, or rotate SSH keys.
- It still **never writes or parses `~/.ssh/config`** — it uses only the alias string the user typed
  into the profile; key resolution stays entirely in the user's ssh config + agent.
- It still sets **no `GIT_SSH_COMMAND`** and forwards only `HOME`/`PATH`/`SSH_AUTH_SOCK`.
- If the alias is absent from the user's ssh config, GitWarden does not detect it (no config
  parsing) — the push fails **loudly** (`Could not resolve hostname <alias>`), which is preferable to
  a silent wrong-key push and is diagnosed by the Phase 64 error mapper.

## Consequences

- The assigned profile finally governs the SSH key (via the user's own alias), closing the
  silent-wrong-key gap and making `switch-profile-and-retry-push` correct on SSH remotes.
- The binding is **visible** in `git remote -v` (consistent with 0002's "visibility" value) and is
  reversible.
- spec §AC-08/AC-12 gains a one-line note: the app still parses only the host from the remote URL and
  resolves no key live, but it **may** set the remote host to the profile's declared alias.
