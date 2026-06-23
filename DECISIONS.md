# DECISIONS.md — GitWarden

Phase 0 foundational decisions. Each item is a binding decision with a one-line rationale.
Source: `docs/gitwarden-plan.md` §7.

## 1. Locating & trusting the `git` binary (§7.1)

- **Resolution order:** user-configured path (Settings) → `PATH` lookup (`which git` on macOS/Linux, `where git` on Windows) → known common locations.
  - *Rationale:* an explicit user override always wins; `PATH` covers the common case; fixed fallbacks rescue GUI-launched apps that don't inherit the login shell's `PATH`.
- **Common-location fallbacks:**
  - macOS: `/opt/homebrew/bin/git`, `/usr/local/bin/git`, `/usr/bin/git`.
  - Linux: `/usr/bin/git`, `/usr/local/bin/git`.
  - Windows: `C:\Program Files\Git\cmd\git.exe`, `C:\Program Files (x86)\Git\cmd\git.exe`.
  - *Rationale:* GUI apps on macOS frequently launch with a minimal `PATH` that omits Homebrew; these paths cover the dominant install methods per OS.
- **Verification:** a resolved binary is trusted only after `git --version` succeeds and parses as a git version.
  - *Rationale:* confirms the path is a real, runnable git — not a stale or wrong executable — before any repo operation.
- **First-run "git not found" UX:** if no candidate verifies, show a **blocking** first-run screen with per-OS install guidance (macOS: Xcode CLT / Homebrew; Linux: distro package manager; Windows: Git for Windows) plus a "Locate git manually…" file picker and a "Re-check" button. Never fail silently or degrade to a half-working state.
  - *Rationale:* git is a hard dependency; the user must resolve it explicitly, and the app must make the fix obvious and self-service.

## 2. SSH model (§7.2)

- **The app does NOT manage SSH keys in MVP.** It relies on the user's existing `~/.ssh/config`, `ssh-agent` (macOS/Linux), or **Windows OpenSSH agent**. No key creation, import, or rotation.
  - *Rationale:* key management is high-risk and out of scope; reusing the OS/ssh-agent infrastructure keeps the app's blast radius small and avoids storing private keys.
- **`sshKeyAlias` mapping:** a profile's `sshKeyAlias` maps to an **existing** ssh `Host` alias / `IdentityFile` entry in the user's ssh config. The app *surfaces which* alias/key a push will use; it does not write or modify ssh config.
  - *Rationale:* the safety value is visibility ("you're about to push with the Work key"), not control — so the app reads and displays, never mutates.
- **Env forwarded to git/ssh:** `GitRunner` forwards only what git/ssh need — `HOME` (macOS/Linux) / `USERPROFILE` (Windows), `PATH`, and `SSH_AUTH_SOCK` (macOS/Linux agent socket).
  - *Rationale:* minimal env reduces the chance of leaking host state into git and keeps behavior reproducible.
- **Windows agent:** Windows OpenSSH uses a **named-pipe** agent (not `SSH_AUTH_SOCK`); the requirement is that `ssh` is on `PATH` so git can find it. Documented as a setup precondition.
  - *Rationale:* the named-pipe agent needs no socket env var, but git-over-ssh on Windows only works if `ssh.exe` is resolvable — so we document that instead of forwarding a socket that doesn't exist there.

## 3. Token auth deferred (§7.3)

- **Token auth is model-only in MVP.** `AuthenticationMethod` includes `token`, but the profile UI offers **SSH only**; `token` exists in the type system but has no UI and no push path.
  - *Rationale:* keeps the type model complete and future-proof without shipping a half-built credential path.
- **`SecretStore` ships but is not wired into push.** The Electron `safeStorage`-backed store exists, but MVP push never reads a token from it.
  - *Rationale:* avoids a deceptive path that passes safety checks yet silently does nothing — no partially-built auth in production.

## 4. Concurrency & cancellation (§7.5)

- **Long ops are cancellable:** clone/fetch/pull/push keep their `ChildProcess` handle; cancel calls `kill()`; progress is surfaced from stderr.
  - *Rationale:* network ops can hang or run long; the user must be able to abort, and stderr is git's real-time progress channel.
- **Per-repo serialization:** mutating git ops are serialized per canonical repo path (one in-flight mutation per repo at a time).
  - *Rationale:* concurrent mutations collide on git's index lock (`index.lock`); serializing avoids corrupt/failed operations. Read-only ops across different repos may still run in parallel.

## 5. Minimum supported versions

- **Node.js:** ≥ 20 LTS — *Rationale:* matches the Node bundled by current Electron and provides a stable, supported `child_process`/`fs` API surface.
- **Electron:** ≥ 30 — *Rationale:* recent enough to default-enable the renderer lockdown the threat model requires (`sandbox: true`, `contextIsolation`) and to ship current Chromium security fixes.
- **git:** ≥ 2.30 (resolved at runtime, not bundled) — *Rationale:* a baseline with stable porcelain v2 status output and the config/env flags the Safety Engine relies on.
