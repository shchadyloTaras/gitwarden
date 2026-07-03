# Plan — Initialize Repository: turn a plain folder into a Git repo (and connect it to GitHub) without the terminal

**Status:** ⬜ not started — Phases 85–88 — **derived view**; the authoritative state is the
Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 85 → 88.
**Feature-complete stop point:** Phase 88.
**Prompts:** [`docs/prompts/initialize-repository-prompts.md`](../prompts/initialize-repository-prompts.md).

## Goal

Today, when a user browses to a folder that isn't yet a Git repository, **Add Repository** hits a
red dead end — "This directory is not a Git repository." — and there is no way forward. The common
real case: the user created an **empty** repository on GitHub, has a local folder on disk, and wants
to connect the two (GitHub's own "…or create a new repository on the command line" instructions).
GitWarden can't help — it has no `git init` and no `git remote add` anywhere in the app.

This feature turns that dead end into a **fork**: when the chosen folder isn't a repo, the user gets
an inline **"Initialize Git repository"** action. Clicking it runs `git init -b main`, **writes the
local identity from the active profile** (so the very first commit can never be born under the wrong
account), optionally **connects a GitHub remote** (`git remote add origin <url>`), registers the repo
in GitWarden assigned to that profile, and drops the user on the **Commit** screen to make the first
commit and push through GitWarden's existing, safety-checked buttons.

**Product boundary (decided — "publish a local folder to an empty remote; hand off the first
commit/push"):** the feature stops at "the folder is now a connected GitWarden repository." It does
**not** clone (download) a remote, does **not** create the first commit, and does **not** push inside
this flow — the first commit and push are completed with the **existing** Commit/Remote screens,
which already enforce the identity guard and push policy. Re-implementing commit/push here would
bypass the very safety guards that are GitWarden's reason to exist.

## Codebase findings (grounding)

Verified against the current tree before writing this plan. Each finding is a claim with real
`file:line` links and the **consequence** for this feature:

1. **The add flow is validate-then-create; the failure is a hard stop.** `addRepository` calls
   `git.validateRepository` (which runs `git rev-parse --show-toplevel`,
   [GitService.ts:69-90](../../src/main/services/GitService.ts)); on failure the store throws and the
   screen renders the raw message with no next step
   ([repositoriesStore.ts:30-44](../../src/renderer/store/repositoriesStore.ts),
   [RepositoriesScreen.tsx:94-111](../../src/renderer/screens/RepositoriesScreen.tsx)); the message
   itself comes from `ErrorMapper` ([ErrorMapper.ts:28](../../src/main/git/ErrorMapper.ts)).
   **Consequence:** we do **not** discriminate error codes (grilling Q3); the inline Initialize
   affordance simply appears after any failed Validate & Add, and `git init` either succeeds or
   surfaces its own error.

2. **No `git init` and no `git remote add` exist — this is genuinely new git surface.** The closest
   primitive is `setRemoteUrl` (`git remote set-url`, local-only, args as an array, URL as data)
   ([GitService.ts:152-163](../../src/main/services/GitService.ts)). **Consequence:** add
   `initRepository` (`git init -b main`) and `addRemote` (`git remote add origin <url>`) as siblings,
   following that exact array-args / URL-is-data shape (AGENTS.md #3). `-b main` needs git ≥ 2.28
   (fine for a modern desktop app); it makes the default branch deterministic rather than inheriting
   the user's `init.defaultBranch` (which may be `master`).

3. **Writing the local identity from a profile is already a solved pattern.**
   `GitService.setLocalIdentity` writes **`--local`** `user.name`/`user.email` only
   ([GitService.ts:130-141](../../src/main/services/GitService.ts)); the remediation executor already
   does exactly "identity from a profile" via
   `setLocalIdentity(repoPath, profile.gitAuthorName, profile.gitAuthorEmail)`
   ([remediationExecutor.ts:71](../../src/main/ipc/remediationExecutor.ts)); the identity fields live
   on `Profile` as `gitAuthorName` / `gitAuthorEmail`
   ([types.ts:3-16](../../src/core/types.ts)). **Consequence:** the init orchestrator writes the
   active profile's identity into the fresh repo — the core safety value-add — reusing `setLocalIdentity`
   verbatim (honors AGENTS.md #4 "only `--local`"). This is why init is **blocked with a hint when no
   profile is active** (grilling Q7): a repo must never be born identity-less under the global default.

4. **`repositories.create` already accepts `assignedProfileId`.** The Zod payload is the full record
   minus `id` (`RepositoryCreatePayload = RepositoryRecordSchema.omit({ id: true })`,
   [ipc-schemas.ts:34-35](../../src/main/ipc/ipc-schemas.ts)); the record type carries `name` and
   optional `assignedProfileId` ([types.ts:88-95](../../src/core/types.ts)); the service persists it
   as-is ([RepositoryService.ts:32-38](../../src/main/services/RepositoryService.ts)). **Consequence:**
   the new repo is created **already assigned** to the active profile — no extra assignment step.

5. **The git IPC pattern is a thin, Zod-validated `wrap(...)` per channel, surfaced on the preload
   bridge and typed in `window.d.ts`.** e.g. `git:validateRepository` parses `GitRepoPathPayload`
   then calls the service ([ipc-handlers.ts:272-277](../../src/main/ipc/ipc-handlers.ts)); the bridge
   method is one line ([preload/index.ts:145-193](../../preload/index.ts)) and typed in
   [window.d.ts:137-152](../../src/renderer/types/window.d.ts). `git:setLocalIdentity` already validates
   a `{ repoPath, name, email }` payload ([ipc-handlers.ts:321-326](../../src/main/ipc/ipc-handlers.ts),
   `GitSetIdentityPayload` [ipc-schemas.ts:70-74](../../src/main/ipc/ipc-schemas.ts)). **Consequence:**
   add a **single orchestrator channel `git:initializeRepository`** (nested-check → init → identity →
   optional remote) with a new `GitInitializePayload`, plus its bridge method and `window.d.ts` type —
   one round-trip instead of three chatty ones, so partial-failure handling lives in one place.

6. **Nested-repo detection needs only `rev-parse --show-toplevel` + a realpath compare.**
   `validateRepository` already runs `git rev-parse --show-toplevel`
   ([GitService.ts:69-76](../../src/main/services/GitService.ts)); from a subfolder it returns the
   **enclosing** repo's toplevel (≠ the folder). **Consequence:** the orchestrator runs the same
   command; if it succeeds and the canonical toplevel ≠ the canonical target folder, the folder is
   **inside an existing repo** → refuse `git init` with a plain warning (grilling Q9), avoiding a
   confusing nested repository. Running `git init` with **`cwd: repoPath`** (not `git init <path>`)
   also means a non-existent/typo'd path fails cleanly on spawn instead of creating a phantom folder
   (grilling Q8) — no separate existence check needed.

7. **Push does not set upstream today.** `push` runs `['push', remote, branch]` with no `-u`
   ([GitService.ts:191-199](../../src/main/services/GitService.ts)); the handler validates
   `GitRemoteBranchOpPayload` ([ipc-handlers.ts:351-353](../../src/main/ipc/ipc-handlers.ts)).
   **Consequence:** teach `push` to add `-u` **only when the current branch has no upstream** (probe
   `git rev-parse --abbrev-ref --symbolic-full-name @{u}`; on failure, push with `-u`). This is a
   small, backward-compatible change (behavior identical once an upstream exists) that makes the first
   push after connecting a remote wire tracking exactly like GitHub's `git push -u origin main`
   (grilling Q16). No new channel.

8. **A freshly-init'd repo (unborn HEAD) will break History.** `getStatus` parses porcelain v2 and the
   parser already ignores the unborn `# branch.oid (initial)` header
   ([GitService.ts:60-67](../../src/main/services/GitService.ts),
   [PorcelainParser.ts:41-53](../../src/core/parsers/PorcelainParser.ts)) — so Status/Commit are fine.
   But `getCommitHistory` → `queryCommitLog` runs `git log`
   ([GitService.ts:304-343](../../src/main/services/GitService.ts)), which **exits non-zero** on a repo
   with no commits ("does not have any commits yet") → the History screen shows an error.
   **Consequence:** make `getCommitHistory` return `[]` for the no-commits case (mirroring the existing
   `getCommitsAhead` try/catch at [GitService.ts:308-321](../../src/main/services/GitService.ts)), so
   the empty repo the user lands in renders cleanly (grilling Q11).

9. **Landing on Commit is one call.** `appStore` exposes `setActiveRepo` and `navigate(screen)` with a
   `NavScreen` union that includes `'commit'`
   ([appStore.ts:29-74](../../src/renderer/store/appStore.ts)). **Consequence:** after a successful
   init, `setActiveRepo(newRepo)` + `navigate('commit')` drops the user straight into the first-commit
   flow (grilling Q12).

10. **URL validation must be pure and offline-friendly.** All user-facing copy is centralized in `STR`
    ([strings.ts](../../src/renderer/strings.ts)), and the active profile is available in the renderer
    (`profilesStore.activeProfileId` + `profiles`
    [profilesStore.ts:14-39](../../src/renderer/store/profilesStore.ts)). **Consequence:** the git-URL
    format check is a **pure `src/core/` function** (its own phase, Vitest-tested) that accepts
    `https`, `ssh`/`git@host:path`, **`file://` and absolute local paths** — the last two so the e2e
    can use a local **bare** repo as the fake remote entirely offline (grilling Q10, Q14). All new
    strings go in `STR`.

## Scope

- **In:**
  - A pure `src/core/` git-remote-URL format validator (accepts https / ssh / `git@…` / `file://` /
    absolute local paths).
  - `GitService.initRepository` (`git init -b main`), `GitService.addRemote` (`git remote add`), a
    nested-repo check, and a `push` tweak that adds `-u` when there is no upstream.
  - A single `git:initializeRepository` orchestrator IPC (nested-check → init → local identity from
    the active profile → optional `remote add`), reporting a **partial** remote failure without
    undoing the init; typed preload bridge + `window.d.ts`.
  - `getCommitHistory` returning `[]` on an unborn HEAD so a freshly-init'd repo never crashes a
    screen.
  - Renderer: an inline **Initialize** panel in the Add flow (optional GitHub URL + active-profile
    identity line + "Initialize"); a **no-active-profile** hint that blocks init; a **nested-repo**
    warning; a **partial-remote-failure** note; success → land on **Commit** with the new repo active
    and assigned to the profile.
  - All new user-facing strings externalized in `STR`.
- **Out / Non-goals:**
  - **No clone** — downloading an existing remote (with content) into a new folder is a separate,
    larger feature (URLs + auth + download progress). This feature only publishes a **local** folder.
  - **No first commit and no push inside this flow** — handed off to the existing Commit/Remote
    screens (which keep the identity guard + push policy). The `-u`-on-first-push tweak lives in the
    existing push, not a new push path here.
  - **No confirmation modal** — the explicit "Initialize" click is the action; the identity line in the
    form shows what the repo is born as; running with `cwd: repoPath` prevents a phantom folder.
  - **No auto initial commit** (`--allow-empty`) — we don't invent history; the user makes the first
    commit deliberately.
  - **No directory creation** — the folder must already exist (it does, via Browse).
  - **No changing global/system git config** — identity is written `--local` only (AGENTS.md #4); no
    config beyond the repo is touched.
  - **No new safety verdicts/severities** and **no secrets logged** (AGENTS.md #5).

## The new pure-core contract

```ts
// src/core/remoteUrl.ts — pure, no imports (AGENTS.md #1)
/** True if `url` is a plausible git remote (https/http, ssh://, git@host:path, file://, or an
 *  absolute local path). Format-only: does NOT touch the network or the filesystem. */
export function isValidGitRemoteUrl(url: string): boolean
```

The renderer calls this to reject an obvious non-URL (e.g. a pasted repo web page without a scheme,
or empty-after-trim) before the orchestrator runs `git remote add`. Accepting `file://` + absolute
local paths keeps the e2e offline (a local bare repo is a legal git remote).

---

## Phase 85 — Git remote URL validator (pure core)

**Goal:** a pure, exhaustively-tested `isValidGitRemoteUrl` so the renderer can reject obvious
non-URLs before `remote add`, and the e2e can use a local bare repo as the remote offline. Honors
AGENTS.md #1 (pure core — no `fs`/`child_process`/electron/DOM).

**Implementation:**

- New module `src/core/remoteUrl.ts` exporting `isValidGitRemoteUrl(url: string): boolean`. Accept:
  `https://` / `http://` URLs; `ssh://` URLs; scp-like `git@host:path` (and `user@host:path`);
  `file://` URLs; absolute local paths (POSIX `/…`; Windows drive `C:\…` / UNC — best-effort). Reject:
  empty/whitespace-only, a bare `host/owner/repo` with no scheme, and strings containing spaces or
  newlines. Do **not** require a `.git` suffix (GitHub clone URLs work without it).
- Keep it dependency-free (no Zod, no Node) so it runs under plain Vitest and passes core-purity.

**Exit criteria:** `npx tsc --noEmit` clean on both tsconfigs; **Vitest** table covers each accepted
form (https, http, `ssh://`, `git@…:…`, `file://`, POSIX absolute path) and each rejected form
(empty, `github.com/o/r` without scheme, spaces); `src/core/` stays pure (**core-purity-reviewer**
passes); `npm test` green; `npm run lint` clean. No IPC, no UI.

**Files:** new `src/core/remoteUrl.ts`; new `tests/unit/remote-url.test.ts`.

---

## Phase 86 — Init, connect, nested-guard, push `-u` (main + IPC)

**Goal:** the git primitives plus one `git:initializeRepository` orchestrator that turns a folder into
a profile-identified repo and optionally connects a remote — reporting a partial remote failure
without undoing the init; and push that sets upstream on the first push. Honors AGENTS.md #2 (GitRunner
is the only executor), #3 (args arrays; URL/ref are data), #4 (`--local` identity only), #6 (the
explicit Initialize click is the action — no second modal).

**Implementation:**

- **`GitService.initRepository(repoPath)`** — `['init', '-b', 'main']`, `readOnly: false`, run with
  `cwd: repoPath` (so a non-existent path fails on spawn rather than creating a phantom folder;
  finding 6).
- **`GitService.addRemote(repoPath, name, url)`** — `['remote', 'add', name, url]`, `readOnly: false`;
  `url` is a single array element, never shell-interpolated (mirror `setRemoteUrl`,
  [GitService.ts:152-163](../../src/main/services/GitService.ts)).
- **Nested-repo check** — a helper that runs `['rev-parse', '--show-toplevel']` (`readOnly: true`);
  return the canonical toplevel on success or `null` on error. Compare via `fs.realpath` against the
  canonical target folder (finding 6).
- **`GitService.push` upstream** — before pushing, probe
  `['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']`; if it errors (no upstream), push
  with `['push', '-u', remote, branch]`, else keep `['push', remote, branch]`. Auth/env unchanged
  ([GitService.ts:191-199](../../src/main/services/GitService.ts)).
- **Orchestrator IPC `git:initializeRepository`** — new `GitInitializePayload =
  { repoPath: string, remoteUrl?: string, identityName: z.string().min(1),
  identityEmail: z.string().min(1) }` in [ipc-schemas.ts](../../src/main/ipc/ipc-schemas.ts). Handler
  (copy the `wrap(...)` shape of `git:validateRepository`,
  [ipc-handlers.ts:272-277](../../src/main/ipc/ipc-handlers.ts)): (1) nested-check → if inside an
  existing repo, throw a plain-language error naming the enclosing toplevel; (2) `initRepository`;
  (3) `setLocalIdentity(repoPath, identityName, identityEmail)`
  ([GitService.ts:130-141](../../src/main/services/GitService.ts)); (4) if `remoteUrl` present, **try**
  `addRemote(repoPath, 'origin', remoteUrl)` and on failure capture the message. Return
  `{ name: basename(repoPath), remoteUrl?: <url if added>, remoteError?: <message> }` — the init is
  never rolled back (grilling Q15).
- **Bridge + types** — `git.initializeRepository(...)` in
  [preload/index.ts:145-193](../../preload/index.ts) and its type in
  [window.d.ts:137-152](../../src/renderer/types/window.d.ts).

**Exit criteria:** `npx tsc --noEmit` clean; **Vitest integration (offline, real temp dirs)**:
`initRepository` creates `.git` on branch `main`; `addRemote` adds `origin`; the nested check returns
the enclosing toplevel for a subfolder and `null` for a standalone folder; the orchestrator writes
**`--local`** identity + adds the remote, and with a **bad** remote URL still leaves the repo
initialized and returns a `remoteError`; the orchestrator **refuses** (throws) when the target is
inside an existing repo, leaving no `.git` in the subfolder; `push` uses `-u` when there is no upstream
and omits it once one exists (verified against a local **bare** remote); `npm test` green; `npm run
lint` clean; the **safety-reviewer** subagent passes (args arrays, `--local` only, no secrets logged,
no global/system state). No UI.

**Files:** edit `src/main/services/GitService.ts`, `src/main/ipc/ipc-handlers.ts`,
`src/main/ipc/ipc-schemas.ts`, `preload/index.ts`, `src/renderer/types/window.d.ts`; new
`tests/unit/git-init-connect.test.ts`.

---

## Phase 87 — Empty-repo (unborn HEAD) tolerance (main)

**Goal:** a freshly-init'd repo with no commits never crashes a screen — the state the user is dropped
into on Commit. Honors AGENTS.md #2/#3.

**Implementation:**

- **`GitService.getCommitHistory`** — wrap the `queryCommitLog` call so the "no commits yet" case
  (git exits non-zero on an unborn HEAD) returns `[]` instead of throwing, mirroring the existing
  `getCommitsAhead` try/catch ([GitService.ts:308-321](../../src/main/services/GitService.ts),
  [GitService.ts:323-343](../../src/main/services/GitService.ts)). Other errors still propagate.
- **Confirm `getStatus` already tolerates unborn HEAD** — the porcelain parser ignores
  `# branch.oid (initial)` ([PorcelainParser.ts:41-53](../../src/core/parsers/PorcelainParser.ts)); add
  a test asserting a freshly-init'd repo yields a valid `GitStatus`. Adjust the parser only if the test
  proves it necessary (if so, core-purity must still pass).

**Exit criteria:** `npx tsc --noEmit` clean; **Vitest integration (offline, real temp repo)**: on a
`git init`'d dir with **no commits**, `getCommitHistory(...)` returns `[]` (no throw) and `getStatus(...)`
returns a valid `GitStatus` (branch `main`, empty `files`); existing history/status tests stay green;
`npm test` green; `npm run lint` clean; **core-purity-reviewer** passes if the parser is touched. No UI.

**Files:** edit `src/main/services/GitService.ts` (and `src/core/parsers/PorcelainParser.ts` only if a
test forces it); new/extended `tests/unit/git-empty-repo.test.ts`.

---

## Phase 88 — Inline Initialize panel + land on Commit (renderer + e2e)

**Goal:** the "not a Git repository" dead end becomes a fork — the user initializes, optionally
connects GitHub, and lands on Commit with the repo assigned to their profile. Feature-complete stop
point. Honors AGENTS.md #6 (explicit click is the action — no modal) and the "no hard-coded strings"
rule.

**Implementation:**

- **`repositoriesStore`** ([repositoriesStore.ts:30-44](../../src/renderer/store/repositoriesStore.ts)):
  add `initializeRepository(localPath, remoteUrl, identity, profileId)` mirroring `addRepository` —
  call `window.api.git.initializeRepository({ repoPath: localPath, remoteUrl, identityName,
  identityEmail })`; on success call `repositories.create({ name, localPath, remoteUrl,
  assignedProfileId: profileId, isFavorite: false })` (finding 4), push into `repos`, and return
  `{ repo, remoteError? }`.
- **`RepositoriesScreen`** ([RepositoriesScreen.tsx:328-417](../../src/renderer/screens/RepositoriesScreen.tsx)):
  in add mode, after a failed Validate & Add, render an **"Initialize Git repository"** button. Clicking
  it reveals an inline mini-form: an optional **GitHub URL** input, an **identity line** — "Identity:
  `<active profile displayName>` (`<gitAuthorEmail>`)" — and an **"Initialize"** button. If there is
  **no active profile** (`profilesStore.activeProfileId` null,
  [profilesStore.ts:14-39](../../src/renderer/store/profilesStore.ts)), replace the button with a hint
  ("Select or create a profile first") and do not allow init. On submit: if the URL is non-empty,
  validate it with `isValidGitRemoteUrl` (Phase 85) and show an inline message on failure; otherwise
  call `initializeRepository` with the active profile's `gitAuthorName`/`gitAuthorEmail` + `id`. On
  success, `setActiveRepo(repo)` + `navigate('commit')` (finding 9); on a **nested-repo** error show the
  warning; on a **partial remote failure** (`remoteError`) show the note but still proceed.
- **Strings** — add to [strings.ts](../../src/renderer/strings.ts): the Initialize button label, URL
  label/placeholder, the identity-line template, the no-profile hint, the nested-repo warning, the
  invalid-URL message, and the partial-remote note. English; no hard-coded user-facing strings.

**Exit criteria (Playwright e2e, offline fixtures + local bare remote):**

- Browse to a temp **non-git** dir → Validate & Add fails → the **Initialize** panel appears; with an
  active profile, entering a local **bare** repo path as the URL → Initialize → the repo appears in the
  list **assigned to the active profile**, its **local identity equals the profile's** (assert via the
  effective identity / `git config --local`), the app lands on **Commit**, and History/Commit render
  the empty repo without an error.
- **No active profile** → the Initialize button is replaced by the "select a profile first" hint and no
  repo is created.
- A folder **inside an existing repo** → the nested-repo warning shows and no `.git` is created in the
  subfolder.
- `npm test`, `npm run e2e`, `npm run lint` all green; no hard-coded user-facing strings.

**Files:** edit `src/renderer/store/repositoriesStore.ts`,
`src/renderer/screens/RepositoriesScreen.tsx`, `src/renderer/strings.ts`; new
`tests/e2e/repositories-init.spec.ts`.

---

## Acceptance criteria (feature)

- From Add Repository, browsing to a folder that isn't a Git repo offers an inline **Initialize**
  action instead of a dead end — no terminal.
- Initialize runs `git init -b main`, writes the **active profile's** `--local` identity, and (if a URL
  is given) connects `origin` — then registers the repo **assigned to that profile** and lands the user
  on **Commit** to finish the first commit/push with the existing buttons (push wires upstream via `-u`
  on that first push).
- Init is **blocked** when no profile is active (a repo is never born identity-less) and when the folder
  is **inside an existing repo** (no nested repositories).
- A **partial** failure (init succeeded, remote add failed) leaves a working local repo and reports the
  remote error — no rollback.
- A freshly-initialized **empty repo** renders cleanly (History shows empty, nothing crashes).
- No clone; no first commit/push inside this flow; no confirmation modal; no directory creation; no
  global/system config change; git args stay arrays; URL/ref are data; no secrets logged.
- Logic-first honored: Phases 85–87 ship green Vitest before the UI; Phase 88 has green Playwright. One
  commit per phase; the progress-log entry written **before** each commit; not pushed.

## Decisions (resolved)

Resolved in the kickoff grilling session — later phases must not re-litigate:

1. **Scope = initialize an existing folder + optionally connect a remote + hand off** (variant B1); no
   clone. (Grilling Q1, Q5.)
2. **Inline entry** after a failed Validate & Add, in the same Add panel. (Q2.)
3. **No error-code discrimination** — the Initialize affordance appears after any failure; `git init`
   surfaces its own errors. (Q3.)
4. **`git init -b main`, no auto initial commit.** (Q4.)
5. **GitHub URL is optional** — empty → plain local init; filled → also `remote add origin`. (Q6.)
6. **Local identity from the active profile + assign the repo to it; block init when no profile is
   active** with a hint. (Q7.)
7. **No confirmation modal** — the identity line in the form shows what the repo is born as; running
   `git init` with `cwd: repoPath` prevents a phantom folder from a typo. (Q8.)
8. **Nested-repo guard** blocks init when the folder is inside an existing repo. (Q9.)
9. **Light, pure URL format validation** accepting https / ssh / `git@…` / `file://` / local paths (the
   last two keep e2e offline). (Q10, Q14.)
10. **Empty-repo (unborn HEAD) must not crash the app.** (Q11.)
11. **Land on the Commit screen** after a successful init. (Q12.)
12. **Inline mini-form:** optional URL + identity line + Initialize. (Q13.)
13. **Partial failure (init ok, remote add fails): keep the repo, show a message** — no rollback. (Q15.)
14. **Push sets `-u` when the current branch has no upstream** (first push wires tracking). (Q16.)

## Open questions (resolve at kickoff)

- **Windows path forms in the URL validator** (drive `C:\…`, UNC `\\host\…`): accept best-effort in
  Phase 85, or defer Windows to a follow-up? Lean: accept POSIX + `file://` + https/ssh firmly, treat
  Windows drive paths as best-effort.
- **`http://` remotes:** accept alongside `https://` (some self-hosted/local setups), or https-only?
  Lean: accept both (format-only check; the real gate is the push).
- **Identity line detail:** show `displayName (email)` (proposed) vs. `displayName` only. Lean: include
  the email so the user sees exactly what will be written.
