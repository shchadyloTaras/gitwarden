---
status: accepted
supersedes: 0003
date: 2026-06-24
phase: Phase 21+
source: docs/plans/github-oauth-plan.md §1, §1.1, Appendix B–D
---

# 0004 — GitHub OAuth via Device Flow (token auth now in scope)

## Status

Accepted (Phase 21+). **Supersedes [0003 — Token auth deferred](0003-token-auth-deferred-mvp.md).**

## Context

Wrong-account prevention is GitWarden's reason to exist. Matching the remote **host string** is a
weak guarantee — it cannot tell that the _account_ behind a push is the intended one. A token bound
to a concrete `@login` is far stronger. A desktop binary, however, cannot keep a client secret, so
the auth mechanism must not require one.

## Decision

- **OAuth sign-in is in scope.** GitWarden adds **"Connect GitHub"** via the OAuth **Device
  Authorization Flow** (the mechanism the `gh` CLI uses for desktop sign-in). One click links a
  profile to a real GitHub account, auto-fills its identity, and lets the Safety Engine verify the
  _account_ behind a push — not just the remote host string.
- **Device Flow, not Authorization Code.** Device Flow needs only a **public `client_id`** — **no
  client secret, no redirect/custom-protocol handler**. Any flow requiring a client secret is
  rejected.
- **Additive to SSH, not a replacement.** A profile may be SSH-only, OAuth-linked, or both. Existing
  SSH profiles and codes (`REMOTE_HOST_MISMATCH`, …) are untouched.
- **`SecretStore` is now activated** (Phase 22) as a `TokenStore` keyed by `profileId`. Tokens live
  **only** there (Electron `safeStorage`), never in a model, never in the renderer — see SECURITY.md
  §8–9.
- **Revocation is best-effort by design.** Device Flow has no client secret, so GitWarden **cannot**
  call GitHub's token-revoke endpoint. **Disconnect** deletes the local token and opens GitHub's
  app-connections page so the user can revoke there (Appendix C).

## Consequences

- A token bound to a concrete `@login` is a far stronger guarantee than host matching.
- Nothing secret is embedded in the shipped binary; the `client_id` is public and fine to commit
  (`src/core/config/github.ts`).
- OAuth strengthens the push gate without breaking the SSH path that already works.
- Reverses "ships but unwired" — the encrypted store now backs a real, audited credential path.
- The revocation limitation is surfaced honestly to the user rather than faked as a silent
  half-revoke.
