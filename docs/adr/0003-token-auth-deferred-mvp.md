---
status: superseded
superseded-by: 0004
date: 2026-06-23
phase: Phase 0
source: docs/plans/gitwarden-plan.md §7.3
---

# 0003 — Token auth deferred (MVP)

## Status

**Superseded by [0004 — GitHub OAuth via Device Flow](0004-github-oauth-device-flow.md).**

The MVP shipped (Phases 0–20) with token auth deferred exactly as recorded below. The GitHub OAuth
feature reverses this; the new decision is ADR 0004. The original text is kept for history.

## Context

In the MVP, GitWarden surfaced identity safety for **SSH** pushes. A full HTTPS-token credential path
would have been a large, security-sensitive addition. Shipping a half-built token path risked a
deceptive UX where safety checks pass but the push silently does nothing.

## Decision (historical)

- **Token auth is model-only in MVP.** `AuthenticationMethod` includes `token`, but the profile UI
  offers **SSH only**; `token` exists in the type system but has no UI and no push path.
- **`SecretStore` ships but is not wired into push.** The Electron `safeStorage`-backed store exists,
  but MVP push never reads a token from it.

## Consequences

- Keeps the type model complete and future-proof without shipping a half-built credential path.
- Avoids a deceptive path that passes safety checks yet silently does nothing — no partially-built
  auth in production.
- **Reversed in Phase 21+:** see [ADR 0004](0004-github-oauth-device-flow.md), which brings token
  auth into scope via the OAuth Device Authorization Flow and activates `SecretStore` as a real
  `TokenStore`.
