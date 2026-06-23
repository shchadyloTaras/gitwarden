# CLAUDE.md — GitWarden

Project guidance for Claude Code. Read this and `docs/gitwarden-plan.md` before working.

## Project

**GitWarden** — a cross-platform desktop Git GUI focused on **safe multi-account GitHub usage**: prevent committing/pushing with the wrong profile, author name, email, SSH key, or repository. Built around **profiles** (Personal/Work/Client); each repo is assigned to exactly one profile, and the app surfaces identity safety before every commit/push.

Full plan: `docs/gitwarden-plan.md`. Per-phase prompts: `docs/phase-prompts.md`.

## Repository

- GitHub: https://github.com/shchadyloTaras/gitwarden
- Remote (SSH): `git@github.com:shchadyloTaras/gitwarden.git`
- Default branch: `main`
- Local working dir name may differ from the repo name (`git-visual`); the repo is `gitwarden`.

## Stack

- **Electron + TypeScript (strict) + React (Vite)**
- State: Zustand (or context). Validation: Zod. Tests: **Vitest** (logic) + **Playwright** (Electron e2e).
- Git access: Node `child_process.execFile` (args array — **never** a shell).
- Storage: JSON in `app.getPath('userData')` (non-secret) + Electron `safeStorage` (secrets, deferred).

## Commands

```bash
npm run dev      # launch the app (Vite renderer + Electron)
npm test         # Vitest — unit + integration
npm run e2e      # Playwright — Electron e2e against fixture repos
npm run lint     # ESLint + Prettier
npm run build    # electron-builder package
```

(Scripts are wired in Phase 1; until then they may not exist yet.)

## Architecture rules (non-negotiable)

- **`src/core/` is pure** — no `child_process`, `fs`, Electron, or DOM imports. Safety Engine, porcelain parser, and types live here so they run under plain Vitest. This is the verifiability backbone.
- All git execution goes through **`GitRunner`** (the only `execFile` caller); controlled env, cancellable, per-repo serialization.
- Renderer has **no Node access**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer ↔ main only via the typed preload bridge; validate IPC payloads with Zod.
- Every service has an interface and is injected so tests can mock it.
- Git args are always an **array**, never string-interpolated; path args after `--`.
- Never log secrets. Destructive/remote actions stay behind confirmation; irreversible ones (`git clean`) get a distinct stronger warning.
- Build **logic-first**: core + git + safety (phases 2–5) ship with green tests before any UI.

## Definition of Done (per phase)

Compiles with no TS/ESLint errors in touched files · phase Exit criteria met · logic phases have passing Vitest · UI phases have passing Playwright · new user-facing strings externalized · destructive/remote actions confirmed · **Progress Log updated and all changes committed** as `Phase N: <name>` (commit only on green; push stays manual).

## Git workflow

- **One commit per phase**, made only after the phase's exit criteria are green and the Progress Log entry is written (so the doc update is part of the commit).
- Message convention: subject `Phase N: <name>`, a one-line body, and the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- `git add -A` (the `.gitignore` already excludes `node_modules/`, build output, coverage, secrets).
- **Do not push automatically** — pushing to `origin/main` happens only when the user asks. Intermediate WIP commits within a phase are fine; squash is optional.

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
- [ ] Phase 10 — Repository Management
- [ ] Phase 11 — Status & Staging UI
- [ ] Phase 12 — Diff Viewer
- [ ] Phase 13 — Commit Flow
- [ ] Phase 14 — Remote Operations
- [ ] Phase 15 — Branches
- [ ] Phase 16 — History
- [ ] Phase 17 — Safety Center
- [ ] Phase 18 — Settings, Polish & Hardening

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
- Files: added `DECISIONS.md`, `SECURITY.md`; updated `CLAUDE.md` (checklist + log).
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
- Notes / follow-ups: `AuthenticationMethod = 'token'` is model-only (no storage/push path) per MVP decision in Phase 0.

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
- Files: added `src/main/ipc/ipc-schemas.ts`, `src/main/ipc/ipc-handlers.ts`, `src/renderer/types/window.d.ts`, `tests/unit/ipc-schemas.test.ts`, `tests/e2e/ipc-bridge.spec.ts`; updated `preload/index.ts`, `electron/index.ts`, `tsconfig.web.json` (added `src/core/**/*`), `src/core/safety/SafetyCheckService.ts` (type fix), `CLAUDE.md`.
- Tests: Vitest 162/162 passed (30 new ipc-schemas unit tests; 132 pre-existing); Playwright 4/4 passed (1 pre-existing + 3 new: security flags, `profiles:list` round-trip, invalid-payload Zod rejection).
- Exit criteria: ✅ met — renderer call round-trips to a main service and back, fully type-checked; invalid IPC payload rejected by Zod (`ok: false` returned); security flags (`contextIsolation`, `sandbox`, no `window.require`/`window.process`) asserted in Playwright; `tsc --noEmit` clean on both `tsconfig.node.json` and `tsconfig.web.json`.
- Notes / follow-ups: `IpcResult<T>` envelope used instead of raw `throw` so renderer never needs `try/catch` over `window.api` calls. All 14 channels (5 profile + 5 repo + 2 settings + 2 git) wired. `window.api` type in `window.d.ts` mirrors the preload exactly — keep in sync when adding channels.

### 2026-06-23 — Phase 8: App Shell & Navigation

- Built: Zustand `appStore` (seeded with Personal profile, gitwarden repo, main branch, safe badge); `GlobalHeader` (repo · branch · profile chip · safety badge · inspector toggle); `Sidebar` (9 nav items in 3 groups: MANAGE / GIT / APP, highlighted active screen); `Inspector` (contextual panel with profile/repo/branch/safety state, closeable); placeholder `Screen` components for all 9 sections; `App.tsx` wired as a CSS-grid shell (header + sidebar + main + inspector); `data-testid` attributes on all navigable elements.
- Files: added `src/renderer/store/appStore.ts`, `src/renderer/components/GlobalHeader.tsx`, `src/renderer/components/Sidebar.tsx`, `src/renderer/components/Inspector.tsx`, `src/renderer/screens/PlaceholderScreen.tsx`, `src/renderer/screens/RepositoriesScreen.tsx`, `src/renderer/screens/ProfilesScreen.tsx`, `src/renderer/screens/StatusScreen.tsx`, `src/renderer/screens/CommitScreen.tsx`, `src/renderer/screens/RemoteScreen.tsx`, `src/renderer/screens/BranchesScreen.tsx`, `src/renderer/screens/HistoryScreen.tsx`, `src/renderer/screens/SafetyCenterScreen.tsx`, `src/renderer/screens/SettingsScreen.tsx`, `tests/e2e/shell.spec.ts`; updated `src/renderer/App.tsx`, `CLAUDE.md`; added `zustand` dependency; formatted pre-existing Phase 7 files (`preload/index.ts`, `src/main/ipc/ipc-schemas.ts`, `tests/unit/ipc-schemas.test.ts`).
- Tests: Vitest 162/162 passed (no new unit tests — this phase is UI-only); Playwright 8/8 passed (4 pre-existing + 4 new: header seeded state, navigate-all-screens, inspector visible, inspector toggle).
- Exit criteria: ✅ met — Playwright navigates between all 9 screens; global header renders seeded store values (repo, branch, profile, safety badge); inspector toggles open/closed.
- Notes / follow-ups: All screens are placeholders; content is added in Phases 9–17. Inspector is a read-only display for now; will gain contextual actions per screen. `SafetyBadge` seeded as `'safe'`; Phase 11+ will wire real `checkCommit` results.

### 2026-06-23 — Phase 9: Profile Management

- Built: `useProfilesStore` (Zustand, IPC-backed CRUD: list/create/update/delete/setActive + load); `profileColor` (deterministic color from profile ID, palette of 6); full `ProfilesScreen` (list panel + create/edit form with all Profile fields, SSH-only auth, expectedRemoteHosts add/remove, delete confirm, Set-Active, per-field testids); `App.tsx` calls `load()` on mount; `GlobalHeader` and `Inspector` now read from `useProfilesStore` (real `Profile.displayName`, `gitAuthorName`, `gitAuthorEmail`); `appStore` stripped of `SeedProfile` and `activeProfile` (Phase 8 seed for repo/branch/safety kept for Phase 10+).
- Files: added `src/renderer/store/profilesStore.ts`, `tests/e2e/profiles.spec.ts`; updated `src/renderer/store/appStore.ts`, `src/renderer/screens/ProfilesScreen.tsx`, `src/renderer/components/GlobalHeader.tsx`, `src/renderer/components/Inspector.tsx`, `src/renderer/App.tsx`, `tests/e2e/shell.spec.ts` (removed seeded-profile assertions — now tested in profiles.spec.ts), `CLAUDE.md`.
- Tests: Vitest 162/162 passed (no new unit tests — logic is thin UI glue over Phase 6 services); Playwright 13/13 passed (8 pre-existing + 5 new: create-3-profiles, edit, delete, set-active in header, relaunch persistence).
- Exit criteria: ✅ met — Playwright creates Personal/Work/Client, edits one to "Work Updated", deletes Client, sets Personal active (header-profile shows "Personal"), app relaunched → "Personal" still shown in header.
- Notes / follow-ups: Color is computed from profile ID (no stored color field); `authenticationMethod` hardcoded to `'ssh'` in form (token option shown disabled, per MVP decision). `SEED_REPO` kept in `appStore` for Phase 10.
