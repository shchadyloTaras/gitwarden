# GitWarden — Cross-Platform App Implementation Plan

> Stack decision: **Electron + TypeScript + React (Vite)**, chosen so the whole app — core logic, git wrapper, and UI — is verifiable locally and headlessly (Vitest + Playwright), and runs on macOS, Linux, and Windows. This supersedes the earlier macOS/SwiftUI plan.

## 0. How to Read This Plan

Organized as a sequence of **phases**. Each phase has a Goal, Tasks, Deliverables, and an explicit **Exit criteria** gate (which always includes the tests that must pass). Do not start a phase until the previous one's exit criteria are met.

Phase order:

- **Phase 0 — Foundations & Decisions** (resolve before coding)
- **Phase 1 — Repo & Toolchain Scaffold**
- **Phase 2 — Core Types & Domain Models**
- **Phase 3 — Git Execution Core (`GitRunner`)**
- **Phase 4 — Porcelain Parser & Status**
- **Phase 5 — Safety Engine** (the crown jewel — fully unit-tested)
- **Phase 6 — Storage Layer**
- **Phase 7 — IPC Bridge & Preload**
- **Phase 8 — App Shell & Navigation (UI)**
- **Phase 9 — Profile Management**
- **Phase 10 — Repository Management**
- **Phase 11 — Status & Staging UI**
- **Phase 12 — Diff Viewer**
- **Phase 13 — Commit Flow**
- **Phase 14 — Remote Operations (Fetch / Pull / Push)**
- **Phase 15 — Branches**
- **Phase 16 — History**
- **Phase 17 — Safety Center**
- **Phase 18 — Settings, Polish & Hardening**

Sections 1–4 are context. Sections 5+ are the technical plan. Appendices A–F are build-ready references (git commands, `GitRunner` contract, parser spec, security model, conventions, first step).

**Verifiability principle:** all business logic lives in framework-free TypeScript that runs under Node with no Electron and no browser. The UI is a standard React app drivable by Playwright against headless Chromium. This is what lets the agent run and check the program without a human at the screen.

---

## 1. Product Summary

**GitWarden** is a cross-platform desktop Git GUI client focused on **safe multi-account GitHub usage**.

It does **not** aim to replace GitKraken, GitHub Desktop, Sourcetree, Fork, or Tower. Its purpose: help a user safely manage multiple GitHub identities locally and prevent committing or pushing with the wrong account, author name, email, SSH key, or repository profile.

Original product name, design, UX copy, screen structure, and visual style.

---

## 2. Core Problem

The user has multiple GitHub accounts (Personal, Work, Client) and wants to avoid:

- pushing to a repo with the wrong account;
- commits with the wrong author name/email;
- mixing personal/work/client repos;
- using the wrong SSH key or auth method;
- pushing from a repo assigned to another profile.

> **Key insight (drives the design):** the dangerous mismatch is not only the _commit email_. It is **author identity** (name/email written into the commit) **plus** **transport identity** (which SSH key / credential actually authenticates the push). A user can have the right email and still push with the wrong key. The Safety Engine reasons about **both**.

---

## 3. Main Product Goal

A simple cross-platform Git GUI that lets the user do daily Git work without the terminal while always making the active identity clear, and surfaces identity safety before commit / fetch / pull / push / clone / repo setup / branch switching.

---

## 4. Target Platforms

- macOS, Linux, Windows (Electron ships all three).
- Develop and verify primarily on the dev machine (macOS/Linux); CI matrix covers all three.

---

## 5. Tech Stack

| Layer              | Choice                             | Notes                                            |
| ------------------ | ---------------------------------- | ------------------------------------------------ |
| Desktop shell      | **Electron** (latest LTS)          | one window, main + renderer processes            |
| Language           | **TypeScript** (strict)            | one language across core, git, main, renderer    |
| UI                 | **React + Vite**                   | fast HMR; renderer is plain Chromium             |
| State              | Zustand (or React context)         | lightweight; ViewModels = hooks/stores           |
| Git access         | Node `child_process.execFile`      | **never** `exec`/shell; args as array            |
| Validation         | Zod                                | runtime validation of stored JSON & IPC payloads |
| Non-secret storage | JSON in `app.getPath('userData')`  | profiles, repos, settings                        |
| Secret storage     | Electron `safeStorage` (OS-backed) | tokens (deferred); never plaintext               |
| Unit tests         | **Vitest**                         | core + git wrapper + parsers                     |
| E2E / UI tests     | **Playwright** (Electron driver)   | drives the real app headlessly                   |
| Lint/format        | ESLint + Prettier                  | enforced in CI                                   |
| Packaging          | electron-builder                   | dmg / AppImage+deb / nsis                        |

Do **not** use a shell to run git, do **not** interpolate user input into command strings, do **not** store secrets in plaintext.

---

## 6. Architecture

```text
renderer/ (React UI, Chromium)
  │  typed IPC (contextBridge, no nodeIntegration)
  ▼
preload/ (safe API surface)
  │
main/ (Electron main process)
  ├── services/  ProfileService, RepositoryService, SettingsService, GitService, SafetyCheckService
  ├── git/       GitRunner (execFile wrapper), GitLocator, PorcelainParser, ErrorMapper
  ├── core/      pure types + Safety Engine (NO Node/Electron imports)
  └── storage/   JsonStore, SecretStore
        ▼
   system git binary → local repository
```

Hard rules:

- **`core/` is pure** — no `child_process`, no `fs`, no Electron, no DOM. Safety logic and parsers live here so they run under plain Vitest. This is the verifiability backbone.
- All git execution goes through `GitRunner` (the only `execFile` caller).
- Renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. It talks to main only through the typed preload bridge.
- Every service has an interface and is injected, so tests mock them.

---

## 7. Phase 0 — Foundations & Decisions

> Blocking decisions; produce `DECISIONS.md` + `SECURITY.md`, not app code.

### 7.1 Locating & trusting the `git` binary (cross-platform)

- Resolve git: user-configured path (Settings) → `PATH` lookup (`which git` / `where git`) → common locations (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `C:\Program Files\Git\cmd\git.exe`).
- Verify with `git --version`. If none found, show a blocking first-run screen with install guidance per OS. Never fail silently.

### 7.2 SSH model (cross-platform)

- The app does **not** manage keys in MVP. It relies on the user's existing `~/.ssh/config` + `ssh-agent` (macOS/Linux) or **Windows OpenSSH agent**.
- A profile's `sshKeyAlias` maps to an existing ssh host alias / `IdentityFile`. The app surfaces _which_ key/alias a push will use; it does not create or rotate keys.
- `GitRunner` forwards only the env git/ssh need (`HOME`/`USERPROFILE`, `PATH`, `SSH_AUTH_SOCK`). Windows uses named-pipe agent — document that ssh must be on `PATH`.

### 7.3 Token auth deferred

- `AuthenticationMethod` includes `token`, but token auth is **deferred**. MVP profile UI offers SSH only; `token` is model-only. `SecretStore` ships (Electron `safeStorage`) but isn't wired into push in MVP — no half-built path that passes safety checks yet does nothing.

### 7.4 Security threat model (write once, enforce everywhere)

Opening a repo can **execute code** (git hooks, config like `core.fsmonitor`). Treat every repo path as untrusted input.

- Run git only via `execFile` with an **args array**; never `exec`, never `sh -c`, never string interpolation.
- Canonicalize & validate every repo path (resolve symlinks, reject `..`, require a real `.git`).
- Controlled env: `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0` (read-only), `LC_ALL=C`.
- Renderer locked down (`contextIsolation`, no `nodeIntegration`, `sandbox: true`); IPC payloads validated with Zod.
- Never log tokens/secrets; `Logger` redacts.
- Hooks are not sanitized in MVP, but the risk is documented and destructive/remote actions stay behind confirmation.

### 7.5 Concurrency & cancellation

- Long ops (clone/fetch/pull/push) are cancellable: keep the `ChildProcess` handle, `kill()` on cancel, surface progress from stderr.
- Serialize mutating git ops per repo path (git index lock).

### Phase 0 Exit criteria

- [ ] `git` location + missing-git UX designed (all 3 OSes).
- [ ] SSH model + env-forwarding documented (incl. Windows agent).
- [ ] Token-deferred decision recorded.
- [ ] `SECURITY.md` written.
- [ ] Concurrency/cancellation rules documented.

---

## 8. Core Product Concept

Built around **profiles** (local Git identities: Personal, Work, Client). Each repo is assigned to exactly one profile. The user always sees: active profile, active repo, current branch, **effective** git author name/email _and where they come from_ (local/global), the repo's assigned profile, and current safety status.

---

## 9. MVP Scope

1. Profile management 2. Repository management 3. Git status 4. Basic file diff 5. Commit flow 6. Fetch/Pull/Push 7. Branches 8. Simple history 9. Safety Center 10. Local storage 11. Safe git execution 12. Human-friendly errors.

**Non-goals (v2+):** merge conflict editor, interactive rebase, cherry-pick, stash UI, PR management, Issues, CI dashboard, complex commit graph, team/cloud sync, AI review, plugins, token auth (deferred).

---

## 10. Domain Models (`core/types.ts`)

All are plain TS types validated by Zod schemas at storage/IPC boundaries.

```ts
export type AuthenticationMethod = 'ssh' | 'token' // token model-only in MVP

export interface Profile {
  id: string // uuid
  displayName: string
  gitAuthorName: string
  gitAuthorEmail: string
  githubUsername: string
  authenticationMethod: AuthenticationMethod
  sshKeyAlias?: string // maps to existing ssh config host/IdentityFile
  expectedRemoteHosts: string[] // e.g. ["github.com-personal"] — Safety Engine input
  defaultProjectsFolder?: string
  notes?: string
}

export interface RepositoryRecord {
  id: string
  name: string
  localPath: string
  remoteUrl?: string
  assignedProfileId?: string
  lastOpenedAt?: string // ISO
  isFavorite: boolean
  notes?: string
}

// File status: git reports a two-char XY code (X = staged side, Y = worktree side).
// A file can be staged AND further modified at once — model both sides.
export type ChangeKind =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'

export interface FileChange {
  path: string // natural, stable key
  originalPath?: string // renames/copies
  indexStatus: ChangeKind // X
  worktreeStatus: ChangeKind // Y
}

export interface GitStatus {
  files: FileChange[]
  branch?: string
  upstream?: string
  ahead: number
  behind: number
}

export interface GitBranch {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream?: string
}
export interface GitCommit {
  fullHash: string
  shortHash: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}
export interface GitRemote {
  name: string
  url: string
  host?: string
}

export type GitConfigScope = 'local' | 'global' | 'system'
export interface EffectiveGitIdentity {
  userName?: string
  userEmail?: string
  nameSource?: GitConfigScope
  emailSource?: GitConfigScope
}

export type Severity = 'warning' | 'blocker'
export interface SafetyIssue {
  code: string
  message: string
  severity: Severity
}
export interface SafetyCheckResult {
  canCommit: boolean
  canPush: boolean
  issues: SafetyIssue[]
}

export type AppearanceMode = 'system' | 'light' | 'dark'
export interface AppSettings {
  activeProfileId?: string
  lastOpenedRepositoryId?: string
  appearance: AppearanceMode
  customGitPath?: string
}

export type GitErrorCode =
  | 'notARepository'
  | 'authenticationFailed'
  | 'remoteNotFound'
  | 'branchNotFound'
  | 'mergeConflict'
  | 'nothingToCommit'
  | 'networkError'
  | 'gitNotFound'
  | 'unknown'
export interface GitCommandError {
  code: GitErrorCode
  userMessage: string
  technicalDetails: string
  exitCode?: number
}
```

---

## 11. Services (interfaces; see Appendix A for `GitRunner`)

- **`GitRunner`** — only `execFile` caller; one invocation → `{ stdout, stderr, code }`; controlled env; cancellable; per-path serialization.
- **`GitService`** — high-level ops on top of `GitRunner`; parses output into models.
- **`ProfileService` / `RepositoryService` / `SettingsService`** — persistence + active selection.
- **`SafetyCheckService`** — **pure, synchronous** functions in `core/`.
- **`SecretStore`** — Electron `safeStorage` wrapper (token path stubbed for MVP).
- **`ErrorMapper`** — stderr/exit code → `GitCommandError`.
- **`GitLocator` / `PathValidator`** — find git; canonicalize/validate paths.

```ts
export interface GitService {
  validateRepository(repoPath: string): Promise<boolean>
  getStatus(repoPath: string): Promise<GitStatus>
  getDiff(repoPath: string, filePath: string, staged: boolean): Promise<string>
  stageFile(repoPath: string, filePath: string): Promise<void>
  unstageFile(repoPath: string, filePath: string): Promise<void>
  stageAll(repoPath: string): Promise<void>
  unstageAll(repoPath: string): Promise<void>
  discard(repoPath: string, change: FileChange): Promise<void>
  commit(repoPath: string, message: string): Promise<void>
  fetch(repoPath: string, signal?: AbortSignal): Promise<void>
  pull(repoPath: string, signal?: AbortSignal): Promise<void>
  push(repoPath: string, signal?: AbortSignal): Promise<void>
  getCurrentBranch(repoPath: string): Promise<string>
  getBranches(repoPath: string): Promise<GitBranch[]>
  switchBranch(repoPath: string, name: string): Promise<void>
  createBranch(repoPath: string, name: string): Promise<void>
  deleteBranch(repoPath: string, name: string): Promise<void>
  getRemotes(repoPath: string): Promise<GitRemote[]>
  getCommitHistory(repoPath: string, limit: number, skip: number): Promise<GitCommit[]>
  getEffectiveIdentity(repoPath: string): Promise<EffectiveGitIdentity>
  setLocalIdentity(repoPath: string, name: string, email: string): Promise<void>
}

// Pure — no async, no I/O: trivially unit-testable.
export interface SafetyCheckService {
  checkCommit(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    status: GitStatus
    commitMessage: string
  }): SafetyCheckResult
  checkPush(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
    remotes: GitRemote[]
    currentBranch?: string
  }): SafetyCheckResult
  checkRepositoryIdentity(input: {
    repository: RepositoryRecord
    activeProfile?: Profile
    identity: EffectiveGitIdentity
  }): SafetyCheckResult
}
```

---

## 12. Safety Logic

### Before commit

1. active profile exists; 2. repo valid; 3. repo has assigned profile; 4. active == assigned; 5/6. effective name & email set; 7. email == profile email; 8. identity comes from **local** config (warn if global-only); 9. staged changes exist; 10. message valid; 11. no unresolved conflicts. → block on blockers.

### Before push

1–8 as above (identity match); 9. **remote host ∈ profile.expectedRemoteHosts** (`REMOTE_HOST_MISMATCH` — catches "right email, wrong key/account"); 10. auth configured (ssh alias for ssh profiles); 11. current branch & remote exist. → block on blockers.

### Issue codes

`NO_ACTIVE_PROFILE`, `REPO_UNASSIGNED`, `PROFILE_MISMATCH`, `EMAIL_MISMATCH`, `EMAIL_FROM_GLOBAL_ONLY`, `IDENTITY_UNSET`, `REMOTE_HOST_MISMATCH`, `NO_REMOTE`, `NOTHING_STAGED`, `EMPTY_MESSAGE`, `HAS_CONFLICTS`. Each maps to a localized string.

---

## 13. Implementation Phases

> Every phase's Exit criteria include passing tests. The dependency-correct order builds logic-first (testable by the agent) before UI.

### Phase 1 — Repo & Toolchain Scaffold

**Goal:** a running Electron+React+TS skeleton with the test harness wired.
**Tasks:** init pnpm/npm workspace; TS strict config; Electron main + preload + Vite renderer; ESLint/Prettier; Vitest + Playwright configured; folder structure (Appendix); `npm run dev`, `npm test`, `npm run e2e` scripts.
**Exit:** app launches to an empty window; a trivial Vitest test and a trivial Playwright "window opens" test both pass.

### Phase 2 — Core Types & Domain Models

**Goal:** `core/types.ts` + Zod schemas.
**Exit:** types compile; Zod round-trip parse/serialize tests pass for `Profile`, `RepositoryRecord`, `AppSettings`.

### Phase 3 — Git Execution Core (`GitRunner`)

**Goal:** safe, cancellable git execution + locator + path validator + error mapper.
**Tasks:** `GitLocator` (3-OS), `PathValidator`, `GitRunner` (execFile, controlled env, AbortSignal, per-path serialize), `ErrorMapper`.
**Exit:** integration test runs real git in a temp repo; `PathValidatorTests` + `ErrorMapperTests` pass; aborting a long command kills the process.

### Phase 4 — Porcelain Parser & Status

**Goal:** parse `git status --porcelain=v2 -z --branch` → `GitStatus`.
**Exit:** `PorcelainParserTests` cover staged-and-modified, rename, untracked, conflict, and unicode/space paths against captured fixtures; `getStatus` integration test passes on a temp repo.

### Phase 5 — Safety Engine (crown jewel)

**Goal:** pure `SafetyCheckService` (Section 12) + `getEffectiveIdentity` (via `git config --show-origin`).
**Exit:** `SafetyCheckServiceTests` cover the full matrix (profile match/mismatch, email match/mismatch, identity unset, global-only, remote-host mismatch, nothing staged, conflicts). 100% of the engine's branches tested.

### Phase 6 — Storage Layer

**Goal:** `JsonStore` (atomic writes to userData) + `SecretStore` (safeStorage) + Profile/Repository/Settings services.
**Exit:** data persists across relaunch; atomic-write test (no corruption on interrupted write) passes.

### Phase 7 — IPC Bridge & Preload

**Goal:** typed, validated IPC between renderer and main.
**Tasks:** preload `contextBridge` API; Zod-validate every channel payload; map service methods to channels; `contextIsolation`/`sandbox` on.
**Exit:** a renderer call round-trips to a service and back, type-checked; an invalid payload is rejected by Zod (tested).

### Phase 8 — App Shell & Navigation (UI)

**Goal:** sidebar + main content + inspector + global header (active profile/repo/branch/safety badge).
**Exit:** Playwright navigates between all screens; header renders state from a seeded store.

### Phase 9 — Profile Management

**Goal:** list/create/edit/delete profiles, set active, SSH-only auth, `sshKeyAlias` + `expectedRemoteHosts`.
**Exit:** Playwright creates 3 profiles, edits, deletes, sets active; survives relaunch.

### Phase 10 — Repository Management

**Goal:** add existing repo (native dialog), validate, clone (cancellable + progress), assign profile, list, remove-from-app (not disk), mismatch warning.
**Exit:** Playwright adds + assigns + removes a repo (use a local temp git repo as fixture); mismatch warning shows.

### Phase 11 — Status & Staging UI

**Goal:** render `GitStatus`; staged/unstaged/untracked views by filtering; stage/unstage one/all.
**Exit:** Playwright stages and unstages a file in a fixture repo; a staged-and-modified file shows correctly on both sides.

### Phase 12 — Diff Viewer

**Goal:** `git diff` / `git diff --staged`; per-file diff with staged toggle; empty state.
**Exit:** diff renders for staged and unstaged changes (Playwright on fixture repo).

### Phase 13 — Commit Flow

**Goal:** message form + staged summary + `checkCommit` gating + "set local identity to active profile" + commit.
**Exit:** Playwright: commit blocked on mismatch → "set local identity" unblocks → commit creates a real commit with correct author (verified via `git log` in the fixture).

### Phase 14 — Remote Operations

**Goal:** fetch/pull/push (cancellable, progress); push confirmation sheet (repo, path, branch, remote name + **URL/host**, active profile + email, assigned profile, auth method, full safety result); `checkPush` gating; explicit confirm; auth-error mapping.
**Exit:** push blocked on profile/host mismatch; succeeds only after confirm. Use a **local bare repo as the remote** so Playwright e2e push works fully offline; assert the bare repo received the commit.

### Phase 15 — Branches

**Goal:** list local+remote, show current, switch/create/delete (delete confirmed).
**Exit:** Playwright switches/creates/deletes on a fixture repo; header updates.

### Phase 16 — History

**Goal:** `git log` (NUL-delimited) → commits; `limit` + `skip` "load more".
**Exit:** history renders; "load more" pages without duplicates (Playwright).

### Phase 17 — Safety Center

**Goal:** aggregate commit + push + repo-identity checks; show identity + **source scope**, remote URL/host, branch, auth, can-commit/can-push, blockers, warnings.
**Exit:** Safety Center matches what the commit/push gates decide for a fixture repo (Playwright).

### Phase 18 — Settings, Polish & Hardening

**Goal:** settings (appearance tri-state, custom git path, folders); empty/loading/error states; tech-error disclosure (hidden by default); shortcuts; dark mode; **stronger wording for irreversible discards** (`git clean` deletes untracked files permanently — distinct from reverting tracked edits); i18n pass (all strings incl. safety messages); final security review vs `SECURITY.md`.
**Exit:** every screen has empty/loading/error states; irreversible actions warn distinctly; security checklist passes; strings externalized; full `npm test` + `npm run e2e` green on CI matrix (mac/linux/win).

---

## 14. Safety Center — Example Messages

- "This repository is assigned to **Work**, but your active profile is **Personal**."
- "Your Git email does not match the active profile."
- "Your Git identity is inherited from global config, not set for this repository."
- "The remote host doesn't match this profile's expected GitHub account — you may be using the wrong SSH key."
- "Push is blocked until you switch to the correct profile."
- "This repository has no assigned profile."
- "This changes **local** repository Git config only, not global Git config."

---

## 15. MVP Acceptance Criteria

User can: create ≥3 profiles; add a local repo; assign it; always see the active profile; see status (incl. staged-and-modified files); stage/unstage; view staged+unstaged diff; commit only when safety passes; set local identity from active profile; fetch; pull; push only after explicit confirmation; be **blocked** when active profile ≠ repo profile **or remote host ≠ profile**; be **warned** when email mismatches or is global-only; switch/create branches; view history with "load more"; work without the terminal. **Quality gate:** safety engine, parser, path validator, error mapper covered by passing unit tests; core e2e flows covered by Playwright running fully offline against fixture repos.

---

## 16. Future v2 Ideas

Visual commit graph; stash UI; PR support; conflict helper; token/OAuth auth (the deferred path); Issues; Actions status; repo grouping; ssh key setup helper; onboarding; command palette; shortcut customization; export/import profiles; encrypted backup; AI commit messages; auto-update.

---

## 17. Key Principle

Identity safety over advanced Git power. Before every commit/push:

> "Am I doing this with the correct profile, email, repository, branch, remote, **and key/account**?"

If unclear, warn or block.

---

## Appendix A — `GitRunner` Contract

```ts
export interface GitInvocation {
  args: string[] // e.g. ['status', '--porcelain=v2', '-z', '--branch']
  cwd: string // validated repo path
  readOnly: boolean // adds GIT_OPTIONAL_LOCKS=0
  signal?: AbortSignal // cancellation
  timeoutMs?: number // omit for clone/long ops
}
export interface GitResult {
  stdout: Buffer
  stderr: string
  code: number
}

export class GitRunner {
  constructor(private gitPath: string) {}
  // Uses child_process.execFile (NOT exec). Reject on non-zero via ErrorMapper.
  // Serialize mutating invocations per cwd. On abort, kill the child process.
  run(inv: GitInvocation): Promise<GitResult>
}
```

**Env passed to every child (nothing else inherited):**

| Var                    | Value                | Why                        |
| ---------------------- | -------------------- | -------------------------- |
| `HOME` / `USERPROFILE` | user home            | git/ssh find config & keys |
| `PATH`                 | minimal + git dir    | locate `ssh`               |
| `SSH_AUTH_SOCK`        | inherited if present | use ssh-agent (mac/linux)  |
| `GIT_CONFIG_NOSYSTEM`  | `1`                  | ignore system config       |
| `GIT_TERMINAL_PROMPT`  | `0`                  | never block on prompts     |
| `GIT_OPTIONAL_LOCKS`   | `0` (read-only only) | no locks for queries       |
| `LC_ALL`               | `C`                  | stable parseable output    |

Read stdout/stderr concurrently to avoid pipe-buffer deadlock on large output.

---

## Appendix B — Exact Git Command Reference

Run via `GitRunner` (args array, no shell). Path args always after `--`.

| Operation          | Args                                                                           | Read-only | Parse                             |
| ------------------ | ------------------------------------------------------------------------------ | --------- | --------------------------------- |
| Validate repo      | `rev-parse --is-inside-work-tree`                                              | ✓         | exit 0 + `true`                   |
| Status             | `status --porcelain=v2 -z --branch`                                            | ✓         | Appendix C                        |
| Identity + scope   | `config --show-origin --get user.name` / `user.email`                          | ✓         | origin prefix → scope             |
| Diff unstaged      | `diff --no-color -- <path>`                                                    | ✓         | as-is                             |
| Diff staged        | `diff --no-color --staged -- <path>`                                           | ✓         | as-is                             |
| Stage              | `add -- <path>`                                                                |           |                                   |
| Unstage            | `restore --staged -- <path>`                                                   |           | (`reset HEAD --` fallback)        |
| Stage all          | `add -A`                                                                       |           |                                   |
| Unstage all        | `restore --staged -- .`                                                        |           |                                   |
| Discard tracked    | `restore -- <path>`                                                            |           | confirm                           |
| Discard untracked  | `clean -fd -- <path>`                                                          |           | **irreversible — strong warning** |
| Commit             | `commit -m <message>`                                                          |           |                                   |
| Set local identity | `config --local user.name <n>` / `user.email <e>`                              |           | never `--global`                  |
| Current branch     | `rev-parse --abbrev-ref HEAD`                                                  | ✓         | `HEAD` = detached                 |
| List branches      | `branch --all --format=%(refname:short)%00%(HEAD)%00%(upstream:short)`         | ✓         | NUL fields                        |
| Switch             | `switch <branch>`                                                              |           |                                   |
| Create             | `switch -c <branch>`                                                           |           |                                   |
| Delete             | `branch -d <branch>`                                                           |           | `-D` only via force confirm       |
| Remotes            | `remote -v`                                                                    | ✓         | name + url → host                 |
| Fetch              | `fetch --all --prune`                                                          |           | cancellable                       |
| Pull               | `pull --ff-only`                                                               |           | ff-only in MVP                    |
| Push               | `push <remote> <branch>`                                                       |           | cancellable; map auth errors      |
| History            | `log -z --format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s -n <limit> --skip <skip>` | ✓         | NUL fields/records                |
| Clone              | `clone --progress <url> <dest>`                                                |           | progress from stderr; cancellable |

---

## Appendix C — Porcelain v2 Parser Spec

Input: `git status --porcelain=v2 -z --branch` stdout, NUL-separated. Line kinds:

- `# branch.*` → header (oid/head/upstream/ahead-behind).
- `1 <XY> ... <path>` → ordinary change.
- `2 <XY> ... <path>\0<origPath>` → rename/copy (origPath is the **next** NUL field).
- `u <XY> ...` → unmerged (conflict).
- `? <path>` → untracked. `! <path>` → ignored (skip).

Map: `XY` two chars → `indexStatus` (X), `worktreeStatus` (Y); `M→modified A→added D→deleted R→renamed C→copied .→unmodified`; `u`→both `conflicted`; `?`→both `untracked`. For `2` records consume the extra NUL field as `originalPath`.

`PorcelainParserTests` must cover: file staged **and** further modified (X≠. and Y≠.), rename, untracked, conflict, path with spaces/unicode.

---

## Appendix D — Security & Hardening Checklist

- `execFile` only, args array, no shell, no string interpolation. ✓
- Repo paths canonicalized + validated (no `..`, real `.git`). ✓
- Controlled git env (Appendix A). ✓
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; only the typed preload bridge. ✓
- IPC payloads validated with Zod. ✓
- Secrets via `safeStorage`, never plaintext, never logged (Logger redacts). ✓
- Destructive/remote actions behind confirmation; irreversible (`clean`) distinctly warned. ✓
- electron-builder + code signing/notarization for distribution (per-OS, post-MVP for signing).

---

## Appendix E — Conventions & Definition of Done

**Conventions:** TS strict, no `any` in core; React state via hooks/stores (no git calls in components); errors flow as typed `GitCommandError`; all user-facing strings externalized; secrets never logged.

**Definition of Done (per phase):** compiles with no TS/ESLint errors in touched files; Exit criteria met; logic phases ship passing Vitest; UI phases ship passing Playwright; new strings localized; destructive/remote actions confirmed.

**Test layout:**

```
tests/
├── unit/        safety-engine, porcelain-parser, path-validator, error-mapper, zod-roundtrip
├── integration/ git-runner + git-service against temp repos (created in beforeEach)
└── e2e/         Playwright Electron flows against fixture repos (incl. local bare remote)
```

Fixtures create real git repos in a temp dir so all tests run offline and the agent can run them locally.

---

## Appendix F — Where to Start (first development step)

Dependency-driven order: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18.** Logic (2–7) is built and fully tested before any screen, so the agent verifies the engine headlessly first.

First coding session:

1. Write `DECISIONS.md` + `SECURITY.md` (Phase 0).
2. **Phase 1:** scaffold Electron + React + Vite + TS strict; wire Vitest + Playwright; `npm run dev` opens a window; a trivial unit test and a "window opens" Playwright test pass.
3. **Phases 2–5:** types → `GitRunner` → porcelain parser → **Safety Engine**, each with green tests, before touching the UI. This front-loads everything the agent can verify locally without a human at the screen.

Folder structure:

```
gitpilot/
├── package.json
├── electron/            main process entry, window mgmt
├── preload/             contextBridge API (typed, Zod-validated)
├── src/
│   ├── core/            types.ts, safety/, parsers/   (PURE — no node/electron)
│   ├── main/services/   GitService, ProfileService, ...
│   ├── main/git/        GitRunner, GitLocator, ErrorMapper
│   ├── main/storage/    JsonStore, SecretStore
│   └── renderer/        React app (screens, stores, components)
├── tests/               unit / integration / e2e
└── electron-builder.yml
```
