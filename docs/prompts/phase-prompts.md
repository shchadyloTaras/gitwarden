# GitWarden — Phase Prompts

Copy-paste prompts to drive development one phase at a time. Each prompt is self-contained, points at the plan, and **ends with a progress block** that appends an entry to `CLAUDE.md`.

**How to use:** run prompts in order (0 → 18). Don't start a phase until the previous phase's entry in `docs/progress-log.md` shows Exit criteria ✅. References: full plan in `docs/plans/gitwarden-plan.md`, rules in `CLAUDE.md` / `AGENTS.md`.

---

## 🔁 Standard progress footer (included in every prompt)

Every prompt below ends with this block. It is the mechanism that records progress:

```
When the phase's Exit criteria are met:
1. Append an entry to the "## Progress Log" section of docs/progress-log.md (newest last, do not rewrite past entries):
   ### <today's date> — Phase N: <name>
   - Built: <what was implemented>
   - Files: <files added/changed>
   - Tests: <exact vitest/playwright result, e.g. "12 passed">
   - Exit criteria: ✅ met  (or ⚠️ partial — explain what's left)
   - Notes / follow-ups: <anything worth knowing for next phase>
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md.
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 0 — Foundations & Decisions

```
Work on Phase 0 of GitWarden (see docs/plans/gitwarden-plan.md §7). No app code yet — produce two docs at the repo root: DECISIONS.md and SECURITY.md.

In DECISIONS.md record, with a one-line rationale each:
- git binary location strategy across macOS/Linux/Windows + the first-run "git not found" UX (plan §7.1).
- SSH model: app does NOT manage keys in MVP; relies on existing ssh-agent / ssh config; how sshKeyAlias maps; env forwarded to git/ssh incl. Windows OpenSSH agent (plan §7.2).
- Token auth deferred — model-only, SSH-only in profile UI (plan §7.3).
- Concurrency/cancellation: cancellable long ops, per-repo serialization (plan §7.5).
- Minimum supported versions (Node, Electron).

In SECURITY.md write the enforceable threat-model rules from plan §7.4 (execFile + args array, no shell; path canonicalization/validation; controlled git env; sandboxed renderer; Zod-validated IPC; no secret logging; hooks risk acknowledged).

Then run the standard progress footer.
```

---

## Phase 1 — Repo & Toolchain Scaffold

```
Work on Phase 1 (plan §13 Phase 1). Scaffold a runnable Electron + React (Vite) + TypeScript (strict) skeleton with the test harness wired.

Tasks:
- Init package.json (npm or pnpm), TS strict config, ESLint + Prettier.
- Electron main process + preload + Vite React renderer; window opens to an empty shell.
- Configure Vitest (unit/integration) and Playwright (Electron driver, headless).
- Create the folder structure from plan Appendix F (electron/, preload/, src/core/, src/main/{services,git,storage}, src/renderer/, tests/{unit,integration,e2e}).
- Add scripts: dev, test, e2e, lint, build.

Exit criteria: `npm run dev` opens a window; one trivial Vitest test passes; one Playwright test confirming the window opens passes.

Then run the standard progress footer.
```

---

## Phase 2 — Core Types & Domain Models

```
Work on Phase 2 (plan §10, §13 Phase 2). In src/core/ (PURE — no node/electron/DOM imports), create types.ts with all domain models exactly as in plan §10 (Profile, RepositoryRecord, FileChange with indexStatus/worktreeStatus, ChangeKind, GitStatus, GitBranch, GitCommit, GitRemote, EffectiveGitIdentity, SafetyIssue/Severity, SafetyCheckResult, AppSettings with AppearanceMode, GitCommandError/GitErrorCode). Add Zod schemas for the persisted types (Profile, RepositoryRecord, AppSettings).

Exit criteria: types compile under strict TS; Vitest round-trip parse/serialize tests pass for Profile, RepositoryRecord, AppSettings.

Then run the standard progress footer.
```

---

## Phase 3 — Git Execution Core (GitRunner)

```
Work on Phase 3 (plan §13 Phase 3, Appendix A, Appendix D). Build safe git execution.

Tasks (in src/main/git/):
- GitLocator: resolve git across macOS/Linux/Windows (custom path → PATH → common locations), verify with `git --version`.
- PathValidator (src/core/ if pure, else src/main): canonicalize, resolve symlinks, reject `..`, require a real `.git`.
- GitRunner: the ONLY child_process.execFile caller. Args array, controlled env (Appendix A table), AbortSignal cancellation (kill child on abort), per-cwd serialization of mutating ops, concurrent stdout/stderr capture.
- ErrorMapper: stderr/exit code → typed GitCommandError (Appendix B / §10).

Exit criteria: an integration test runs a real git command in a temp repo created in the test; PathValidator tests + ErrorMapper tests pass; aborting a long-running invocation kills the process (tested).

Then run the standard progress footer.
```

---

## Phase 4 — Porcelain Parser & Status

```
Work on Phase 4 (plan §13 Phase 4, Appendix C). In src/core/parsers/, implement the porcelain v2 parser for `git status --porcelain=v2 -z --branch` → GitStatus, per Appendix C (XY codes → indexStatus/worktreeStatus, branch header, rename extra NUL field, conflicts, untracked). Then wire GitService.getStatus on top of GitRunner.

Exit criteria: PorcelainParser unit tests cover — a file staged AND further modified (X≠. and Y≠.), a rename, an untracked file, a conflict, and a path with spaces/unicode — against captured fixtures; getStatus integration test passes on a temp repo with mixed changes.

Then run the standard progress footer.
```

---

## Phase 5 — Safety Engine (crown jewel)

```
Work on Phase 5 (plan §12, §13 Phase 5). This is the core value — make it fully tested.

Tasks:
- GitService.getEffectiveIdentity via `git config --show-origin --get user.name/user.email`, mapping origin → scope (local/global/system).
- SafetyCheckService in src/core/ as PURE synchronous functions: checkCommit, checkPush, checkRepositoryIdentity (plan §12), producing SafetyIssue codes (PROFILE_MISMATCH, EMAIL_MISMATCH, EMAIL_FROM_GLOBAL_ONLY, IDENTITY_UNSET, REMOTE_HOST_MISMATCH, NO_REMOTE, NOTHING_STAGED, EMPTY_MESSAGE, HAS_CONFLICTS, etc.). Each code → a message string.

Exit criteria: SafetyCheckService unit tests cover the FULL matrix — profile match/mismatch, email match/mismatch, identity unset, email-from-global-only, remote-host match/mismatch, nothing staged, conflicts. Every branch of the engine is exercised and green.

Then run the standard progress footer.
```

---

## Phase 6 — Storage Layer

```
Work on Phase 6 (plan §13 Phase 6). In src/main/storage/: JsonStore (atomic writes to app.getPath('userData'), Zod-validated on read) and SecretStore (Electron safeStorage wrapper; token path stubbed for MVP). Wire ProfileService, RepositoryService, SettingsService on top.

Exit criteria: data persists across app relaunch; an atomic-write test proves no corruption on an interrupted/partial write; Zod rejects malformed stored JSON (tested).

Then run the standard progress footer.
```

---

## Phase 7 — IPC Bridge & Preload

```
Work on Phase 7 (plan §13 Phase 7, Appendix D). Build the typed, validated IPC layer.

Tasks:
- preload contextBridge exposing a typed API to the renderer (no raw ipcRenderer, no Node).
- Map service methods to IPC channels; validate every payload (both directions) with Zod.
- Enforce BrowserWindow security: contextIsolation: true, nodeIntegration: false, sandbox: true.

Exit criteria: a renderer call round-trips to a main service and back, fully type-checked; an invalid IPC payload is rejected by Zod (tested); security flags asserted in a test.

Then run the standard progress footer.
```

---

## Phase 8 — App Shell & Navigation (UI)

```
Work on Phase 8 (plan §13 Phase 8). Build the React shell: sidebar navigation, main content area, right inspector, and a global header showing active profile / active repo / current branch / safety badge (from a store, seeded for now). Add placeholder screens for each section.

Exit criteria: Playwright navigates between all screens; the global header renders state from a seeded store.

Then run the standard progress footer.
```

---

## Phase 9 — Profile Management

```
Work on Phase 9 (plan §13 Phase 9). Profiles UI + store on top of ProfileService: list, create, edit, delete, set active. Form fields: displayName, gitAuthorName, gitAuthorEmail, githubUsername, SSH-only auth (token disabled), sshKeyAlias, expectedRemoteHosts.

Exit criteria: Playwright creates 3 profiles (Personal/Work/Client), edits one, deletes one, sets an active profile; selections survive an app relaunch.

Then run the standard progress footer.
```

---

## Phase 10 — Repository Management

```
Work on Phase 10 (plan §13 Phase 10). Repositories UI: add existing repo via native dialog + validate (GitService.validateRepository), clone from URL (cancellable + progress), assign/change profile, list repos, remove-from-app (NOT delete from disk), warn when a repo's profile ≠ active profile.

Exit criteria: Playwright adds a repo (use a local temp git repo as fixture), assigns a profile, and removes it; the profile-mismatch warning appears when active ≠ assigned.

Then run the standard progress footer.
```

---

## Phase 11 — Status & Staging UI

```
Work on Phase 11 (plan §13 Phase 11). Render GitStatus: derive staged / unstaged / untracked views by filtering files (do not bucket). Actions: stage one, unstage one, stage all, unstage all.

Exit criteria: Playwright on a fixture repo stages and unstages a file; a file that is simultaneously staged AND further modified appears correctly on both the staged and unstaged sides.

Then run the standard progress footer.
```

---

## Phase 12 — Diff Viewer

```
Work on Phase 12 (plan §13 Phase 12). Implement GitService.getDiff (worktree and --staged). UI: show the selected file's diff with a staged/unstaged toggle; empty state when nothing is selected.

Exit criteria: Playwright shows a diff for both staged and unstaged changes on a fixture repo; empty state renders when no file is selected.

Then run the standard progress footer.
```

---

## Phase 13 — Commit Flow

```
Work on Phase 13 (plan §13 Phase 13). Commit UI: message field + staged-changes summary. Run SafetyCheckService.checkCommit and block on blockers (show warnings). Add a "Set this repo's local Git identity to the active profile" action (GitService.setLocalIdentity — --local only, NEVER --global). Then commit.

Exit criteria: Playwright on a fixture repo — commit is blocked on an identity/profile mismatch; the "set local identity" action unblocks it; a successful commit creates a real commit whose author matches the active profile (assert via `git log` in the fixture).

Then run the standard progress footer.
```

---

## Phase 14 — Remote Operations (Fetch / Pull / Push)

```
Work on Phase 14 (plan §13 Phase 14). Implement fetch / pull / push (cancellable, with progress). Build the push confirmation sheet showing: repo name, local path, current branch, remote name, remote URL + parsed host, active profile + email, repo's assigned profile, auth method, and the full SafetyCheckService.checkPush result (blockers + warnings). Block push on blockers; require explicit confirmation. Map auth-failure stderr to a clear message.

Exit criteria: Playwright — push is blocked on a profile/host mismatch and succeeds only after explicit confirmation. Use a LOCAL BARE repo as the "remote" so the e2e push runs fully offline; assert the bare repo received the commit.

Then run the standard progress footer.
```

---

## Phase 15 — Branches

```
Work on Phase 15 (plan §13 Phase 15). Branches UI: list local + remote branches, show current; switch, create, delete a local branch (delete behind confirmation).

Exit criteria: Playwright on a fixture repo switches, creates, and deletes a branch; the global header updates to the current branch after a switch.

Then run the standard progress footer.
```

---

## Phase 16 — History

```
Work on Phase 16 (plan §13 Phase 16). Implement GitService.getCommitHistory with NUL-delimited `git log` (Appendix B) and limit + skip. UI: commit list (short hash, message, author name/email, date) with "load more".

Exit criteria: Playwright renders history on a fixture repo with several commits; "load more" pages additional commits without duplicates.

Then run the standard progress footer.
```

---

## Phase 17 — Safety Center

```
Work on Phase 17 (plan §13 Phase 17, §14). Aggregate commit + push + repository-identity checks for the active repo. Display: active profile, repo's assigned profile, effective user.name/user.email AND their source scope, remote URL/host, current branch, auth method, can-commit, can-push, blockers, warnings. Use the example messages from plan §14.

Exit criteria: Playwright — the Safety Center's verdicts match what the commit and push gates decide for the same fixture repo state.

Then run the standard progress footer.
```

---

## Phase 18 — Settings, Polish & Hardening

```
Work on Phase 18 (plan §13 Phase 18, Appendix D). Settings screen (appearance tri-state, custom git path, default folders). Add empty/loading/error states across screens; technical-error disclosure hidden by default; keyboard shortcuts; dark mode. Give irreversible discards (git clean on untracked files) a distinct, stronger warning vs reverting tracked edits. Do an i18n pass (externalize ALL user-facing strings incl. safety messages). Run the final security review against SECURITY.md / Appendix D checklist.

Exit criteria: every screen has empty/loading/error states; irreversible actions warn distinctly; the security checklist passes; strings are externalized; full `npm test` and `npm run e2e` are green (and on the CI matrix mac/linux/win if configured).

Then run the standard progress footer.
```
