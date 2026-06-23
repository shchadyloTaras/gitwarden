# SECURITY.md — GitWarden

Threat model and enforceable security rules. Source: `docs/gitwarden-plan.md` §7.4.
These rules are **non-negotiable** and apply everywhere; review every PR against them.

## Threat model

Opening a repository can **execute code**. Git hooks (`.git/hooks/*`) and certain config
keys (e.g. `core.fsmonitor`, `core.pager`, alias expansions) run external programs as a
side effect of ordinary git commands. Therefore **every repo path and every repo's
contents are untrusted input**, even on the user's own machine.

## Enforceable rules

1. **`execFile` + args array, never a shell.**
   Run git only via `child_process.execFile` with an **arguments array**. Never `exec`,
   never `sh -c`, never string interpolation or shell concatenation. Path arguments go
   after `--` to prevent option injection. `GitRunner` is the **only** caller of `execFile`.

2. **Canonicalize & validate every repo path.**
   Resolve the real path (follow symlinks), reject paths containing `..` traversal, and
   require a genuine `.git` (directory or gitfile) before treating a path as a repo.
   Untrusted paths never reach git unvalidated.

3. **Controlled git environment.**
   `GitRunner` sets a fixed env for every invocation:
   - `GIT_CONFIG_NOSYSTEM=1` — ignore system-level git config.
   - `GIT_TERMINAL_PROMPT=0` — never block on an interactive credential prompt.
   - `GIT_OPTIONAL_LOCKS=0` — for read-only ops, avoid taking optional locks.
   - `LC_ALL=C` — stable, parseable, locale-independent output.
     Only the minimal env git/ssh need is forwarded (`HOME`/`USERPROFILE`, `PATH`,
     `SSH_AUTH_SOCK`); nothing else from the host environment leaks through.

4. **Locked-down renderer.**
   The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and
   `sandbox: true`. The renderer has **no Node access**; it reaches main only through the
   typed preload bridge.

5. **Zod-validated IPC.**
   Every IPC payload crossing the preload bridge (both directions) is validated with Zod
   at the boundary. Malformed or unexpected payloads are rejected, not coerced.

6. **No secret logging.**
   Never log tokens, secrets, or credential material. `Logger` redacts known-sensitive
   fields; when in doubt, omit. Secrets never appear in logs, error messages, or telemetry.

7. **Hooks risk acknowledged (not sanitized in MVP).**
   GitWarden does **not** sanitize or sandbox git hooks in the MVP. This residual risk is
   accepted and documented here. Mitigation: all **destructive and remote actions stay
   behind explicit confirmation**, and irreversible actions (e.g. `git clean`) get a
   distinct, stronger warning. A future phase may add hook detection/disabling.
