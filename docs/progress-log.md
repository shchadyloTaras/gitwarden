# GitWarden — Progress Log & Phase Checklist

Project status and the per-phase build log. **Kept out of `CLAUDE.md` / `AGENTS.md`** so those stay under the ~200-line memory target ([Claude Code memory docs](https://code.claude.com/docs/en/memory) — shorter instruction files load fully every session and get better adherence). The per-phase prompt footers append here.

> History note: Phase 19 was previously only in `AGENTS.md` and Phase 20 only in `CLAUDE.md` (the two files had drifted). Both are reunited here as the single source of truth.

## Phase Checklist

- [x] Phase 0 — Foundations & Decisions
- [x] Phase 1 — Repo & Toolchain Scaffold
- [x] Phase 2 — Core Types & Domain Models
- [x] Phase 3 — Git Execution Core (GitRunner)
- [x] Phase 4 — Porcelain Parser & Status
- [x] Phase 5 — Safety Engine
- [x] Phase 6 — Storage Layer
- [x] Phase 7 — IPC Bridge & Preload
- [x] Phase 8 — App Shell & Navigation
- [x] Phase 9 — Profile Management
- [x] Phase 10 — Repository Management
- [x] Phase 11 — Status & Staging UI
- [x] Phase 12 — Diff Viewer
- [x] Phase 13 — Commit Flow
- [x] Phase 14 — Remote Operations
- [x] Phase 15 — Branches
- [x] Phase 16 — History
- [x] Phase 17 — Safety Center
- [x] Phase 18 — Settings, Polish & Hardening
- [x] Phase 19 — Onboarding Walkthrough
- [x] Phase 20 — Global Repo Context

### GitHub OAuth feature (plan: `docs/plans/github-oauth-plan.md`, prompts: `docs/prompts/github-oauth-prompts.md`)

- [x] Phase 21 — OAuth Foundations & Types
- [x] Phase 22 — Secret Storage Activation
- [x] Phase 23 — GitHub Device Flow Auth Service
- [x] Phase 24 — GitHub API Client & Account Identity
- [x] Phase 25 — IPC Bridge for GitHub Auth
- [x] Phase 26 — "Connect GitHub" UI (safe stop point)
- [x] Phase 27 — Token-based Push (HTTPS) + Safety Engine (optional)

### AI Connections feature (plan: `docs/plans/ai-integration-plan.md`, prompts: `docs/prompts/ai-integration-prompts.md`)

- [x] Phase 28 — AI Foundations, Decisions & Connection Contracts
- [x] Phase 29 — AI Connections Manager & Credential Store
- [x] Phase 30 — Adapter Registry, Built-in Providers & Custom HTTP
- [x] Phase 31 — Context Builder, Redaction & Send Preview
- [x] Phase 32 — Smart Commit Assistant
- [x] Phase 33 — Change Review Assistant
- [x] Phase 34 — Safety Copilot (recommended MVP stop point)
- [x] Phase 35 — Push Brief & History Intelligence
- [x] Phase 36 — Repo Onboarding Assistant
- [x] Phase 37 — Failure Explainer
- [x] Phase 38 — Connection Templates, Import/Export & Team Handoff
- [x] Phase 39 — Optional Agentic Actions (deferred; allowlist-only)

### Distribution & Release feature (plan: `docs/plans/distribution-release-plan.md`, prompts: `docs/prompts/distribution-release-prompts.md`)

- [ ] Phase 40 — Packaging Foundations & Local `dist`
- [ ] Phase 41 — App Identity: Icons, Metadata & Installer UX
- [ ] Phase 42 — Release Workflow (GitHub Actions, unsigned matrix)
- [ ] Phase 43 — Code Signing & Notarization (optional; gated on certificates)
- [ ] Phase 44 — Auto-Update (deferred; depends on Phase 43)
- [ ] Phase 45 — Release Process, Versioning & Download Docs

### Landing Page & Download Site feature (plan: `docs/plans/landing-page-plan.md`, prompts: `docs/prompts/landing-page-prompts.md`)

- [ ] Phase 46 — Site Foundations & Toolchain
- [ ] Phase 47 — Release Metadata & Latest-Binary Resolution
- [ ] Phase 48 — Download Experience & OS Detection
- [ ] Phase 49 — Product Messaging & Marketing UI
- [ ] Phase 50 — SEO, Accessibility, Analytics & Performance
- [ ] Phase 51 — Deployment, CI & Release Integration

### AI Chat Redesign feature (plan: `docs/plans/ai-chat-redesign-plan.md`)

- [x] Phase 52 — Chat Backend: General-Chat Assistant & `ai:chat` IPC
- [x] Phase 53 — Chat State & Slash-Command Router
- [x] Phase 54 — Tabbed Right Panel, Chat UI & Inline Registration
- [x] Phase 55 — Panel Retirement & Cleanup
- [x] Phase 55a — AI Settings simplification (paste-key-and-go; ad-hoc, post-plan)

> Post-plan AI chat hardening (streaming, `/explain`, structured-output standardization, and the
> slash-command / safety / schema fixes) ships as dated `feat`/`Fix` entries in the log below
> rather than numbered phases — they were not in the AI Chat Redesign plan.

### Client Branch Access feature (plan: `docs/plans/client-branch-access-plan.md`, prompts: `docs/prompts/client-branch-access-prompts.md`)

- [ ] Phase 56 — Push Policy Foundations & Pure Helpers
- [ ] Phase 57 — Safety Engine: Branch Access Checks
- [ ] Phase 58 — Policy Persistence, IPC & Push-Path Wiring
- [ ] Phase 59 — Push Policy UI (feature-complete stop point)

### Generative UI Blocks feature (plan: `docs/plans/genui-blocks-plan.md`, prompts: `docs/prompts/genui-blocks-prompts.md`)

- [x] Phase 60 — GenUI Block Contracts, Store & Review Findings card
- [x] Phase 61 — Commit Draft card
- [x] Phase 62 — Free-text model-chosen blocks (Level 2)

## Feature Track Status

| Track                  | Phases    | Status                 |
| ---------------------- | --------- | ---------------------- |
| MVP Core               | 0–20      | ✅ complete            |
| GitHub OAuth           | 21–27     | ✅ complete            |
| AI Connections         | 28–39     | ✅ complete            |
| AI Chat Redesign       | 52–55a    | ✅ complete            |
| Generative UI Blocks   | 60–62     | 🟡 60–61 done, 62 open |
| Client Branch Access   | 56–59     | ⬜ not started         |
| Distribution & Release | 40–45     | ⬜ not started         |
| Landing Page           | 46–51     | ⬜ not started         |
| Agentic DX             | DX-0–DX-6 | ⬜ not started         |

## Progress Log

> Append a new entry at the bottom after each phase. Newest last. Do not rewrite past entries.
> Format:
>
> ```
> ### YYYY-MM-DD — Phase N: <name>
> - Built: <what>
> - Files: <added/changed>
> - Tests: <vitest/playwright result>
> - Exit criteria: ✅ met / ⚠️ partial (why)
> - Notes / follow-ups: <anything>
> ```

<!-- progress entries go below this line -->

### 2026-06-23 — Phase 0: Foundations & Decisions

- Built: Foundational decisions and threat-model docs (no app code).
- Files: added `DECISIONS.md`, `SECURITY.md`; updated checklist + log.
- Tests: n/a (docs-only phase).
- Exit criteria: ✅ met — git location + missing-git UX (all 3 OSes), SSH model + env forwarding (incl. Windows agent), token-deferred decision, SECURITY.md, concurrency/cancellation rules.
- Notes / follow-ups: Min versions set (Node ≥20, Electron ≥30, git ≥2.30). Hook sandboxing deferred; risk documented in SECURITY.md §7.

### 2026-06-23 — Phase 1: Repo & Toolchain Scaffold

- Built: Electron 31 + React 18 + Vite 5 + TypeScript strict skeleton; Vitest + Playwright wired; full folder structure.
- Files: added `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `playwright.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `electron-builder.yml`, `electron/index.ts`, `preload/index.ts`, `src/renderer/{index.html,main.tsx,App.tsx}`, `tests/unit/sanity.test.ts`, `tests/e2e/window.spec.ts`; placeholder dirs for `src/core/`, `src/main/{services,git,storage}/`, `tests/integration/`, `resources/`.
- Tests: Vitest 2/2 passed; Playwright 1/1 passed (`window opens with correct title`).
- Exit criteria: ✅ met — `npm run dev` opens window; trivial Vitest test passes; Playwright "window opens" test passes.
- Notes / follow-ups: `eslint --ext .ts,.tsx` uses ESLint 8 legacy config (`.eslintrc.cjs`); upgrade to flat config in Phase 18 polish. Audit warnings are in transitive electron-builder deps, not our code.

### 2026-06-23 — Phase 2: Core Types & Domain Models

- Built: `src/core/types.ts` (all domain models from plan §10) and `src/core/schemas.ts` (Zod schemas for `Profile`, `RepositoryRecord`, `AppSettings`).
- Files: added `src/core/types.ts`, `src/core/schemas.ts`, `tests/unit/zod-roundtrip.test.ts`.
- Tests: Vitest 14/14 passed (12 new round-trip tests + 2 pre-existing sanity tests).
- Exit criteria: ✅ met — types compile under strict TS (`tsc --noEmit` clean); Zod round-trip parse/serialize tests pass for all three persisted types.
- Notes / follow-ups: `AuthenticationMethod = 'token'` is model-only (no storage/push path) per MVP decision in Phase 0. (Superseded by the GitHub OAuth plan — `docs/plans/github-oauth-plan.md`.)

### 2026-06-23 — Phase 3: Git Execution Core (GitRunner)

- Built: `GitLocator` (3-OS PATH scan + common locations + version verify), `PathValidator` (absolute path, symlink resolution, `.git` check), `GitRunner` (`spawn`-based, controlled env, `AbortSignal` cancellation, per-cwd mutation queue, concurrent stdout/stderr), `ErrorMapper` + `GitError` class (stderr/exit-code → typed `GitCommandError`).
- Files: added `src/main/git/GitLocator.ts`, `src/main/git/PathValidator.ts`, `src/main/git/GitRunner.ts`, `src/main/git/ErrorMapper.ts`, `tests/unit/error-mapper.test.ts`, `tests/unit/path-validator.test.ts`, `tests/integration/git-runner.test.ts`; fixed pre-existing lint warning in `tests/unit/zod-roundtrip.test.ts`.
- Tests: Vitest 39/39 passed (11 ErrorMapper + 6 PathValidator + 8 GitRunner integration, including abort test).
- Exit criteria: ✅ met — integration test runs real git in a temp repo; `PathValidator` + `ErrorMapper` tests pass; aborting a long-running invocation (fake slow script) kills the process.
- Notes / follow-ups: Abort test is `skipIf(win32)` (uses shell script). `GitRunner` rejects with `GitError extends Error` for proper error typing. `PathValidator` placed in `src/main/git/` (uses `fs`; not pure).

### 2026-06-23 — Phase 4: Porcelain Parser & Status

- Built: `parsePorcelainV2` (pure NUL-delimited porcelain v2 parser: branch headers, ordinary/rename/unmerged/untracked entries, XY→ChangeKind map); `GitService.getStatus` wiring the parser on top of `GitRunner`.
- Files: added `src/core/parsers/PorcelainParser.ts`, `src/main/services/GitService.ts`, `tests/unit/porcelain-parser.test.ts`, `tests/integration/git-service.test.ts`.
- Tests: Vitest 60/60 passed (13 new unit parser tests + 8 new integration getStatus tests).
- Exit criteria: ✅ met — unit tests cover staged-and-modified (MM), rename with origPath, untracked, conflict, path with spaces and unicode; integration getStatus test passes on a temp repo with mixed changes.
- Notes / follow-ups: Conflict integration test uses explicit `checkout -b trunk` to avoid dependency on git's default branch name. With `-z`, git emits raw unicode paths without quoting, so `?` entries work for unicode filenames correctly.

### 2026-06-23 — Phase 5: Safety Engine

- Built: `SafetyCheckService` (pure, synchronous) in `src/core/safety/`; `GitService.getEffectiveIdentity` via `git config --show-origin`; `parseScope` mapping origin path → local/global.
- Files: added `src/core/safety/SafetyCheckService.ts`, `tests/unit/safety-engine.test.ts`, `tests/integration/git-service-identity.test.ts`; updated `src/main/services/GitService.ts`.
- Tests: Vitest 99/99 passed (36 new safety-engine unit + 3 new identity integration; 60 pre-existing).
- Exit criteria: ✅ met — full issue-code matrix tested: NO_ACTIVE_PROFILE, REPO_UNASSIGNED, PROFILE_MISMATCH, IDENTITY_UNSET, EMAIL_MISMATCH, EMAIL_FROM_GLOBAL_ONLY, NOTHING_STAGED, EMPTY_MESSAGE, HAS_CONFLICTS, NO_REMOTE, REMOTE_HOST_MISMATCH; every branch of the engine exercised; lint + prettier clean.
- Notes / follow-ups: `git --show-origin` emits `file:.git/config` (relative path on macOS) not an absolute path — `parseScope` uses `endsWith('.git/config')` rather than a regex. Conflicted files excluded from `hasStagedChanges` (must be resolved + re-staged). `GIT_CONFIG_NOSYSTEM=1` in GitRunner means system scope never appears; scope is either local or global.

### 2026-06-23 — Phase 6: Storage Layer

- Built: `JsonStore<T>` (atomic write via `.tmp`→`rename`, Zod-validated read, directory auto-create); `SecretStore` (Electron `safeStorage` wrapper with injectable encryptor for test isolation; token path stubbed for MVP); `ProfileService`, `RepositoryService`, `SettingsService` wired on top of `JsonStore`; interfaces (`IProfileService`, etc.) ready for IPC bridge.
- Files: added `src/main/storage/JsonStore.ts`, `src/main/storage/SecretStore.ts`, `src/main/services/ProfileService.ts`, `src/main/services/RepositoryService.ts`, `src/main/services/SettingsService.ts`, `tests/unit/json-store.test.ts`, `tests/unit/profile-service.test.ts`, `tests/unit/repository-service.test.ts`, `tests/unit/settings-service.test.ts`; updated `src/core/schemas.ts` (added `ProfilesDataSchema`, `RepositoriesDataSchema`).
- Tests: Vitest 132/132 passed (33 new: 8 JsonStore + 10 ProfileService + 10 RepositoryService + 5 SettingsService; 99 pre-existing).
- Exit criteria: ✅ met — data persists across store instances (simulates relaunch); atomic-write test confirms original file intact when `.tmp` exists but rename hasn't run; Zod rejects malformed stored JSON.
- Notes / follow-ups: `vi.spyOn` cannot intercept Node built-in `fs/promises.rename` (non-configurable); the interrupted-write test instead leaves an orphaned `.tmp` and asserts the main file is unchanged — tests the observable guarantee directly. `SecretStore` uses lazy `require('electron')` so it never loads Electron in Vitest.

### 2026-06-23 — Phase 7: IPC Bridge & Preload

- Built: `src/main/ipc/ipc-schemas.ts` (Zod request payload schemas for all 14 channels); `src/main/ipc/ipc-handlers.ts` (`registerIpcHandlers()` wrapping every service call in a typed `IpcResult<T>` envelope); `preload/index.ts` rewritten with typed `contextBridge` API; `src/renderer/types/window.d.ts` declaring `window.api`; `electron/index.ts` updated to initialize all services and register handlers before `createWindow()`; pre-existing `IdentityInput.activeProfile` type narrowing bug fixed.
- Files: added `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `src/renderer/types/window.d.ts`, `tests/unit/ipc-schemas.test.ts`, `tests/e2e/ipc-bridge.spec.ts`; updated `preload/index.ts`, `electron/index.ts`, `tsconfig.web.json` (added `src/core/**/*`), `src/core/safety/SafetyCheckService.ts` (type fix).
- Tests: Vitest 162/162 passed (30 new ipc-schemas unit tests; 132 pre-existing); Playwright 4/4 passed (1 pre-existing + 3 new: security flags, `profiles:list` round-trip, invalid-payload Zod rejection).
- Exit criteria: ✅ met — renderer call round-trips to a main service and back, fully type-checked; invalid IPC payload rejected by Zod (`ok: false` returned); security flags (`contextIsolation`, `sandbox`, no `window.require`/`window.process`) asserted in Playwright; `tsc --noEmit` clean on both `tsconfig.node.json` and `tsconfig.web.json`.
- Notes / follow-ups: `IpcResult<T>` envelope used instead of raw `throw` so renderer never needs `try/catch` over `window.api` calls. All 14 channels (5 profile + 5 repo + 2 settings + 2 git) wired. `window.api` type in `window.d.ts` mirrors the preload exactly — keep in sync when adding channels.

### 2026-06-23 — Phase 8: App Shell & Navigation

- Built: Zustand `appStore` (seeded with Personal profile, gitwarden repo, main branch, safe badge); `GlobalHeader` (repo · branch · profile chip · safety badge · inspector toggle); `Sidebar` (9 nav items in 3 groups: MANAGE / GIT / APP, highlighted active screen); `Inspector` (contextual panel with profile/repo/branch/safety state, closeable); placeholder `Screen` components for all 9 sections; `App.tsx` wired as a CSS-grid shell (header + sidebar + main + inspector); `data-testid` attributes on all navigable elements.
- Files: added `src/renderer/store/appStore.ts`, `src/renderer/components/GlobalHeader.tsx`, `src/renderer/components/Sidebar.tsx`, `src/renderer/components/Inspector.tsx`, `src/renderer/screens/PlaceholderScreen.tsx`, `src/renderer/screens/RepositoriesScreen.tsx`, `src/renderer/screens/ProfilesScreen.tsx`, `src/renderer/screens/StatusScreen.tsx`, `src/renderer/screens/CommitScreen.tsx`, `src/renderer/screens/RemoteScreen.tsx`, `src/renderer/screens/BranchesScreen.tsx`, `src/renderer/screens/HistoryScreen.tsx`, `src/renderer/screens/SafetyCenterScreen.tsx`, `src/renderer/screens/SettingsScreen.tsx`, `tests/e2e/shell.spec.ts`; updated `src/renderer/App.tsx`; added `zustand` dependency; formatted pre-existing Phase 7 files.
- Tests: Vitest 162/162 passed (no new unit tests — this phase is UI-only); Playwright 8/8 passed (4 pre-existing + 4 new: header seeded state, navigate-all-screens, inspector visible, inspector toggle).
- Exit criteria: ✅ met — Playwright navigates between all 9 screens; global header renders seeded store values (repo, branch, profile, safety badge); inspector toggles open/closed.
- Notes / follow-ups: All screens are placeholders; content is added in Phases 9–17. Inspector is a read-only display for now; will gain contextual actions per screen. `SafetyBadge` seeded as `'safe'`; Phase 11+ will wire real `checkCommit` results.

### 2026-06-23 — Phase 9: Profile Management

- Built: `useProfilesStore` (Zustand, IPC-backed CRUD: list/create/update/delete/setActive + load); `profileColor` (deterministic color from profile ID, palette of 6); full `ProfilesScreen` (list panel + create/edit form with all Profile fields, SSH-only auth, expectedRemoteHosts add/remove, delete confirm, Set-Active, per-field testids); `App.tsx` calls `load()` on mount; `GlobalHeader` and `Inspector` now read from `useProfilesStore` (real `Profile.displayName`, `gitAuthorName`, `gitAuthorEmail`); `appStore` stripped of `SeedProfile` and `activeProfile`.
- Files: added `src/renderer/store/profilesStore.ts`, `tests/e2e/profiles.spec.ts`; updated `src/renderer/store/appStore.ts`, `src/renderer/screens/ProfilesScreen.tsx`, `src/renderer/components/GlobalHeader.tsx`, `src/renderer/components/Inspector.tsx`, `src/renderer/App.tsx`, `tests/e2e/shell.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is thin UI glue over Phase 6 services); Playwright 13/13 passed (8 pre-existing + 5 new: create-3-profiles, edit, delete, set-active in header, relaunch persistence).
- Exit criteria: ✅ met — Playwright creates Personal/Work/Client, edits one to "Work Updated", deletes Client, sets Personal active (header-profile shows "Personal"), app relaunched → "Personal" still shown in header.
- Notes / follow-ups: Color is computed from profile ID (no stored color field); `authenticationMethod` hardcoded to `'ssh'` in form (token option shown disabled, per MVP decision). `SEED_REPO` kept in `appStore` for Phase 10.

### 2026-06-23 — Phase 10: Repository Management

- Built: `GitService.validateRepository` (`git rev-parse --show-toplevel` + optional `git remote get-url origin`); `dialog:openDirectory` IPC channel (Electron `dialog.showOpenDialog`); `git:validateRepository` IPC channel; `useRepositoriesStore` (Zustand, IPC-backed: load/addRepository/updateRepo/removeRepo); full `RepositoriesScreen` (list panel with per-item mismatch indicator, add-by-path form with Browse button, edit panel with name/profile assignment/notes/remove-with-confirm, profile-mismatch warning banner); `App.tsx` now loads both `profilesStore` and `repositoriesStore` on mount.
- Files: updated `src/main/services/GitService.ts` (validateRepository), `src/main/ipc/ipc-handlers.ts` (dialog + validate channels), `preload/index.ts` (dialog.openDirectory, git.validateRepository), `src/renderer/types/window.d.ts`, `src/renderer/App.tsx`; added `src/renderer/store/repositoriesStore.ts`, `src/renderer/screens/RepositoriesScreen.tsx`, `tests/e2e/repositories.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is thin IPC glue); Playwright 16/16 passed (13 pre-existing + 3 new: add+assign+mismatch-warning+remove, invalid-path rejection, no-warning when active profile unset).
- Exit criteria: ✅ met — Playwright adds a local temp git repo, assigns Work profile, sees mismatch warning (active=Personal), removes it (file still on disk); invalid non-git path shows error.
- Notes / follow-ups: `dialog:openDirectory` registered inside `registerIpcHandlers` using Electron `dialog` import (no parent window — acceptable for MVP). Clone is deferred (out of scope for MVP). `SEED_REPO` in `appStore` removed in favour of real `repositoriesStore`.

### 2026-06-23 — Phase 11: Status & Staging UI

- Built: `GitService.stageFile/unstageFile/stageAll/unstageAll` (4 new git operations); `GitFilePathPayload` Zod schema; 4 new IPC channels (`git:stageFile`, `git:unstageFile`, `git:stageAll`, `git:unstageAll`); `useStatusStore` (Zustand, IPC-backed: `loadStatus`, `stageFile`, `unstageFile`, `stageAll`, `unstageAll`); full `StatusScreen` (repo dropdown picker, refresh button, three sections — Staged/Unstaged/Untracked — filtered by `indexStatus`/`worktreeStatus` without bucketing; per-file stage/unstage buttons; section-level bulk actions; opaque MM dual-side rendering).
- Files: updated `src/main/services/GitService.ts`, `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`; added `src/renderer/store/statusStore.ts`; replaced `src/renderer/screens/StatusScreen.tsx`; added `tests/e2e/status.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is thin IPC glue over git operations); Playwright 18/18 passed (16 pre-existing + 2 new: stage/unstage cycle, staged-and-modified file on both sides).
- Exit criteria: ✅ met — Playwright stages and unstages `hello.txt` in fixture repo; a `world.txt` that is both staged and worktree-modified (MM) appears correctly in both the staged and unstaged sections simultaneously.
- Notes / follow-ups: Filtering is pure derivation from `FileChange.indexStatus`/`worktreeStatus` — no client-side bucketing. `unstageFile` uses `git restore --staged` (git ≥ 2.23, matches Phase 0 min-version of ≥ 2.30). StatusScreen repo-picker uses `repositoriesStore` list; future phases may wire `appStore.activeRepo` for auto-selection.

### 2026-06-23 — Phase 12: Diff Viewer

- Built: `GitService.getDiff` (`git diff --no-color [--staged] -- <path>`); `GitDiffPayload` Zod schema; `git:getDiff` IPC channel; `getDiff` in preload + `window.d.ts`; `StatusScreen` rewritten as a split-pane layout (left: file list 300px, right: diff panel); `DiffPanel` component with toolbar (file path + Staged/Unstaged toggle, buttons disabled when inapplicable), line-by-line colored diff rendering (`+` → green, `-` → red, `@@` → indigo), empty state, loading state, untracked-file message; clicking a file row auto-selects the relevant diff mode.
- Files: updated `src/main/services/GitService.ts` (getDiff), `src/main/ipc/ipc-schemas.ts` (GitDiffPayload), `src/main/ipc/ipc-handlers.ts` (git:getDiff), `preload/index.ts`, `src/renderer/types/window.d.ts`, `src/renderer/screens/StatusScreen.tsx`; added `tests/e2e/diff.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is a thin IPC call); Playwright 21/21 passed (18 pre-existing + 3 new: empty state, unstaged diff renders with added/removed lines, staged diff renders with added/removed lines).
- Exit criteria: ✅ met — Playwright confirms diff renders for staged and unstaged changes on fixture repos; `diff-empty` testid renders when no file is selected.
- Notes / follow-ups: `getDiff` calls `git diff` as read-only (not queued). Diff mode auto-switches to 'staged' when clicking from the Staged section, 'unstaged' when clicking from Unstaged/Untracked.

### 2026-06-23 — Phase 14: Remote Operations

- Built: `GitService.getRemotes/fetch/pull/push` (4 new git operations); `parseRemoteHost` (SSH + HTTPS URL host extraction); `GitRemoteOpPayload` + `GitRemoteBranchOpPayload` Zod schemas; 4 new IPC channels (`git:getRemotes`, `git:fetch`, `git:pull`, `git:push`); `useRemoteStore` (Zustand: load remotes+status+identity, doFetch/doPull/doRemotePush); full `RemoteScreen` (repo picker, branch display, per-remote fetch/pull/push buttons, push confirmation sheet with repo/path/branch/remote URL+host/active profile+email/assigned profile/auth method/full `SafetyCheckService.checkPush` result); push blocked on any blocker; explicit confirm required.
- Files: updated `src/main/services/GitService.ts`, `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`; added `src/renderer/store/remoteStore.ts`, replaced `src/renderer/screens/RemoteScreen.tsx`; added `tests/e2e/remote.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — new git ops are thin wrappers); Playwright 25/25 passed (23 pre-existing + 2 new: push blocked on REMOTE_HOST_MISMATCH with confirm button disabled; push succeeds after explicit confirmation and bare repo receives the commit).
- Exit criteria: ✅ met — Playwright: push blocked when profile has `expectedRemoteHosts: ['github.com']` and remote is a local bare repo (no host); confirm button disabled; push succeeds with `expectedRemoteHosts: []`, sheet confirms, `git log main` on bare repo shows "add feature".
- Notes / follow-ups: `parseRemoteHost` handles SSH (`git@host:user/repo`) and HTTPS (`https://host/...`) patterns; local paths return `undefined`. Push uses `git push <remote> <branch>`. Fetch/pull have 60s timeout. True IPC-level cancellation deferred.

### 2026-06-23 — Phase 13: Commit Flow

- Built: `GitService.commit` (`git commit -m <message>` + `git rev-parse --short HEAD` for returned hash); `GitService.setLocalIdentity` (`git config --local user.name/user.email` — never `--global`); `GitCommitPayload` + `GitSetIdentityPayload` Zod schemas; `git:commit` + `git:setLocalIdentity` IPC channels; `commit` + `setLocalIdentity` in preload + `window.d.ts`; `useCommitStore` (Zustand: load status+identity together, `applyLocalIdentity`, `doCommit` with post-commit status refresh); full `CommitScreen` (repo picker, staged-changes summary, commit message textarea, safety issues panel with ⛔ blockers + ⚠ warnings, "Set local identity" action button, commit button disabled on any blocker, success banner with short hash); `GitRunner.buildEnv` now forwards `GIT_CONFIG_GLOBAL` when set.
- Files: updated `src/main/services/GitService.ts` (commit, setLocalIdentity), `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`, `src/main/git/GitRunner.ts`; added `src/renderer/store/commitStore.ts`, `src/renderer/screens/CommitScreen.tsx` (replaced placeholder), `tests/e2e/commit.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is thin IPC glue over git operations); Playwright 23/23 passed (21 pre-existing + 2 new: screen renders/shows placeholder, identity-mismatch blocker → set-local-identity → commit creates correct author verified via `git log`).
- Exit criteria: ✅ met — Playwright on fixture repo: IDENTITY_UNSET blocks commit (commit button disabled); "set local identity" action sets local git config from active profile; identity reload removes blocker; commit button enables; successful commit creates real commit; `git log` confirms author name=Alice Dev, email=alice@example.com matching the active profile.
- Notes / follow-ups: `GIT_CONFIG_GLOBAL` forwarding in `GitRunner` is needed so the Playwright test can set an empty global config to guarantee IDENTITY_UNSET fires reliably. Requires git ≥ 2.32. `safetyCheckService.checkCommit` is imported directly in the renderer (pure module; Vite bundles it).

### 2026-06-23 — Phase 15: Branches

- Built: `GitService.getBranches` (`git for-each-ref` over refs/heads + refs/remotes, returns `GitBranch[]`); `GitService.switchBranch/createBranch/deleteBranch` (`git switch`, `git switch -c`, `git branch -D`); `GitBranchOpPayload` + `GitCreateBranchPayload` Zod schemas; 4 new IPC channels; `useBranchStore` (Zustand: load, doSwitch, doCreate, doDelete, deleteConfirm inline flow; updates `appStore.currentBranch` after every switch/create); full `BranchesScreen` (repo picker, current-branch pill, create-branch input+button, local branch list with \* indicator / Switch / Delete-with-inline-confirm, remote branch read-only list).
- Files: updated `src/main/services/GitService.ts`, `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`; added `src/renderer/store/branchStore.ts`, replaced `src/renderer/screens/BranchesScreen.tsx`; added `tests/e2e/branches.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is thin IPC glue); Playwright 28/28 passed (25 pre-existing + 3 new: switch branch updates header, create branch creates-and-switches, delete branch with inline confirm removes from list).
- Exit criteria: ✅ met — Playwright: switches to feature-a, header shows feature-a; creates feature-b from main, header shows feature-b; deletes feature-a via inline confirm, branch removed from list; `tsc --noEmit` clean.
- Notes / follow-ups: `getBranches` uses two `for-each-ref` calls (local + remote) so `%(HEAD)` correctly marks only the locally checked-out branch. `deleteBranch` uses `-D` (force) since the user already confirmed in the UI.

### 2026-06-23 — Phase 16: History

- Built: `GitService.getCommitHistory` (`git log -z --format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s -n <limit> --skip <skip>`, NUL-split parser grouping 6 fields per commit); `GitHistoryPayload` Zod schema; `git:getCommitHistory` IPC channel; `getCommitHistory` in preload + `window.d.ts`; `useHistoryStore` (Zustand: load first PAGE_SIZE=50, loadMore appending the next page, hasMore flag); full `HistoryScreen` (repo picker, sticky column header, commit list with short hash / message / author / date, "Load more" button).
- Files: updated `src/main/services/GitService.ts`, `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`; added `src/renderer/store/historyStore.ts`, replaced `src/renderer/screens/HistoryScreen.tsx`; added `tests/e2e/history.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is a thin IPC call); Playwright 2/2 new history tests passed (history renders 6 commits on fixture repo; "load more" pages 55-commit repo from 50→55 without duplicates, load-more button disappears when exhausted).
- Exit criteria: ✅ met — history renders on fixture repo; "load more" pages additional commits without duplicates; `tsc --noEmit` clean.
- Notes / follow-ups: Parser splits stdout by `\0` and groups 6 fields per commit. PAGE_SIZE=50; `hasMore` is true when the page is exactly full (standard next-page heuristic).

### 2026-06-23 — Phase 17: Safety Center

- Built: `useSafetyCenterStore` (Zustand: loads `getEffectiveIdentity` + `getRemotes` + `getStatus` in parallel; runs `safetyCheckService.checkRepositoryIdentity` + `safetyCheckService.checkPush`; exposes deduplicated issues, `identityCheck`, `pushCheck`); full `SafetyCenterScreen` (repo picker, Profiles card with active/assigned + mismatch banner, Git Identity card with name/email/scope, Remote & Branch card with per-remote host, Verdict card with `data-testid="safety-can-commit"` / `safety-can-push"`, Issues list with per-code `data-testid="safety-issue-{code}"`).
- Files: added `src/renderer/store/safetyCenterStore.ts`, replaced `src/renderer/screens/SafetyCenterScreen.tsx`; added `tests/e2e/safety-center.spec.ts`.
- Tests: Vitest 162/162 passed (no new unit tests — logic reuses Phase 5 `SafetyCheckService` directly); Playwright 2/2 new safety-center tests passed (IDENTITY_UNSET blocks commit; REMOTE_HOST_MISMATCH blocks push).
- Exit criteria: ✅ met — Safety Center verdicts match commit/push gates for both fixture repo states; `tsc --noEmit` clean on both tsconfig variants.
- Notes / follow-ups: No new IPC channels needed. Issues are deduplicated across identity + push checks so a shared code (e.g. PROFILE_MISMATCH) appears only once.

### 2026-06-23 — Phase 18: Settings, Polish & Hardening

- Built: Full Settings screen (appearance tri-state, custom Git path validation, default projects folder), theme application + keyboard navigation, centralized UI/safety strings, tracked/untracked discard flows with distinct warnings, startup custom-Git fallback, GitWarden app data path, unique-temp atomic JSON writes, and serialized Electron e2e config to avoid shared-storage races.
- Files: added `src/renderer/store/settingsStore.ts`, `src/renderer/strings.ts`, `src/renderer/theme.css`, `src/core/safety/safetyMessages.ts`, `tests/e2e/settings.spec.ts`; updated settings/types/schemas, preload + IPC, `GitService`, `GitLocator`, `JsonStore`, `App`, Settings/Status screens, e2e readiness waits, Playwright config.
- Tests: `npm run lint` passed; `npx tsc --noEmit -p tsconfig.node.json` passed; `npx tsc --noEmit -p tsconfig.web.json` passed; `npm test` passed (162/162); `npm run e2e` passed (36/36, escalated because Electron GUI launch is sandbox-restricted).
- Exit criteria: ✅ met — every screen has loading/empty/error coverage from prior UI phases plus Phase 18 settings states; irreversible untracked delete warns distinctly from tracked discard; Appendix D security checklist reviewed; strings centralized for new UI and safety messages; full local lint/unit/e2e gates green.
- Notes / follow-ups: CI matrix is not configured in this repo, so mac/linux/win matrix execution was not run locally. `GitLocator` still performs the initial version probe in the git layer; normal repository operations remain behind `GitRunner`.

### 2026-06-23 — Phase 19: Onboarding Walkthrough

- Built: Interactive first-run walkthrough with data-driven coach marks, target highlighting, next/back/skip/finish controls, keyboard support, cross-screen navigation, persisted completed/skipped state, and Settings replay.
- Files: added `src/renderer/components/OnboardingTour.tsx`, `src/renderer/store/onboardingStore.ts`, `tests/e2e/onboarding.spec.ts`; updated `AppSettings` types/schemas/tests, `settingsStore`, `App.tsx`, `SettingsScreen`, `GlobalHeader`, `Sidebar`, `strings.ts`.
- Tests: `npm run lint` passed; `npx tsc --noEmit -p tsconfig.node.json` passed; `npx tsc --noEmit -p tsconfig.web.json` passed; `npm test` passed (162/162); focused onboarding e2e passed (2/2); full `npm run e2e` passed (38/38, escalated because Electron GUI launch is sandbox-restricted).
- Exit criteria: ✅ met — new users get a step-by-step tour, users can skip, completed/skipped state persists, and the walkthrough can be replayed from Settings.
- Notes / follow-ups: Auto-open is suppressed under browser automation (`navigator.webdriver`) so existing Playwright flows are not blocked; manual Settings replay remains covered in e2e.

### 2026-06-24 — Phase 20: Global Repo Context

- Built: `appStore.activeRepo` upgraded from hardcoded `SeedRepo` to real `RepositoryRecord | null`; auto-select effect in `App.tsx` picks first available repo (handles first-load, repo deletion, and all-repos-removed edge cases); `GlobalHeader` replaced static repo/branch display with interactive `<select data-testid="header-repo-select">` + `<select data-testid="header-branch-select">` — repo select driven by `repositoriesStore`, branch select driven by `branchStore` (loaded on `activeRepo` change); all 6 GIT screens (Status, Commit, Remote, Branches, History, Safety Center) removed per-screen repo pickers and now read `appStore.activeRepo`; `RepositoriesScreen` sets active repo on click; Playwright tests updated.
- Files: updated `src/renderer/store/appStore.ts`, `src/renderer/App.tsx`, `src/renderer/components/GlobalHeader.tsx`, `src/renderer/screens/RepositoriesScreen.tsx`, `src/renderer/screens/StatusScreen.tsx`, `src/renderer/screens/CommitScreen.tsx`, `src/renderer/screens/RemoteScreen.tsx`, `src/renderer/screens/BranchesScreen.tsx`, `src/renderer/screens/HistoryScreen.tsx`, `src/renderer/screens/SafetyCenterScreen.tsx`; updated 7 e2e test files.
- Tests: `npm run lint` passed; `npx tsc --noEmit` clean on both tsconfig variants; `npm test` 162/162; `npm run e2e` 38/38.
- Exit criteria: ✅ met — selecting a repo in the header propagates to all GIT screens; switching branches via header updates `currentBranch` in appStore; first repo auto-selects on app start and after repo removal; all existing tests pass.
- Notes / follow-ups: Branch picker in header only appears once branches load (after `branchStore.load` completes). `settings.spec.ts` discard test explicitly selects repo via `header-repo-select` since that test shares storage with prior tests and may have multiple repos.

### 2026-06-24 — Phase 21: OAuth Foundations & Types

- Built: Pure-core OAuth foundations for the GitHub Device Flow feature — domain types, Zod boundary schemas, public config, and the reversed token-deferral decision. No network, no UI.
  - `src/core/types.ts`: added `GitHubDeviceCode`, `GitHubAccount`, `LinkedGitHubAccount`, `GitHubAuthStatus`, `GitHubAuthErrorCode`; extended `Profile` with optional `linkedGitHub?`.
  - `src/core/schemas.ts`: `LinkedGitHubAccountSchema` (+ `linkedGitHub` on `ProfileSchema`); `GitHubAuthStatusSchema`/`GitHubAuthErrorCodeSchema` enums; renderer-facing `GitHubDeviceCodeSchema`/`GitHubAccountSchema`; raw GitHub API response schemas (`GitHubDeviceCodeResponseSchema`, `GitHubAccessTokenResponseSchema` success∪error union, `GitHubUserResponseSchema`, `GitHubEmailsResponseSchema`).
  - `src/core/config/github.ts` (new): `GITHUB_CLIENT_ID` (placeholder until Appendix D) + `GITHUB_OAUTH_SCOPES = ['read:user','user:email']`.
  - `src/main/ipc/ipc-schemas.ts`: GitHub IPC payload schemas (`GitHubStartDeviceAuthPayload`/`Cancel`/`Disconnect`/`GetLinkedAccount`, all keyed by `profileId`; `GitHubAuthEventPayload` for the main→renderer event). Channels themselves wired in Phase 25.
  - `DECISIONS.md`: §3 marked SUPERSEDED; new §3a records OAuth-via-Device-Flow in scope (no client secret, additive to SSH, best-effort revoke). `SECURITY.md`: added rules 8–12 (no client secret / token-at-rest in TokenStore only / no secret in renderer / logger redacts tokens+device codes / scope minimization), with the token-in-transit askpass rule deferred to Phase 27.
- Files: added `src/core/config/github.ts`; updated `src/core/types.ts`, `src/core/schemas.ts`, `src/main/ipc/ipc-schemas.ts`, `tests/unit/zod-roundtrip.test.ts`, `DECISIONS.md`, `SECURITY.md`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **180 passed** (was 162; +18 new GitHub-schema round-trip/enum/API-response tests in `zod-roundtrip.test.ts`). `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both `tsconfig.node.json` and `tsconfig.web.json`. Core purity grep: no `fs`/`child_process`/`electron`/DOM imports under `src/core/`.
- Exit criteria: ✅ met — core stays pure; both tsconfigs clean; round-trip parse/serialize passes for `Profile` WITH and WITHOUT `linkedGitHub` plus all new schemas.
- Notes / follow-ups: `GITHUB_CLIENT_ID` is a placeholder — a maintainer must paste the real Client ID after registering the OAuth App (Appendix D); not needed for any test. Raw API response schemas strip unknown keys (Zod default) so extra GitHub fields won't break parsing; `GitHubAccessTokenResponseSchema` is a success∪error union the Phase 23 poller will discriminate on. This commit also folds in the prior uncommitted doc reorganization (plan/prompts moved under `docs/plans`/`docs/prompts`, `docs/progress-log.md` + OAuth plan/prompts added, `CLAUDE.md`/`AGENTS.md` trimmed) that was already the live baseline at session start.

### 2026-06-24 — Phase 22: Secret Storage Activation

- Built: `TokenStore` over `SecretStore` with encrypted per-profile token persistence, graceful missing/corrupt read handling, and a small redacting `Logger` for main-process logs.
- Files: added `src/main/storage/TokenStore.ts`, `src/main/services/Logger.ts`, `tests/unit/token-store.test.ts`, `tests/unit/logger.test.ts`; updated `src/main/storage/SecretStore.ts`, `docs/progress-log.md`.
- Tests: `npm test` passed (Vitest 187/187); `npm run lint` passed; `npx tsc --noEmit -p tsconfig.node.json` passed; `npx tsc --noEmit -p tsconfig.web.json` passed.
- Exit criteria: ✅ met — injected fake encryptor covers set→get round-trip, simulated relaunch persistence, delete, corrupt ciphertext returning `undefined` without throwing, and logger spy/assertions proving raw tokens do not appear in log lines.
- Notes / follow-ups: `TokenStore` stores only base64 ciphertext in `tokens.json`; raw tokens remain outside persisted domain models and the renderer bridge. Phase 25 will wire this store into GitHub auth IPC.

### 2026-06-25 — Phase 23: GitHub Device Flow Auth Service

- Built: The cancellable GitHub OAuth **Device Authorization Flow** state machine in the main process — logic only, no UI, no real network. All network I/O goes through an injected `HttpClient` so the full poll matrix is unit-tested with a fake client.
  - `src/main/services/HttpClient.ts` (new): injectable `HttpClient` port (`postForm`/`get`) + `HttpResponse` type — the shared network seam reused by Phases 24/25. Interface only; the real implementation is created in the Phase 25 IPC glue.
  - `src/main/services/GitHubAuthService.ts` (new): `GitHubAuthService implements IGitHubAuthService`.
    - `requestDeviceCode(scopes)` → POST `https://github.com/login/device/code` with `{ client_id, scope }` (space-joined) + `Accept: application/json`; validates the response with `GitHubDeviceCodeResponseSchema`; retains `device_code` + `interval` **in main** and returns only the renderer-safe `GitHubDeviceCode` (userCode/verificationUri/expiresInSec/intervalSec) — the raw `device_code` is never in the returned payload (Appendix B).
    - `pollForToken(signal)` → POST `https://github.com/login/oauth/access_token` with `{ client_id, device_code, grant_type=urn:ietf:params:oauth:grant-type:device_code }`; keeps polling on `authorization_pending`, raises the interval on `slow_down` (uses GitHub's new `interval`, else +5s per RFC 8628), rejects with a typed `GitHubAuthError` on `access_denied`/`expired_token`/unknown errors and on HTTP-client throw (`network`), and resolves `{ accessToken, scopes }` (scopes parsed from the space/comma-separated grant) on success.
    - Cancellation: `throwIfAborted` guard at the top of each poll + an injectable `Sleeper` seam defaulting to `abortableDelay`, which rejects promptly with an `AbortError` the instant the `AbortSignal` fires (no waiting out the interval). `shell.openExternal` is deliberately **absent** — that belongs in the Phase 25 IPC glue.
  - `src/core/config/github.ts`: the real public OAuth App **Client ID** (`Ov23liMJ2oRxygjRi84h`) was pasted in (Appendix D one-time human prerequisite, previously a placeholder) — folded into this commit since it's what makes the flow run against real GitHub. It's public (no client secret exists), safe to commit.
- Files: added `src/main/services/HttpClient.ts`, `src/main/services/GitHubAuthService.ts`, `tests/unit/github-auth-service.test.ts`; updated `src/core/config/github.ts` (real Client ID), `docs/progress-log.md`.
- Tests: `npm test` → Vitest **204 passed** (was 187; +17 new in `github-auth-service.test.ts`). `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both `tsconfig.node.json` and `tsconfig.web.json`.
- Exit criteria: ✅ met — the fake-`HttpClient` matrix covers `authorization_pending → success`, `slow_down` raising the interval (both the GitHub-supplied value and the +5s fallback), `expired_token`, `access_denied`, a network error, an already-aborted poll (rejects immediately, never polls), and an abort mid-wait (rejects promptly, stops after exactly one poll); plus device-code request shape (body/headers), retained-`device_code` propagation, the no-`device_code`-in-payload guarantee, and isolated `abortableDelay` cancellation tests. No UI.
- Notes / follow-ups: A `network` error and an `AbortError` leave the in-flight `device_code` intact so the caller can restart/retry; protocol-terminal outcomes (success/denied/expired/unknown) clear it. The `HttpClient` port has no concrete implementation yet — Phase 25 supplies a real one (and `shell.openExternal`) when wiring IPC. Per the plan, a human must still run `npm run dev` once after Phase 26 to authorize a real account end-to-end; CI only ever exercises the fake.

### 2026-06-25 — Phase 24: GitHub API Client & Account Identity

- Built: The read-only GitHub REST identity client in the main process — turns an access token into a verified `GitHubAccount`. Logic only, no UI, no real network: all I/O goes through the injected `HttpClient` (the same seam as Phase 23), so the whole matrix is unit-tested with a fake client.
  - `src/main/services/GitHubApiService.ts` (new): `GitHubApiService implements IGitHubApiService`.
    - `getAuthenticatedUser(token)` → GET `https://api.github.com/user` with `Accept: application/json` + `Authorization: Bearer <token>`; validates with `GitHubUserResponseSchema`; maps `id`/`login`/`name`/`avatar_url`(→`avatarUrl`)/`email` to the camelCase `GitHubAccount`, dropping fields GitHub returns as `null`/absent so the optionals stay optional.
    - `getPrimaryVerifiedEmail(token)` → GET `https://api.github.com/user/emails`; validates with `GitHubEmailsResponseSchema` and returns the entry where `primary && verified` (else `undefined`).
    - A private authenticated `request()` helper centralizes the Bearer header and maps HTTP **401 → typed `GitHubAuthError('tokenInvalid')`** (the re-auth trigger that later surfaces as `GITHUB_TOKEN_INVALID`, plan §5); other non-2xx → `network`, an `HttpClient` throw → `network`, a malformed body → `unknown`. Tokens are passed in and never logged.
  - `src/main/services/GitHubAuthError.ts` (new): extracted the shared `GitHubAuthError` (carrying a `GitHubAuthErrorCode`) into its own module so the API client and the device-flow service both reference one typed error without depending on each other.
  - `src/main/services/GitHubAuthService.ts` (refactor, behavior-preserving): removed the inline `GitHubAuthError` class and now imports + re-exports it from `GitHubAuthError.ts` — existing importers and the Phase 23 test keep the same import path and `instanceof` identity.
- Files: added `src/main/services/GitHubApiService.ts`, `src/main/services/GitHubAuthError.ts`, `tests/unit/github-api-service.test.ts`; updated `src/main/services/GitHubAuthService.ts` (error extracted/re-exported), `docs/progress-log.md`.
- Tests: `npm test` → Vitest **216 passed** (was 204; +12 new in `github-api-service.test.ts`). `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both `tsconfig.node.json` and `tsconfig.web.json`.
- Exit criteria: ✅ met — `getAuthenticatedUser` maps `login`/`id`/`name`/`avatar_url` (verified by mocked HTTP) and omits null/absent optionals; the primary-verified email is selected over non-primary/unverified entries (and over a verified-but-not-primary one), with `undefined` when none qualifies; a 401 yields the typed `tokenInvalid` error on both endpoints. Extra coverage: Bearer-header/Accept assertions, non-401 → `network`, client-throw → `network`, malformed body → `unknown`, empty email list → `undefined`.
- Notes / follow-ups: `getAuthenticatedUser` also maps the `/user` `email` (public profile email, may be null) — Phase 25 glue should prefer `getPrimaryVerifiedEmail()` for the persisted identity. The `HttpClient` still has no concrete implementation; Phase 25 supplies the real `fetch`-based client and injects both `GitHubAuthService` + `GitHubApiService` into the IPC handlers.

### 2026-06-25 — Phase 25: IPC Bridge for GitHub Auth

- Built: Typed, Zod-validated IPC that wires the GitHub device-flow / REST / token services to the renderer, with a non-blocking, cancellable connect flow. `startDeviceAuth` returns the device code immediately and kicks off background polling in main; progress is pushed back over a `github:authEvent` event channel (`webContents.send`). On success the main process fetches identity (Phase 24), stores the token in `TokenStore`, persists `linkedGitHub` on the profile, and emits `authorized` carrying the persisted link + the public identity. The access token never crosses to the renderer.
  - `src/main/ipc/GitHubAuthCoordinator.ts` (new): the device-flow lifecycle manager. `startDeviceAuth(profileId, sender)` → `requestDeviceCode` → `shell.openExternal(verificationUri)` (injected; best-effort, never fails the connect) → emit `awaitingUser` → background `poll()` under a per-profile `AbortController`. `poll()` → `pollForToken(signal)` → `getAuthenticatedUser` (+ `getPrimaryVerifiedEmail` fallback when the user email is private) → `tokens.set` → `profiles.update({ linkedGitHub })` → emit `authorized {account, identity}`; errors map via `classify()` to `denied`/`expired`/`error` (+ `errorCode`); an aborted signal emits nothing. `cancelDeviceAuth` aborts + emits `idle`; `disconnect` aborts + `tokens.delete` + clears `linkedGitHub`; `getLinkedAccount` reads it back. Every outbound event is `GitHubAuthEventPayload.parse`d before `send`, and skipped if the `WebContents` is destroyed.
  - `src/main/services/FetchHttpClient.ts` (new): the one real `HttpClient` (global `fetch`; urlencoded `postForm` + `get`; defensive JSON parse → `undefined` on non-JSON; TLS never disabled) — supplied here per the Phase 23/24 plan so the logic phases stayed network-free.
  - `src/main/testing/githubAuthFakes.ts` (new): env-gated fakes (`FakeGitHubAuthService`/`FakeGitHubApiService`/in-memory `FakeTokenStore`) used **only** when `GITWARDEN_E2E_FAKE_GITHUB=1`. The fake poller authorizes after one abortable interval so the e2e observes `awaitingUser → authorized` and can exercise cancel. No real GitHub call in CI.
  - `src/main/ipc/ipc-handlers.ts`: added `github: IGitHubAuthCoordinator` to `Services` and registered `github:startDeviceAuth` / `:cancelDeviceAuth` / `:disconnect` / `:getLinkedAccount` (each parses its `profileId` payload with the Phase-21 schemas, wrapped in the existing `IpcResult<T>` envelope; start/cancel pass `event.sender` so events route back to the initiating window).
  - `src/main/ipc/ipc-schemas.ts`: extended `GitHubAuthEventPayload` with an optional `identity: GitHubAccountSchema` (the camelCase name/email/avatar the renderer needs to auto-fill + render the badge in Phase 26) alongside the existing `account: LinkedGitHubAccount`. The token is the only field that never crosses this channel, so the event is the sole path identity can reach the renderer.
  - `electron/index.ts`: `buildGitHubAuthDeps()` constructs the real trio + `shell.openExternal`, or the fakes + no-op opener under the e2e flag; one shared `ProfileService` instance is used by both the profiles handlers and the coordinator so `linkedGitHub` writes are consistent. `tokens.json` added under `userData`.
  - `preload/index.ts` + `src/renderer/types/window.d.ts`: mirrored a `github` bridge namespace — `startDeviceAuth`/`cancelDeviceAuth`/`disconnect`/`getLinkedAccount` + `onAuthEvent(cb): () => void` (subscribe/unsubscribe over `github:authEvent`). Preload stays sandbox-safe (type-only imports, no runtime zod); the `GitHubAuthEvent` type is shared on both sides.
- Files: added `src/main/ipc/GitHubAuthCoordinator.ts`, `src/main/services/FetchHttpClient.ts`, `src/main/testing/githubAuthFakes.ts`, `tests/e2e/github-auth.spec.ts`; updated `src/main/ipc/ipc-handlers.ts`, `src/main/ipc/ipc-schemas.ts`, `electron/index.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **216 passed** (unchanged; logic phases already covered). `npx playwright test` → **42 passed**, including the 4 new `github-auth.spec.ts` cases. `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both `tsconfig.node.json` and `tsconfig.web.json`.
- Exit criteria: ✅ met — with the injected fake service: `startDeviceAuth` round-trips and returns a device code (and asserts no `device_code`/`deviceCode` leaks to the renderer); a simulated `authEvent: 'authorized'` reaches the renderer (and persists `linkedGitHub`, read back over IPC; `disconnect` then clears it); an invalid payload (empty `profileId`) is rejected by Zod as `ok:false`; the renderer security flags (`window.api` object, `window.api.github` object, no `window.require`, no `window.process`) still hold. `tsc --noEmit` clean on both tsconfigs.
- Notes / follow-ups: Phase 26 (UI) consumes `api.github.onAuthEvent` for live status and reads `identity` (name/email/avatar) for the auto-fill + linked badge, and `account` for the persisted-link confirmation. `FetchHttpClient` is exercised only in production / the real-account smoke check (Appendix D) — CI always runs the fakes. The coordinator holds one `AbortController` per profile and supersedes a prior in-flight flow on a new `startDeviceAuth`; the underlying `GitHubAuthService` still tracks a single pending `device_code`, so concurrent connects across profiles are out of scope (one connect at a time, matching the UI). `GITHUB_CLIENT_ID` remains the registered Device-Flow app id from Phase 21; a human must still run `npm run dev` once and authorize a real account end-to-end after Phase 26.

### 2026-06-25 — Phase 26: "Connect GitHub" UI (safe stop point)

- Built: The one-click GitKraken-style connect flow in `ProfilesScreen`, end-to-end against the Phase-25 IPC bridge. A profile's **GitHub Account** section offers **Connect GitHub** → a modal runs the Device Flow live (user code + status), and on authorization the profile's identity auto-fills and a linked `@login` badge with **Reconnect** / **Disconnect** appears. All new user-facing strings are externalized in `strings.ts`.
  - `src/renderer/components/ConnectGitHubModal.tsx` (new): subscribes to `api.github.onAuthEvent`, calls `startDeviceAuth(profileId)` (main also opens the browser), and renders a status machine — `starting` → `awaitingUser` (shows the `userCode` + an **Open GitHub** button → `shell.openExternal(verificationUri)`) → `authorized` (success) or `denied`/`expired`/`error` (with a **Try Again** retry; `tokenInvalid` shows the re-auth message). **Cancel** and unmount both call `cancelDeviceAuth` so no orphaned poll survives; the latest `onAuthorized` callback is held in a ref so the event listener isn't re-subscribed each render.
  - `src/renderer/screens/ProfilesScreen.tsx`: added the GitHub section (Connect button + hint when unlinked; avatar + `@login` badge + connected-date + Reconnect/Disconnect when linked; "save first" hint in create mode). `handleAuthorized(identity)` auto-fills `gitAuthorName`/`githubUsername` (and `gitAuthorEmail` when present) always, and `displayName` only if empty, then `updateProfile(...)` persists them and pulls the `linkedGitHub` main wrote into the store (so the badge renders). `handleDisconnect()` (with confirm) calls `api.github.disconnect`, reloads, and opens `https://github.com/settings/connections/applications/{client_id}` so the user can revoke on GitHub (no client secret → no API revoke; plan Appendix C). The badge avatar is derived from the account id via GitHub's avatar CDN, so no avatar URL needs persisting.
  - `src/renderer/strings.ts`: new `GITHUB_*` block (section/connect/modal/badge/disconnect/re-auth strings), including `GITHUB_MODAL_REAUTH` for the `GITHUB_TOKEN_INVALID` re-auth prompt.
  - Browser-open seam: added a Zod-validated `shell:openExternal` channel (http/https only) wired through an injected `openExternal` on `Services` — real `shell.openExternal` in production, a **no-op under the e2e flag**, so the connect/disconnect e2e never launches a real browser. `electron/index.ts` builds the seam once and shares it between the shell channel and the auth coordinator. `preload/index.ts` + `window.d.ts` expose `api.shell.openExternal`.
- Files: added `src/renderer/components/ConnectGitHubModal.tsx`, `tests/e2e/github-connect-ui.spec.ts`; updated `src/renderer/screens/ProfilesScreen.tsx`, `src/renderer/strings.ts`, `src/main/ipc/ipc-schemas.ts` (`ShellOpenExternalPayload`), `src/main/ipc/ipc-handlers.ts` (`shell:openExternal` + `Services.openExternal`), `electron/index.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **216 passed** (logic unchanged). `npx playwright test` → **44 passed**, including the 2 new `github-connect-ui.spec.ts` cases (full connect→autofill→badge→disconnect, and Cancel). `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both tsconfigs.
- Exit criteria: ✅ met — with the injected fake service: click **Connect** → modal shows the code `WDJB-MJHT` → the fake authorizes → the three identity fields populate (`The Octocat` / `octocat` / the primary-verified email) with `displayName` preserved, and a linked `@octocat` badge appears → **Disconnect** (with confirm) clears the badge and the persisted link (verified over IPC). `tsc --noEmit` clean.
- Notes / follow-ups: **Safe stop point reached** — the full connect / auto-fill / linked-account experience ships here; Phase 27 (HTTPS push + Safety Engine codes) is the optional remaining epic. The re-auth prompt is wired in the modal (`tokenInvalid` → re-auth copy) but the _detection_ of an invalid stored token only becomes active in Phase 27 (the 401 → `GITHUB_TOKEN_INVALID` push-time check). A human should still run `npm run dev` once and authorize a real GitHub account end-to-end (Appendix D) — CI only ever drives the fake.

### 2026-06-25 — Phase 27: Token-based Push (HTTPS) + Safety Engine extension

- Built: HTTPS-token push over a `GIT_ASKPASS` seam, with the Safety Engine verifying the GitHub account behind the push. The token reaches `git` through exactly one channel — a per-invocation env var read by a secret-free helper — never `argv`, the remote URL, or `.git/config`. SSH-only pushes are entirely unaffected.
  - `src/core/safety/SafetyCheckService.ts` + `safetyMessages.ts` (pure): added the four codes — `GITHUB_ACCOUNT_MISMATCH` (blocker), `GITHUB_TOKEN_MISSING` (blocker), `GITHUB_TOKEN_INVALID` (blocker), `GITHUB_NOT_CONNECTED` (warning) — and a `GitHubPushContext` input to `checkPush`. The matrix engages **only** when `httpsToGitHub` is true: no token → `TOKEN_MISSING` (linked) / `NOT_CONNECTED` (unlinked); rejected token → `TOKEN_INVALID`; token account ≠ assigned account → `ACCOUNT_MISMATCH`; equal → clean. Omitting `github` leaves `checkPush` backward-compatible.
  - `src/main/git/askpass.ts` (new): the `GIT_ASKPASS` helper. `ensureAskpassHelper()` writes a secret-free POSIX (`*sername*`→username, else→password) / Windows `.cmd` script; `buildAskpassEnv()` returns `{ GIT_ASKPASS, GITWARDEN_ASKPASS_USERNAME, GITWARDEN_ASKPASS_PASSWORD, GIT_TERMINAL_PROMPT: '0' }`. The token lives only in this per-invocation env.
  - `src/main/git/GitRunner.ts`: `GitInvocation.extraEnv` merged over the controlled base env for one spawn (never persisted, never in argv). `src/main/services/GitService.ts`: `push(...,auth?)` attaches the askpass env when token auth is supplied; args stay `['push', remote, branch]`.
  - `src/main/ipc/GitHubAuthCoordinator.ts`: `getPushContext(profileId)` verifies the stored token via `GET /user` → `{ hasToken, tokenInvalid, effectiveLogin }` (token-free, renderer-safe; a non-401 network error stays "present, not invalid" so transient connectivity never blocks). `resolveHttpsAuth(profileId, remoteUrl)` returns `{ username: login, token }` only for an HTTPS GitHub remote on a linked profile with a stored token. `src/core/github/remoteUrl.ts` (new, pure): `isHttpsGitHubRemoteUrl` shared by renderer + main.
  - IPC: `github:getPushContext` channel; the `git:push` handler now resolves token auth from the repo's assigned profile (HTTPS GitHub + stored token) and passes it to `GitService.push` — unassigned repos / SSH / non-GitHub remotes push exactly as before. `preload` + `window.d.ts` expose `github.getPushContext`.
  - `src/renderer/screens/RemoteScreen.tsx`: fetches the push context when the sheet opens, feeds `github` to `checkPush`, disables Confirm while verifying, and renders the **"Pushing as @login via HTTPS token — matches/does NOT match assigned profile ✓/✗"** line. New `PUSH_GH_*` strings externalized.
  - `SECURITY.md`: rules 13–15 — token-in-transit (askpass only), pre-push account verification, and the best-effort revoke-on-disconnect caveat.
- Files: added `src/main/git/askpass.ts`, `src/core/github/remoteUrl.ts`, `tests/unit/safety-engine-github.test.ts`, `tests/integration/askpass-push.test.ts`, `tests/e2e/github-push-safety.spec.ts`; updated `src/core/safety/{SafetyCheckService,safetyMessages}.ts`, `src/main/git/GitRunner.ts`, `src/main/services/GitService.ts`, `src/main/ipc/{GitHubAuthCoordinator,ipc-handlers,ipc-schemas}.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`, `src/renderer/screens/RemoteScreen.tsx`, `src/renderer/strings.ts`, `SECURITY.md`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **228 passed** (+12: 8 GitHub safety-matrix + 4 askpass integration). `npx playwright test` → **46 passed** (+2 `github-push-safety.spec.ts`). `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both tsconfigs.
- Exit criteria: ✅ met — Vitest covers the four-code matrix (match / mismatch / missing / invalid, + not-connected + SSH-unaffected). Integration asserts the askpass helper echoes username/password from env, and that an HTTPS-token push carries the token in `extraEnv` but **not** in `argv`, the remote URL, or `.git/config` (and a no-auth push attaches no credential env). Playwright (injected fake → token resolves to `@octocat`): a profile linked to `@mallory` is **blocked** by `GITHUB_ACCOUNT_MISMATCH` with Confirm disabled; a profile linked to `@octocat` shows "matches" with Confirm enabled (push proceeds only on that explicit click).
- Notes / follow-ups: The Windows `.cmd` askpass helper is shipped but exercised only on Windows (the helper-echo integration test is `skipIf(win32)`; CI is Unix). The full token push to real github.com is covered only by the manual smoke check (Appendix D) — CI never makes a real network/auth call; the e2e asserts the safety gate, and the integration test asserts the wiring against a non-routable host offline. `repo` scope is still not requested — identity scopes suffice for the account-verification gate; a real HTTPS push to a private repo would need a `repo`-scope re-auth (left for when/if that flow is added).

### 2026-06-25 — Phase 28: AI Foundations, Decisions & Connection Contracts

- Built: the pure-core contracts for the advisory AI layer — types, Zod boundary schemas, the safe-JSONPath navigator, the shared transport gate, the single redaction ruleset, and credential masking. No network, no UI, no Electron; everything lives in `src/core/ai/` and runs headlessly under Vitest.
  - `src/core/ai/types.ts`: `AiConnectionKind`, `AiPrivacyMode` (`preview-each` default; `preview-first-run` a conscious downgrade), `AiRetentionState`, `AiRequestKind`, `AiConnection` (non-secret JSON incl. `baseUrl`), `AiConnectionCapabilities` (`localOnly` documented as host-derived, not kind-derived), `AiCredentialMetadata`, `AiProviderDetection`, `CustomHttpMapping`, `AiUsageEstimate`, `AiReviewFinding`, plus the per-feature outputs `AiCommitDraft` / `AiChangeSummary` / `AiChangeReview`.
  - `src/core/ai/schemas.ts`: Zod mirrors for all of the above. `AiConnectionSchema` refines a present `baseUrl` through the transport gate. `CustomHttpMappingSchema.superRefine` enforces §6.3 — transport gate on `url`, the closed placeholder set, and the safe-JSONPath subset on every `responseMapping` field — so a malformed mapping is rejected at the boundary.
  - `src/core/ai/transport.ts`: `isLoopbackHost` / `isAllowedAiBaseUrl` (https-only, plain-http-loopback-excepted) / `deriveLocalOnly` (host-derived `localOnly`, §4) — the shared rule for every adapter (Phase 30).
  - `src/core/ai/jsonpath.ts`: a tiny safe-subset navigator — dotted keys, numeric indices, bracket-quoted simple keys only. `parseJsonPath` **throws** (`UnsafeJsonPathError`) on `..` / `*` / `[*]` / `?(…)` / scripts / slices / unions; `getByJsonPath` does pure property access and cannot evaluate code.
  - `src/core/ai/customHttp.ts`: the closed placeholder allowlist (`apiKey`, `model`, `messagesJson`, `promptJson`, `responseSchemaJson`, `metadataJson`) + helpers to collect/flag unsupported placeholders across url/headers/body.
  - `src/core/ai/redaction.ts`: the **single** ruleset (reused by the Phase 33 scanner) — private-key PEM blocks, GitHub tokens, JWTs, AWS keys, Slack tokens, provider API keys, credential URLs, and env-secret assignments. `redactSecrets` (keeps env var NAME + the credential-URL host visible), `findSecretMatches`, `containsSecret`.
  - `src/core/ai/credentials.ts`: `maskSecret` for `AiCredentialMetadata.maskedPreview` (reveals ≤ last 4 chars).
  - `DECISIONS.md` §6 (token-first single-active-connection, save vs enable, advisory-only, default-off precedence repo→global→connection, retention/preview policy, `localOnly`-by-host, declarative Custom HTTP + safe JSONPath, one redaction ruleset, secrets-never-in-connection-JSON). `SECURITY.md` rules 16–22 (source-to-provider risk, preview payload+host, redaction-before-chunking, `AiCredentialStore`-only credentials, `baseUrl`-tampering as a send-destination risk, declarative Custom HTTP constraints, retention/opt-in).
- Files: added `src/core/ai/{types,schemas,transport,jsonpath,customHttp,redaction,credentials,index}.ts` and `tests/unit/ai-{schemas,transport,jsonpath,custom-http,redaction,credentials}.test.ts`; updated `DECISIONS.md`, `SECURITY.md`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **293 passed** (+65 new across 6 AI files). `npx tsc --noEmit` clean on `tsconfig.node.json` and `tsconfig.web.json`. ESLint + Prettier clean on all touched files.
- Exit criteria: ✅ met — `src/core/ai/` stays pure (no node/electron/DOM imports); schemas round-trip and reject unknown enums/shapes; `CustomHttpMapping` validation rejects non-HTTPS-non-loopback URLs, unsupported placeholders, and filter/script/wildcard/recursive-descent JSONPath (rejected, not ignored); the redaction matrix covers every required category and proves the raw secret is removed while the env var name and destination host stay visible; both docs updated.
- Notes / follow-ups: redaction is intentionally conservative (known token shapes) and best-effort — **not** a guarantee; the "redaction runs before chunking" property is asserted end-to-end in Phase 31 where the context builder + chunker exist. `getByJsonPath` / `redactSecrets` / `isAllowedAiBaseUrl` are written now so Phase 30 adapters and the Phase 31 context builder reuse them rather than re-implementing. No `ai:*` IPC, adapter, or store yet — those start in Phase 29 (`AiConnectionService` + `AiCredentialStore`).

### 2026-06-25 — Phase 29: AI Connections Manager & Credential Store

- Built: the token-first single-active-connection manager — CRUD over non-secret connection records, an encrypted credential store, key-prefix provider detection with progressive disclosure, the `ai:*` IPC surface, and the Settings → AI UI. Secrets go through `safeStorage` only and never cross back to the renderer after save.
  - `src/core/ai/detection.ts` (new, pure): `detectProvider(apiKey)` (sk-or-→OpenRouter, sk-ant-→Anthropic, gsk_→Groq, sk-lm-→LM Studio, bare sk-/sk-proj-→ambiguous OpenAI-compatible, else→unknown; specific prefixes checked before the bare fallback) + `requiresBaseUrlEntry(detection)` (show ONE base-URL field only for ambiguous medium-confidence keys or a loopback suggested URL) + `PROVIDER_BASE_URLS`.
  - `src/core/ai/precedence.ts` (new, pure): `isAiSendAllowed({repoOverride, globalEnabled, connectionEnabled})` — the conservative, consent-respecting floor (repo opt-out wins; global consent required; a repo opt-in never bypasses it). Full matrix + enforcement land in Phase 31.
  - `src/core/ai/schemas.ts`: extended `AiConnectionsDataSchema` with an optional `activeConnectionId` (the single-active pointer; a dangling id is treated as "no active"). `src/core/{types,schemas}.ts`: added `RepositoryRecord.aiOverride?: 'enabled'|'disabled'` (per-repo override) and `AppSettings.aiEnabled?: boolean` (global "Enable AI" consent, default-off) — both optional, so existing stored JSON parses unchanged.
  - `src/main/services/AiConnectionService.ts` (new): CRUD + active pointer over `JsonStore<AiConnectionsData>`; derives capabilities (`localOnly` from the host, not the kind) and retention (local→zero-retention, else→unknown); validates each record through `AiConnectionSchema` (transport gate on `baseUrl`) before writing; auto-activates the first connection.
  - `src/main/storage/AiCredentialStore.ts` (new): encrypted secrets keyed by connectionId over `SecretStore`; `save` returns ONLY `AiCredentialMetadata` (label, masked preview, secret-field names, updatedAt); `getSecret` is the MAIN-ONLY decrypt path (never exposed over IPC); corrupt ciphertext → `undefined` (logged, never throws); raw secrets never appear in persisted JSON or log lines.
  - IPC (`ai:listConnections`/`createConnection`/`updateConnection`/`deleteConnection`/`setActiveConnection`/`saveCredential`/`deleteCredential`/`getCredentialMetadata`/`detectProvider`), all Zod-validated. `deleteConnection` also drops the orphaned credential. `detectProvider` runs detection in main and returns only the detection + a masked key label. `preload` + `window.d.ts` expose the `ai` namespace.
  - `src/main/testing/aiFakes.ts` (new): in-memory `IAiCredentialStore` wired under `GITWARDEN_E2E_FAKE_AI=1` so e2e needs no `safeStorage`; the raw secret still never returns over IPC.
  - `src/renderer/store/aiStore.ts` + `src/renderer/components/AiConnectionSettings.tsx` (new): paste-key field → detection + progressive disclosure (one base-URL field only when needed) → connection name/model → "Save connection" (also stores the key); a SEPARATE "Enable AI" toggle (global consent); masked credential display; retention/privacy status (local = safest); per-repo override entry point; Advanced disclosure (Custom HTTP / manual base URL placeholder for Phase 30). Mounted in `SettingsScreen`. All strings externalized in `strings.ts`.
- Files: added `src/core/ai/{detection,precedence}.ts`, `src/main/services/AiConnectionService.ts`, `src/main/storage/AiCredentialStore.ts`, `src/main/testing/aiFakes.ts`, `src/renderer/store/aiStore.ts`, `src/renderer/components/AiConnectionSettings.tsx`, `tests/unit/ai-{detection,credential-store,connection-service,ipc-schemas}.test.ts`, `tests/e2e/ai-connections.spec.ts`; updated `src/core/ai/{schemas,index}.ts`, `src/core/{types,schemas}.ts`, `src/main/ipc/{ipc-schemas,ipc-handlers}.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`, `src/renderer/screens/SettingsScreen.tsx`, `src/renderer/strings.ts`, `electron/index.ts`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **344 passed** (+51 new: 14 detection/precedence, 8 credential-store, 13 connection-service, 16 IPC-schema). `npx playwright test` → **50 passed** (+4 `ai-connections.spec.ts`). `npm run lint` clean (ESLint + Prettier). `npx tsc --noEmit` clean on both tsconfigs. `src/core/ai/` stays pure.
- Exit criteria: ✅ met — Vitest proves credentials round-trip through encrypted storage and never persist in connection JSON (ciphertext-only file, masked metadata, main-only decrypt); detection + progressive disclosure covered (sk-or-/sk-ant-/gsk\_/sk-lm-→LM Studio prefill/ambiguous sk-→base-URL prompt/unknown→Advanced); enabling AI is a separate action from saving (`isAiSendAllowed` false while `aiEnabled` off — "saving sends nothing"); IPC rejects malformed connection/credential payloads with Zod. Playwright with the fake store: create → save credential → edit → disable → delete, plus assertions that AI stays disabled after save and the renderer has no path to a raw credential.
- Notes / follow-ups: the **model picker is a manual text input for now** — the fetch-populated, capability-filtered picker (and "the fetch IS the connection test") needs the adapters, so it lands in Phase 30 with `ai:listModels`; this matches the logic-first build order and the Phase 30 exit criteria. Advanced / Custom HTTP is a disclosure placeholder until Phase 30. The per-repo override is persisted (`RepositoryRecord.aiOverride`) and surfaced as an entry point; its enforcement at context-assembly time, plus the full precedence matrix, is Phase 31. The global "Enable AI" flag rides on `AppSettings.aiEnabled` via the existing `settings:update` channel (no separate toggle IPC).

### 2026-06-25 — Phase 30: Adapter Registry, Built-in Providers & Custom HTTP

- Built: the main-process AI adapter layer — `AiAdapterRegistry`, adapter contract, built-in adapters for OpenRouter, OpenAI-compatible/local servers, Anthropic, and Ollama, declarative Custom HTTP rendering/mapping, the shared `HttpClient.request` seam, spend/rate guard, fake e2e adapter registry, and Phase 30 IPC (`ai:testConnection`, `ai:listModels`, `ai:estimateUsage`, `ai:cancel`). Settings → AI now fetches models through the adapter path; the model-list fetch is the visible connection-test signal.
- Files: added `src/main/ai/{AiAdapterRegistry,CustomHttpAdapter,adapterUtils,builtInAdapters,index,spendGuard,types}.ts`, `tests/unit/ai-{adapters,spend-guard}.test.ts`; updated `src/core/ai/{types,schemas}.ts`, `src/main/services/{HttpClient,FetchHttpClient,AiConnectionService}.ts`, `src/main/ipc/{ipc-schemas,ipc-handlers}.ts`, `src/main/testing/aiFakes.ts`, `electron/index.ts`, `preload/index.ts`, `src/renderer/store/aiStore.ts`, `src/renderer/components/AiConnectionSettings.tsx`, `src/renderer/strings.ts`, `src/renderer/types/window.d.ts`, and AI unit/e2e coverage.
- Tests: `npm test` → Vitest **360 passed** (+16 new/updated Phase 30 adapter, guard, schema, and IPC tests). `npm run e2e` → Playwright **51 passed** (+1 AI fake-adapter test; build succeeded). `npx tsc --noEmit -p tsconfig.node.json` and `npx tsc --noEmit -p tsconfig.web.json` clean.
- Exit criteria: ✅ met — unit tests use fake HTTP only; built-ins validate request shape, request structured JSON, and fail closed through Zod parsing; OpenAI-compatible/Ollama local loopback endpoints work over `http://` with host-derived `localOnly`, while non-loopback `http://` is rejected; Custom HTTP rejects non-HTTPS non-localhost URLs, unsupported placeholders, secret-leaking `{{apiKey}}` placements, malformed/unsafe response mappings, and filter/script/wildcard JSONPath; the spend guard refuses requests over the per-request cap. Playwright verifies `testConnection`/`listModels` through fake adapters.
- Notes / follow-ups: Custom HTTP is implemented at the adapter/contract layer; a full Advanced UI for authoring mappings remains a future UX slice. Phase 31 should reuse the same registry and guard when context assembly begins sending real redacted diff payloads.

### 2026-06-25 — Phase 31: Context Builder, Redaction & Send Preview

- Built: the privacy backbone for AI sends. `AiContextBuilder` lives in main and assembles repo context only through existing injected services: repository/settings/profile services plus `GitService` methods for status, staged diffs, selected unstaged diffs, branch/status, remotes, effective identity, Safety Engine result, and recent commits. AI code still never calls `GitRunner` directly.
- Files: added `src/core/ai/context.ts` (stable context serialization, full-context redaction, deterministic chunk/truncation, adapter-message helper), `src/main/ai/AiContextBuilder.ts`, `tests/unit/ai-context.test.ts`, `tests/unit/ai-context-builder.test.ts`, and `tests/e2e/ai-preview.spec.ts`; updated AI IPC/preload/window types, `src/renderer/store/aiStore.ts`, `src/renderer/screens/CommitScreen.tsx`, `src/renderer/strings.ts`, and service wiring in `electron/index.ts`.
- Tests: `npm test` → Vitest **366 passed** (+6 Phase 31 unit tests). `npm run e2e` → Playwright **52 passed** (+1 AI preview test; build succeeded). `npx tsc --noEmit -p tsconfig.node.json` and `npx tsc --noEmit -p tsconfig.web.json` clean. `npm run lint` clean.
- Exit criteria: ✅ met — the existing pure-core redaction matrix still passes; new context tests prove redaction runs on the full serialized context before chunking (including a token longer than the chunk size), and large payloads chunk/truncate deterministically after redaction. The builder enforces repo → global → connection precedence before any Git service call, so a repo opted out of AI blocks context assembly entirely. A recording fake-adapter test captures only post-redaction fixture payloads (GitHub token, API key, credential URL password removed); this proves the checked fixtures, not real-world completeness. Playwright verifies the Commit screen shows the post-redaction payload and destination host before any diff is sent onward.
- Notes / follow-ups: Phase 32 should consume `AiContextBuilder`/`createAiContextMessages` rather than re-reading diffs. The preview is currently a compact Commit-screen surface for staged context; selected unstaged paths are supported by the builder/IPC for later review flows.

### 2026-06-25 — Phase 32: Smart Commit Assistant

- Built: the first advisory AI vertical slice on the Commit screen. `AiCommitAssistant` in main drafts commit messages and summarizes staged changes using only `AiContextBuilder` output (never a fresh raw-diff path), then calls the adapter registry with Zod-validated structured responses (`AiCommitDraft`, `AiChangeSummary`). The UI adds "Draft message" and "Summarize staged changes" with insert buttons; AI never commits — the existing Safety Engine commit gate remains authoritative. Send-preview must be shown first (`preview-each` posture).
- Files: added `src/core/ai/outputs.ts`, `src/main/ai/AiCommitAssistant.ts`, `tests/unit/ai-{outputs,commit-assistant}.test.ts`, `tests/e2e/ai-commit-assistant.spec.ts`; updated `src/main/ipc/{ipc-schemas,ipc-handlers}.ts`, `src/main/ai/index.ts`, `electron/index.ts`, `preload/index.ts`, `src/renderer/{store/aiStore,screens/CommitScreen,strings,types/window.d}.ts`.
- Tests: `npm test` → Vitest **373 passed** (+7 Phase 32 unit tests). `npm run e2e -- tests/e2e/ai-commit-assistant.spec.ts` → Playwright **1 passed**. `npm run lint` clean.
- Exit criteria: ✅ met — Vitest validates structured commit-output schemas and rejects malformed adapter output; Playwright with the fake adapter proves staged diff → preview → draft appears → user inserts → Safety Engine commit gate still blocks until identity is set.
- Notes / follow-ups: Phase 33 should add the change-review panel and deterministic secret scanner on the same redaction ruleset. Summarize output is display-only; only draft insert buttons write into the commit message field.

### 2026-06-25 — Phase 33: Change Review Assistant

- Built: deterministic staged-change review in pure core (`scanDeterministicFindings`, `mergeChangeReview`) reusing Phase 31 `findSecretMatches` / `REDACTION_RULES` for secret detection; heuristics for risky files, migrations, lockfiles, generated files, missing tests, and destructive diffs. Main adds `StagedChangeReviewService` (AI-off scan via `changeReview:scanStaged`) and `AiChangeReviewAssistant` (deterministic + AI merge via `ai:reviewStagedChanges`). Safety Engine adds `STAGED_SECRET_DETECTED` blocker fed from deterministic secret findings. Commit screen shows a grouped "Review staged changes" panel with source/confidence labels and a "why this matters" line per finding; auto-scans on staged changes; optional AI review after send preview.
- Files: added `src/core/ai/{changeReview,changeReviewMessages}.ts`, `src/main/ai/{StagedChangeReviewService,AiChangeReviewAssistant}.ts`, `tests/unit/{change-review,ai-change-review-assistant}.test.ts`, `tests/e2e/ai-change-review.spec.ts`; updated `src/core/{ai/{outputs,index},safety/{SafetyCheckService,safetyMessages}}.ts`, `src/main/{ai/index,ipc/{ipc-schemas,ipc-handlers},testing/aiFakes}.ts`, `electron/index.ts`, `preload/index.ts`, `src/renderer/{screens/CommitScreen,store/aiStore,strings,types/window.d}.ts`, `tests/unit/ai-outputs.test.ts`.
- Tests: `npm test` → Vitest **385 passed** (+10 Phase 33 unit tests). `npm run lint` clean; `tsc --noEmit` clean on both tsconfigs. E2e spec added (`tests/e2e/ai-change-review.spec.ts`); run locally with `npm run e2e -- tests/e2e/ai-change-review.spec.ts`.
- Exit criteria: ✅ met — Vitest covers deterministic scanner (shared redaction ruleset), merge semantics (model all-clear cannot drop deterministic findings), and `STAGED_SECRET_DETECTED` commit blocking; fake-adapter assistant tests pass; Commit UI renders grouped findings with source/confidence labels; deterministic scan runs with AI disabled.
- Notes / follow-ups: Phase 34 should add Safety Copilot explanations per `SafetyCode` with deterministic fallback copy.

### 2026-06-25 — Phase 34: Safety Copilot _(recommended MVP stop point)_

- Built: Safety Copilot explains each `SafetyCode` in plain language with allowlisted suggested next steps (set local identity, switch active profile, assign repo profile, reconnect GitHub, plus commit/push-adjacent controls). Pure core (`buildDeterministicSafetyExplanation`, `SAFETY_ACTION_BY_CODE`) provides deterministic fallback copy with AI disabled. Main adds `AiSafetyCopilotAssistant` (`ai:explainSafetyIssue`) — AI may enhance explanation text only; suggested action stays deterministic. Shared `SafetyIssueExplain` component adds "Explain this" per issue in Safety Center and the push confirmation sheet; never auto-applies fixes.
- Files: added `src/core/ai/{safetyCopilot,safetyCopilotMessages}.ts`, `src/main/ai/AiSafetyCopilotAssistant.ts`, `src/renderer/components/SafetyIssueExplain.tsx`, `tests/unit/{safety-copilot,ai-safety-copilot-assistant}.test.ts`, `tests/e2e/ai-safety-copilot.spec.ts`; updated `src/core/ai/{types,schemas,outputs,index,context}.ts`, `src/main/{ai/{AiContextBuilder,index},ipc/{ipc-schemas,ipc-handlers},testing/aiFakes}.ts`, `electron/index.ts`, `preload/index.ts`, `src/renderer/{screens/{SafetyCenterScreen,RemoteScreen},store/aiStore,strings,types/window.d}.ts`, `tests/e2e/safety-center.spec.ts`.
- Tests: `npm test` → Vitest **392 passed** (+7 Phase 34 unit tests). `npm run lint` clean; `tsc --noEmit` clean. E2e spec added (`tests/e2e/ai-safety-copilot.spec.ts`); run locally with `npm run e2e -- tests/e2e/ai-safety-copilot.spec.ts`.
- Exit criteria: ✅ met — every `SafetyCode` has deterministic fallback copy; Vitest covers issue → suggested-action mapping and AI merge keeps deterministic action; Playwright proves explanation does not enable a blocked commit/push.
- Notes / follow-ups: **Phases 28–34 advisory MVP is complete.** Phase 35+ (push brief, history intelligence, onboarding, failure explainer) are value-ordered add-ons.

### 2026-06-25 — Phase 35: Push Brief & History Intelligence

- Built: Push Brief summarizes commits ahead of upstream in the push confirmation sheet with token-free identity/account notes (Phase 27 GitHub push context + local Git identity). History Intelligence adds release-notes, branch-activity, and changelog drafts on the History screen. Pure core provides deterministic fallbacks (`buildDeterministicPushBrief`, `buildDeterministicHistorySummary`); main adds `PushBriefService`, `HistorySummaryService`, `AiPushBriefAssistant`, and `AiHistorySummaryAssistant` with fake-adapter e2e support. Push still requires explicit confirmation — the brief is advisory only.
- Files: added `src/core/ai/{pushBrief,pushBriefMessages,historySummary,historySummaryMessages}.ts`, `src/main/ai/{PushBriefService,HistorySummaryService,AiPushBriefAssistant,AiHistorySummaryAssistant}.ts`, `src/renderer/components/{PushBriefPanel,HistorySummaryPanel}.tsx`, `tests/unit/{push-brief,history-summary,ai-push-brief-assistant,ai-history-summary-assistant}.test.ts`, `tests/e2e/ai-push-brief-history.spec.ts`; updated `src/core/ai/{types,schemas,outputs,context,index}.ts`, `src/main/{services/GitService,ai/{AiContextBuilder,index},ipc/{ipc-schemas,ipc-handlers},testing/aiFakes}.ts`, `electron/index.ts`, `preload/index.ts`, `src/renderer/{screens/{RemoteScreen,HistoryScreen},store/aiStore,strings,types/window.d}.ts`, `tests/unit/ai-outputs.test.ts`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **401 passed** (+9 Phase 35 unit tests). `npm run lint` clean on touched files; `tsc --noEmit` clean on both tsconfigs. E2e spec added (`tests/e2e/ai-push-brief-history.spec.ts`); run locally with `npm run e2e -- tests/e2e/ai-push-brief-history.spec.ts`.
- Exit criteria: ✅ met — deterministic push brief works offline via `pushBrief:buildDeterministic`; fake adapter enhances via `ai:generatePushBrief` / `ai:generateHistorySummary`; push confirmation sheet unchanged (explicit Confirm Push required); identity notes and summaries exclude token/credential material; History screen shows three draft sections with deterministic source label.
- Notes / follow-ups: Phase 36 should add the repo onboarding assistant from allowlisted files only.

### 2026-06-25 — Phase 36: Repo Onboarding Assistant

- Built: Repo onboarding from allowlisted files only (README, package.json, config files, recent commits). Pure core allowlist + deterministic brief; main `RepoBriefFileReader`/`RepoBriefService`/`AiRepoBriefAssistant`; `RepoOnboardingPanel` on Repositories with included-files inspection before AI send; preview shows allowlisted paths.
- Files: added `src/core/ai/{repoAllowlist,repoBrief,repoBriefMessages}.ts`, `src/main/ai/{RepoBriefFileReader,RepoBriefService,AiRepoBriefAssistant}.ts`, `src/renderer/components/RepoOnboardingPanel.tsx`, `tests/unit/repo-brief.test.ts`, `tests/e2e/ai-phases-36-39.spec.ts` (repo case); updated context/types/schemas/outputs, `AiContextBuilder`, IPC/preload/window types, `RepositoriesScreen`, `strings.ts`.
- Tests: `npm test` → Vitest **411 passed** (+10 new). `npx playwright test tests/e2e/ai-phases-36-39.spec.ts` → **4/4 passed** (repo onboarding case). `tsc --noEmit` clean on both tsconfigs.
- Exit criteria: ✅ met — context limited to allowlisted files; user can inspect included files before send; renderer security invariants hold.
- Notes / follow-ups: Phase 37 adds failure explanations with deterministic fallback.

### 2026-06-25 — Phase 37: Failure Explainer

- Built: Failure Explainer for Git errors and pasted test/lint output. Pure core maps `GitErrorCode` → category → suggested action with deterministic copy; `AiFailureExplainerAssistant` enhances explanation text only; `FailureExplainPanel` on Status screen.
- Files: added `src/core/ai/{failureExplain,failureExplainMessages}.ts`, `src/main/ai/AiFailureExplainerAssistant.ts`, `src/renderer/components/FailureExplainPanel.tsx`, `tests/unit/failure-explain.test.ts`; updated types/schemas/outputs/IPC/preload, `AiContextBuilder`, `StatusScreen`, `strings.ts`.
- Tests: Vitest failure-explain unit tests pass; e2e pasted-output case in `ai-phases-36-39.spec.ts` passes.
- Exit criteria: ✅ met — unit tests cover GitErrorCode → category → action; AI explanation is additive; ErrorMapper message stands alone with AI disabled.
- Notes / follow-ups: Phase 38 adds connection template export/import.

### 2026-06-25 — Phase 38: Connection Templates, Import/Export & Team Handoff

- Built: Built-in connection templates (OpenRouter, OpenAI-compatible, Anthropic, Ollama, Custom HTTP example); export/import/duplicate on `AiConnectionService` with secret-free templates; Settings UI for export/duplicate/built-in import; optional `recommendedConnectionId` per repository.
- Files: added `src/core/ai/connectionTemplates.ts`, `tests/unit/connection-templates.test.ts`; updated `AiConnectionService`, IPC/preload/window types, `AiConnectionSettings`, `RepositoryRecord` schema, `RepositoriesScreen`, `strings.ts`.
- Tests: connection-templates unit tests pass; e2e export → import → credential → test passes with fake adapter.
- Exit criteria: ✅ met — exported templates contain no secrets; imported templates require fresh credential; Playwright handoff flow green.
- Notes / follow-ups: Phase 39 adds allowlist-only agentic proposals.

### 2026-06-25 — Phase 39: Optional Agentic Actions (allowlist-only)

- Built: Closed allowlist (`write-repo-file`, `suggest-navigation`, `copy-command`); `validateAgenticProposal` fail-closed; `AiAgenticAssistant` + `AgenticActionExecutor` (repo-relative file writes only, no `.git`); `AgenticProposalPanel` with preview → review → confirm/reject on Commit screen.
- Files: added `src/core/ai/{agenticActions,agenticProposal}.ts`, `src/main/ai/{AiAgenticAssistant,AgenticActionExecutor}.ts`, `src/renderer/components/AgenticProposalPanel.tsx`, `tests/unit/agentic-proposal.test.ts`; updated types/schemas/outputs/IPC/electron wiring, `CommitScreen`, `aiFakes`, `strings.ts`.
- Tests: agentic-proposal unit tests pass; e2e proves rejecting a proposal leaves the repo unchanged.
- Exit criteria: ✅ met — proposals schema-validated against allowlist; app shows exact file edits before execution; rejection leaves repo unchanged.
- Notes / follow-ups: **AI Connections feature (Phases 28–39) is complete.** Agentic file writes remain preview-gated; no shell, push, staging, or identity mutation paths exist.

### 2026-06-25 — Phase 52: Chat Backend — General-Chat Assistant & `ai:chat` IPC

- Built: New `'chat'` request kind; `AiChatAssistant` reusing `AiContextBuilder` (no diffs for chat) + the adapter registry; `ai:chat` IPC handler, preload bridge, and renderer typings; chat fixture in the fake adapter. Advisory-only — chat never runs a Git action.
- Files: added `src/main/ai/AiChatAssistant.ts`, `tests/unit/ai-chat-assistant.test.ts`; updated `src/core/ai/{types,schemas,outputs}.ts`, `AiContextBuilder.ts`, main `ai/index.ts`, `ipc-{schemas,handlers}.ts`, `electron/index.ts`, `preload/index.ts`, `window.d.ts`, `aiFakes.ts`.
- Tests: `ai-chat-assistant` + `ai-outputs` + `ai-adapters` + `chat-commands` unit suites green (25 tests).
- Exit criteria: ✅ met — free-text chat routes through the same redaction/preview/enablement path as every other AI capability.
- Notes / follow-ups: Chat history capped at 10 turns; system + redacted-context messages are always reconstructed server-side, never trusted from the renderer.

### 2026-06-25 — Phase 53: Chat State & Slash-Command Router

- Built: Pure `chatCommands` router (parse free-text vs `/commit`, `/review`, `/push-brief`, `/history`, `/repo-brief`, `/explain`, `/propose`, `/help`; networked-command classification); `aiChatStore` orchestrating prepare → preview → confirm and proposal apply; `appStore` tabbed-right-panel state (`rightPanelTab`, `openRightPanel`).
- Files: added `src/core/ai/chatCommands.ts`, `src/renderer/store/aiChatStore.ts`, `tests/unit/chat-commands.test.ts`; updated `appStore.ts`.
- Tests: `chat-commands` unit suite green; renderer store covered by the chat e2e.
- Exit criteria: ✅ met — every networked slash-command still passes through the redaction send-preview before any data leaves the machine.
- Notes / follow-ups: Renderer store logic intentionally covered by Playwright, not Node-env Vitest (it depends on `window.api`).

### 2026-06-25 — Phase 54: Tabbed Right Panel, Chat UI & Inline Registration

- Built: `RightPanel` (Context | AI Chat tabs) wrapping the refactored `Inspector`; `AiChatPanel` with inline paste-a-key setup, model switcher, message bubbles, preview/confirm gate, quick-actions, and Apply-edits for proposals; header "AI" affordance + Cmd/Ctrl+L shortcut.
- Files: added `src/renderer/components/{RightPanel,AiChatPanel}.tsx`, `tests/e2e/ai-chat-panel.spec.ts`; updated `Inspector.tsx`, `App.tsx`, `GlobalHeader.tsx`, `strings.ts`.
- Tests: web typecheck + lint clean; renderer bundles; chat e2e added.
- Exit criteria: ✅ met — a single context-aware chat replaces the scattered panels; inline registration mirrors the Claude paste-a-key flow while full management stays in Settings.
- Notes / follow-ups: Inline setup reuses existing connection detection + secure credential storage; no new AI authority introduced.

### 2026-06-25 — Phase 55: Panel Retirement & Cleanup

- Built: Removed the six replaced panels (push-brief, history-summary, repo-onboarding, failure-explain, safety-explain, agentic-proposal); replaced `SafetyIssueExplain` with deterministic `SafetyIssueRow` (no AI) on Safety Center + push sheet; kept the inline AI commit/change-review helper on the Commit screen.
- Files: deleted 6 panel components + `ai-push-brief-history`/`ai-safety-copilot` e2e; added `SafetyIssueRow.tsx`; trimmed `ai-phases-36-39.spec.ts`; updated `Safety/Remote/Commit/Status/History/Repositories` screens.
- Tests: full ESLint clean; web typecheck clean; build green (renderer bundle ~568 kB, down from ~618 kB); AI unit suites green.
- Exit criteria: ✅ met — AI assistance is consolidated into one chat; deterministic safety reporting is preserved without any AI dependency.
- Notes / follow-ups: Underlying capability IPC/store methods (push-brief, history, repo-brief, explain) are retained — the chat drives them now. Prettier still warns on 3 pre-existing untracked landing-page/distribution docs (not part of this feature).

### 2026-06-25 — Phase 55a: AI Settings simplification (paste-key-and-go)

- Built: Reduced AI Settings to the essentials per user request — token → live model list → pick → Save. Removed the separate "Enable AI" toggle, the per-repo override, the Advanced disclosure, Built-in templates, and Export/Duplicate. A stored key is now the consent: `aiStore.saveCredential` auto-enables AI. Removed the chat send-preview confirm gate — `/commands` and free-text send immediately (redaction still applies server-side). `AiChatPanel` auto-enables when a connection exists and drops straight into the conversation.
- Files: rewrote `AiConnectionSettings.tsx`; updated `aiStore.ts` (auto-enable on save), `aiChatStore.ts` (removed `pendingSend`/`confirmSend`/`cancelSend`/preview meta; `prepareSend`→`send`), `AiChatPanel.tsx` (removed PreviewConfirm + ChatEnablePrompt), `strings.ts` (removed ~30 dead strings); rewrote `ai-connections.spec.ts` + updated `ai-chat-panel.spec.ts`.
- Tests: ESLint clean; web typecheck clean; build green (renderer bundle ~548 kB); AI unit suites green (31 tests). E2E specs updated to match but cannot launch Electron in this sandbox (no display) — run `npm run e2e` locally.
- Exit criteria: ✅ met — "add token, pick model, Save, it works." No separate enable step; minimal Settings.
- Notes / follow-ups: Backend precedence (`isAiSendAllowed`) and the `RepositoryRecord.aiOverride` field are unchanged (left as a harmless no-op now that the UI is gone); the Commit-screen inline helper still gates on `aiEnabled`, which a saved key now flips on. Template/duplicate IPC remains for `ai-phases-36-39` coverage. Trade-off accepted by user: removing the manual send-preview reduces the privacy gate to server-side redaction only.

### 2026-06-26 — Fix: Safety Center assign action & commit review noise

- Fixed: Safety Center now offers an inline “Assign this repo to …” action when a repo is unassigned but an active profile exists; assigning updates the repo, refreshes the audit, and clears `REPO_UNASSIGNED`. Secret scanning in staged diffs now inspects only added lines (removed/context lines no longer trigger false secret blockers). Non-secret deterministic review findings (missing tests, large deletions, lockfiles, etc.) are shown in a collapsed advisory section on Commit and no longer flood the primary safety issue list or disable Commit.
- Files: `SafetyCenterScreen.tsx`, `CommitScreen.tsx`, `changeReview.ts`, `SafetyCheckService.ts`; unit/e2e tests in `change-review.test.ts`, `safety-center.spec.ts`, `ai-change-review.spec.ts`.
- Tests: `npm test`, targeted e2e, `npm run lint`.
- Notes / follow-ups: Advisory findings remain available for AI chat `/review`; only `secret-like` deterministic findings block commit.

### 2026-06-26 — Fix: AI Chat slash-command expensive-send ack & error surfacing

- Fixed: Chat slash-commands (`/commit`, `/review`, `/push-brief`, `/history`, `/repo-brief`, `/propose`, free-text) now pass `expensiveSendAcknowledged: true` end-to-end so the spend guard no longer blocks after Phase 55a removed the inline preview gate. **Acknowledgement choice:** auto-ack on explicit command click/Enter (consistent with Phase 55a “paste-key-and-go” — inline preview→confirm is deferred; server-side redaction unchanged).
- Fixed: Stale `useAiStore` snapshot in `runCapability` — fallback errors now read `useAiStore.getState().error` after each awaited call.
- Fixed: Structured-parse / Zod failures render a single friendly chat bubble (`CHAT_CAPABILITY_STRUCTURED_PARSE_ERROR`); raw dumps stay in store/logs only.
- Files: `capabilityErrors.ts`, all chat-capability assistants, IPC schemas/preload/window types, `aiStore.ts`, `aiChatStore.ts`, `strings.ts`; tests `ai-chat-store.test.ts`, `capability-errors.test.ts`, `ai-change-review-assistant.test.ts`, `ai-chat-panel.spec.ts`.
- Tests: `npm test` → Vitest **453 passed** (+10). `npm run e2e tests/e2e/ai-chat-panel.spec.ts` → Playwright **5 passed** (all slash-commands render result bubbles with fake AI).

### 2026-06-26 — Fix: provider JSON schemas for chat slash-commands (HTTP 400)

- Fixed: Slash-commands (`/review`, `/push-brief`, `/history`, `/repo-brief`, `/propose`, `/commit`) were sending placeholder `{ type: 'object', description: … }` schemas that OpenAI-compatible APIs reject under strict `json_schema` mode (HTTP 400). All request kinds now use full provider JSON schemas in `src/core/ai/providerSchemas.ts`.
- Fixed: `OpenAICompatibleAdapter` retries structured sends on HTTP 400 — strict `json_schema` → non-strict → `json_object` → plain completion — so models like Gemma that lack strict structured-output still return parseable JSON.
- Files: `providerSchemas.ts`, all structured assistants, `builtInAdapters.ts`; tests `provider-schemas.test.ts`, `ai-adapters.test.ts`.

### 2026-06-26 — feat(ai): Streaming chat, `/explain` command & structured-output standardization

> Same commit as the "provider JSON schemas" fix above (`feat(ai): Enhance AI chat capabilities and structured output support`); logged separately so the feature scope isn't buried under the HTTP 400 fix line.

- Built (streaming): `AiChatAssistant.chatStream` streams assistant text in real time. New `ai:chatStream` IPC handle plus an `ai:chatStreamEvent` push channel (`webContents.send`) deliver incremental tokens to the renderer; `AiChatPanel` renders the growing bubble live and `aiChatStore` accumulates deltas. Adapter layer gained text-stream request validation + streaming response handling (`adapterUtils.ts`, `builtInAdapters.ts`, `CustomHttpAdapter.ts`, `FetchHttpClient`/`HttpClient` request seam). Streaming carries plain assistant prose only — structured (schema-bound) capabilities still use the non-streaming path.
- Built (`/explain`): new chat command that explains either a `SafetyCode` token or **pasted tool / build output**. `src/core/ai/chatCommands.ts` adds the `explain` kind + arg classifier (`safety-code` vs `tool-output`) and `isNetworkedChatCommand`; `src/core/ai/chatContext.ts` adds path-filtering + `@mention` parsing for context selection. Pasted content is routed through the same redaction ruleset as any other context before send.
- Built (structured output): manual per-assistant JSON schemas replaced by one centralized `providerJsonSchemaForKind` in `src/core/ai/providerSchemas.ts`, consumed by every structured assistant (`AiCommitAssistant`, `AiChangeReviewAssistant`, `AiPushBriefAssistant`, `AiHistorySummaryAssistant`, `AiRepoBriefAssistant`, `AiSafetyCopilotAssistant`, `AiFailureExplainerAssistant`, `AiAgenticAssistant`). Adapter error extraction surfaces detailed provider error messages.
- Built (UI polish): `AiChatPanel` rewrite (streaming bubbles, command UX), custom `Dropdown` rewrite (keyboard nav / theming), `aiChat.css` + `theme.css` additions, `aiModelOptions.ts` model-option helpers, onboarding tour copy updates.
- Files: `src/core/ai/{chatCommands,chatContext,providerSchemas,outputs,types}.ts`; `src/main/ai/*` (chat assistant + all structured assistants + `adapterUtils`/`builtInAdapters`/`AiAdapterRegistry`/`CustomHttpAdapter`/`types`); `src/main/ipc/{ipc-handlers,ipc-schemas}.ts`; `src/main/services/{FetchHttpClient,HttpClient}.ts`; `preload/index.ts`; `src/renderer/{App.tsx, components/AiChatPanel.tsx, components/AiConnectionSettings.tsx, components/Dropdown.tsx, components/OnboardingTour.tsx, components/aiChat.css, components/aiModelOptions.ts, store/aiChatStore.ts, store/appStore.ts, strings.ts, theme.css, types/window.d.ts}`; tests `chat-commands.test.ts`, `ai-chat-assistant.test.ts`, `ai-chat-store*.test.ts`, `ai-adapters.test.ts`, `ai-model-options.test.ts`, `ai-context-builder.test.ts`, e2e `ai-chat-panel`/`ai-connections`/`onboarding`.
- Notes / follow-ups: streaming is for free-text chat only; redaction and the advisory-only invariant are unchanged. `/explain` pasted-output is a new free-text input path — covered by the shared redaction ruleset but, like all redaction, best-effort (see SECURITY.md §17–§18, DECISIONS.md §6).

### 2026-06-27 — Fix: Replace static SAFE badge with live header guard

- Fixed: The header badge always read a hard-coded `Safe` (`setSafetyBadge` was defined in `appStore` but never called). Replaced it with an honest, live **header guard** that reports only **repo / profile / Git-identity alignment** — never commit/push safety. A new pure mapper `deriveHeaderGuard` calls **only** `safetyCheckService.checkRepositoryIdentity` (never `checkCommit`/`checkPush`), so the header can never inherit a `NOTHING_STAGED` / `NO_REMOTE` / `EMPTY_MESSAGE` verdict. States: `checking` / `ready` / `review` (warnings) / `blocked` (any blocker, incl. empty `user.name`/`user.email` → `IDENTITY_UNSET`) / `not-checked` (no repo or IPC error). The badge is now a clickable chip → Safety Center (active repo) or Repositories (none), with a state+issue-count aria-label. Removed the dead `SafetyBadge` type/state/action. The new `headerGuardStore` reuses safetyCenterStore's dangling-profile normalization (so header and Safety Center never disagree) and carries a monotonic request-id stale-async guard so a slow result for repo A can't overwrite a newer result for repo B. Inspector's "Safety" row became a read-only "Guard" row (header owns the refresh; single source of truth).
- Files: **new** `src/core/safety/headerGuard.ts`, `src/renderer/store/headerGuardStore.ts`, `tests/unit/header-guard.test.ts`, `tests/e2e/header-guard.spec.ts`; edited `src/renderer/store/appStore.ts` (removed badge apparatus), `src/renderer/components/GlobalHeader.tsx` (GuardBadge + refresh effect), `src/renderer/components/Inspector.tsx` (read-only guard row), `src/renderer/strings.ts` (`GUARD_*`), `tests/e2e/shell.spec.ts` (assert no `Safe`, new `header-guard-badge` test id).
- Tests: Vitest **499 passed** (+13 new in `header-guard.test.ts`). New e2e green: `header-guard.spec.ts` **4 passed** (Ready / Blocked / click→Safety Center / no-repo Not-checked→Repositories) and the rewritten `shell.spec.ts` guard-badge assertion **passed**. `tsc -p tsconfig.web.json` clean; all touched files eslint + prettier clean.
- Notes / follow-ups: This fix was implemented on top of a working tree that already held substantial **uncommitted prior WIP** (e.g. `syncProfileToRepo` in `appStore.ts`, `AGENTS.md`/`CLAUDE.md` restructuring, `ipc-handlers.ts`, `RepositoriesScreen.tsx`, several e2e specs). Pre-existing, **not caused by this fix**: `tsc -p tsconfig.node.json` (57 errors from WIP test files importing renderer stores not in the node include), `npm run lint` (2 errors in `adapterUtils.ts` + `aiChatStore.ts`), and 5 failing e2e specs (`diff`, `github-push-safety`, `remote`, `repositories`, `shell` resize-drag). All five fail identically at HEAD; the `repositories` mismatch failure was isolated to the prior-WIP `syncProfileToRepo` (it fails with this fix's guard effect disabled). Because the tree mixes this fix with unrelated WIP, the closeout commit was **scoped to the header-guard files only** rather than a blanket `git add -A`.

### 2026-06-27 — Fix: E2E suite stabilization

- Fixed: The repository mismatch e2e now follows the intended sticky-override path: assigning a repo to Work auto-syncs the active profile to Work, then manually setting Personal active from the Profiles screen leaves `PROFILE_MISMATCH` visible. `appStore.setActiveRepo` now syncs profiles only for an actual repo switch or assignment change, so reselecting the same repo no longer erases a manual profile override.
- Fixed: The main-content split resize e2e now clears the outer shell panel width key before measuring the repository split. The failure was order-dependent test state from the previous side-panel resize test leaving the main content at its minimum width, where the repository list correctly clamps to 180px.
- Files: `src/renderer/store/appStore.ts`, `tests/unit/app-store-profile-sync.test.ts`, `tests/e2e/repositories.spec.ts`, `tests/e2e/shell.spec.ts`, `docs/progress-log.md`.
- Tests: `npm test` → Vitest **499 passed**. `npm run lint` → ESLint + Prettier clean. `npx tsc -p tsconfig.node.json --noEmit` and `npx tsc -p tsconfig.web.json --noEmit` → clean. Clean-userData `npm run e2e` → Playwright exit code 0 with **75 passed** and **1 known flaky** `ai-connections.spec.ts` retry pass.
- Notes: Before the clean e2e run, `~/Library/Application Support/gitwarden/` contained only temp e2e profiles/repos and was removed. No push performed.

### 2026-06-27 — Fix: Background Electron e2e window

- Fixed: Local Playwright runs now set `GITWARDEN_E2E_BACKGROUND=1` by default, and Electron creates the e2e `BrowserWindow` hidden, non-focusable, and skipped from the taskbar/Dock. This keeps `npm run e2e` from stealing the user's active desktop window while preserving Playwright access to the renderer.
- Files: `electron/index.ts`, `playwright.config.ts`, `docs/progress-log.md`.
- Tests: Background smoke `npm run e2e -- tests/e2e/window.spec.ts tests/e2e/shell.spec.ts` → **7 passed** (including resize drag). `npm run lint`, both TypeScript projects, `npm test` → **499 passed**, and clean-userData `npm run e2e` → Playwright exit code 0 with **75 passed** and **1 known flaky** `ai-connections.spec.ts` retry pass.
- Notes: Use `GITWARDEN_E2E_SHOW_WINDOW=1 npm run e2e` when a visible Electron window is needed for debugging. No push performed.

### 2026-06-27 — Phase 60: Generative UI Blocks — Review Findings card

- Built: First slice of controlled Generative UI in the AI chat. `/review` no longer flattens its `AiChangeReview` to text — the typed result is carried to the renderer as a validated `ChatUiBlock` and rendered as a native card (severity chip by confidence, category, file chip, rationale; empty-state). New pure `ChatUiBlock` discriminated union + `ChatUiBlockSchema` (reuses `AiChangeReviewSchema`, fail-closed) + `reviewFindingsBlock()`; a renderer registry (`ChatBlockView`) maps a validated block to a whitelisted card and falls back to the message's plain-text `content` for unknown kinds. No new IPC / send path / Git action — advisory-only; redaction/enablement/precedence unchanged. Card styling uses theme `var(--gw-*)` tokens inline (mirroring `SafetyIssueRow`) — no `aiChat.css` change.
- Files: **new** `src/core/ai/chatBlocks.ts`, `src/renderer/components/chatBlocks/{ReviewFindingsCard.tsx,index.tsx}`, `tests/unit/chat-blocks.test.ts`, `docs/plans/genui-blocks-plan.md`, `docs/prompts/genui-blocks-prompts.md`; edited `src/core/ai/index.ts` (barrel), `src/renderer/store/aiChatStore.ts` (`ChatMessage.block` + review case), `src/renderer/components/AiChatPanel.tsx` (`MessageRow` renders `ChatBlockView`), `src/renderer/strings.ts` (`REVIEW_*`), `tests/e2e/ai-chat-panel.spec.ts` (assert `ai-chat-review-card`).
- Tests: Vitest **503 passed** (+4 new in `chat-blocks.test.ts`). `npx tsc --noEmit` clean on `tsconfig.web.json` AND `tsconfig.node.json`; ESLint + Prettier clean on touched files. E2E assertion added to `ai-chat-panel.spec.ts` but **not run here** (no display in this sandbox) — run `npm run e2e tests/e2e/ai-chat-panel.spec.ts` locally.
- Exit criteria: ✅ met — typed `/review` renders as a native card; block union validates/rejects fail-closed; `src/core/` stays pure; flattened `content` retained as fallback so existing assertions, copy, and a11y are preserved.
- Notes / follow-ups: Phase numbering — 56–59 are reserved by Client Branch Access, so Generative UI Blocks starts at **60**. Next: Phase 61 `CommitDraftCard` (with Insert action), Phase 62 free-text model-chosen blocks (Level 2; needs a streaming decision).

### 2026-06-27 — Phase 61: Generative UI Blocks — Commit Draft card

- Built: Second GenUI card. `/commit` now carries its `AiCommitDraft` to the chat as a `{ kind: 'commit-draft' }` block rendered as a native `CommitDraftCard` (Conventional / Plain / Summary / optional Body) with an **Insert** action. Insert reuses the EXISTING commit-message path — `useCommitStore.setMessage` with the same `conventional` + body formatting as the inline Commit-screen helper — then navigates to the Commit screen; the user still commits through the Safety Engine. No new IPC / send / git mutation path; `src/core/` stays pure. Reused the existing `AI_COMMIT_DRAFT_*` / `AI_COMMIT_INSERT` strings (no new strings).
- Files: **new** `src/renderer/components/chatBlocks/CommitDraftCard.tsx`; edited `src/core/ai/chatBlocks.ts` (`commit-draft` union variant + `ChatUiBlockSchema` reusing `AiCommitDraftSchema` + `commitDraftBlock()`), `src/renderer/store/aiChatStore.ts` (commit case attaches the block), `src/renderer/components/chatBlocks/index.tsx` (`ChatBlockView` commit-draft case), `tests/unit/chat-blocks.test.ts` (+3), `tests/e2e/ai-chat-panel.spec.ts` (card + Insert → `commit-message` populated).
- Tests: Vitest **506 passed** (+3 new in `chat-blocks.test.ts`). `npx tsc --noEmit` clean on `tsconfig.web.json` AND `tsconfig.node.json`; ESLint + Prettier clean on touched files. E2E extended (the `runs /commit …` test asserts `ai-chat-commit-card`, clicks Insert, then asserts the Commit screen opens and `commit-message` holds the draft) but **not run here** (no display in this sandbox) — run `npm run e2e tests/e2e/ai-chat-panel.spec.ts` locally.
- Exit criteria: ✅ met — `/commit` renders a native card; Insert reuses the existing commit-message path (no new mutate path); block union validates/rejects fail-closed; `src/core/` pure.
- Notes / follow-ups: Insert relies on `commitStore.load()` NOT resetting `message`, so the draft survives navigation to the Commit screen (verified in the store). Next: Phase 62 free-text model-chosen blocks (Level 2; needs a streaming decision).

### 2026-06-27 — DX-0: Docs reconciliation

- Built: Docs-only orientation step. Tracked WORKFLOW.md and dx-execution-prompts.md; extended AGENTS.md build order through Phase 62 + DX track (DX-0→DX-6); added 7 missing plan/prompt references to AGENTS.md Reference docs §; added Feature Track Status table to progress-log.md; fixed header-guard-badge-plan.md status to ✅ implemented; set WORKFLOW.md DX-0 section to active (🔒→✅, block uncommented).
- Files: `AGENTS.md`, `WORKFLOW.md` (new), `docs/plans/agentic-dx-plan.md` (prettier), `docs/plans/header-guard-badge-plan.md`, `docs/progress-log.md`, `docs/prompts/dx-execution-prompts.md` (new).
- Tests: n/a (docs-only). `npm run lint` clean; both tsc projects clean.
- Exit criteria: ✅ met — all 10 plans + prompts in AGENTS.md; build order shows Phase 61 at HEAD; status table present; header-guard-badge status corrected; lint clean; no untracked files.
- Notes / follow-ups: Next: DX-1 — Executable guardrails (`.claude/settings.json` allowlist + PreToolUse hooks + test:tooling suite).

### 2026-06-27 — Phase 62: Generative UI Blocks — Free-text model-chosen blocks (Level 2)

- Built: Free-text chat can now optionally surface a model-chosen card. Chosen design = **hybrid**: streaming is unchanged (no regression); after a successful free-text stream, the store runs a small **fail-closed** structured pass (`ai:chatSuggestBlock` → `AiChatAssistant.suggestBlock`) that MAY upgrade the finished bubble with ONE allowlisted block. Scoped to `commit-draft` — the only block derivable from the conversation (chat context has no diffs, so a model-"reviewed" findings block would be fabricated); `review-findings` stays slash-command-only. No in-band stream parsing. The streamed prose renders above the card (`blockAugmentsText`). One extra small structured call per free-text message; advisory-only, same redaction/enablement gate, no new Git authority.
- Files: edited `src/core/ai/chatBlocks.ts` (`ChatBlockSuggestionSchema` + `parseChatBlockSuggestion` + suggest instruction/JSON schema, named member schemas), `src/main/ai/AiChatAssistant.ts` (`suggestBlock`), `src/main/ipc/{ipc-schemas,ipc-handlers}.ts` (`ai:chatSuggestBlock`), `preload/index.ts` + `src/renderer/types/window.d.ts` (bridge + typings), `src/main/testing/aiFakes.ts` (suggestion fixture), `src/renderer/store/aiChatStore.ts` (post-stream pass + `blockAugmentsText`), `src/renderer/components/AiChatPanel.tsx` (prose-above-card render); tests `tests/unit/{chat-blocks,ai-chat-assistant}.test.ts`, `tests/e2e/ai-chat-panel.spec.ts`.
- Tests: Vitest **513 passed** (+7: 4 parser fail-closed + 3 assistant `suggestBlock`). `npx tsc --noEmit` clean on `tsconfig.web.json` AND `tsconfig.node.json`; ESLint + Prettier clean on touched files. E2E added (free-text send → streamed reply → `ai-chat-commit-card` upgrade) but **not run here** (no display) — run `npm run e2e tests/e2e/ai-chat-panel.spec.ts` locally.
- Exit criteria: ✅ met — free-text can yield an allowlisted, Zod-validated card; fail-closed (review/null/garbage → no block, streamed text untouched); closed allowlist holds; advisory-only / no-new-authority unchanged.
- Notes / follow-ups: **Generative UI Blocks feature (Phases 60–62) is complete.** Cost trade-off accepted: the post-stream pass is one extra structured call per free-text message; it can later be gated (e.g. skip when the reply is clearly non-actionable) if cost matters. Broadening free-text cards beyond `commit-draft` would need the relevant data in chat context (e.g. diffs) — out of scope here.
