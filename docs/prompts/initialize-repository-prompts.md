# GitWarden — Initialize Repository Phase Prompts

Copy-paste prompts to drive the **Initialize Repository** feature one phase at a time. Each prompt is
self-contained, points at the plan in `docs/plans/initialize-repository-plan.md`, and **ends with the
standard progress footer** that records progress in `docs/progress-log.md`. Rules live in `CLAUDE.md`
/ `AGENTS.md`.

**How to use:** run prompts in order (85 → 88). Don't start a phase until the previous phase's entry
in `docs/progress-log.md` shows Exit criteria ✅. Phases 85–87 are the logic-complete checkpoint
(green Vitest, no UI); Phase 88 is the feature-complete stop point (renderer + Playwright). One commit
per phase; the progress-log entry written **before** the commit.

**Prerequisites / offline note:** No network. Tests create real git repos in a temp dir (a plain
non-git folder for the init case; a folder nested inside a repo for the nested-guard case) and use a
local **bare** repo as the remote wherever `remote add` / push is exercised — a local bare path is a
legal git remote, so the whole suite runs offline.

Background facts (already verified against the tree — don't re-litigate):

- The add flow is validate-then-create and a failure is a hard stop: `addRepository` →
  `git.validateRepository` (`git rev-parse --show-toplevel`, GitService.ts:69-90); on failure the
  store throws and the screen shows the raw message (repositoriesStore.ts:30-44,
  RepositoriesScreen.tsx:94-111; message from ErrorMapper.ts:28). We do NOT discriminate error codes —
  the Initialize affordance appears after any failure.
- No `git init` / `git remote add` exist yet; the closest is `setRemoteUrl` (`git remote set-url`,
  array args, URL-as-data, GitService.ts:152-163). Identity-from-a-profile is already solved:
  `setLocalIdentity` writes `--local` user.name/email only (GitService.ts:130-141) and
  remediationExecutor.ts:71 already does `setLocalIdentity(repoPath, profile.gitAuthorName,
profile.gitAuthorEmail)`; identity fields are `Profile.gitAuthorName`/`gitAuthorEmail`
  (core/types.ts:3-16).
- `repositories.create` accepts `assignedProfileId` (RepositoryCreatePayload =
  RepositoryRecordSchema.omit({id}), ipc-schemas.ts:34-35; RepositoryService.ts:32-38) — the new repo
  is created already assigned to the active profile.
- Git IPC is a thin Zod-validated `wrap()` per channel, surfaced on the preload bridge and typed in
  window.d.ts (git:validateRepository ipc-handlers.ts:272-277; git:setLocalIdentity
  ipc-handlers.ts:321-326 + GitSetIdentityPayload ipc-schemas.ts:70-74; bridge preload/index.ts:145-193;
  types window.d.ts:137-152). Add ONE orchestrator channel `git:initializeRepository`.
- Nested-repo detection = `git rev-parse --show-toplevel` + realpath compare (GitService.ts:69-76).
  Running `git init` with `cwd: repoPath` (not `git init <path>`) makes a typo'd path fail on spawn
  instead of creating a phantom folder — so no separate existence check is needed.
- Push has no `-u` today (`['push', remote, branch]`, GitService.ts:191-199; handler
  ipc-handlers.ts:351-353). Add `-u` only when the current branch has no upstream.
- A freshly-init'd repo (unborn HEAD) breaks History: the porcelain parser already ignores
  `# branch.oid (initial)` (PorcelainParser.ts:41-53) so Status/Commit are fine, but
  `getCommitHistory` → `queryCommitLog` runs `git log` (GitService.ts:304-343), which exits non-zero on
  a no-commit repo. Make `getCommitHistory` return `[]` for that case (mirror the getCommitsAhead
  try/catch, GitService.ts:308-321).
- Landing on Commit = `setActiveRepo` + `navigate('commit')` (appStore.ts:29-74). The active profile is
  in the renderer (profilesStore.activeProfileId + profiles, profilesStore.ts:14-39). The URL validator
  is a pure `src/core/` function accepting https/ssh/git@/file://+local paths. All copy is in `STR`
  (strings.ts).

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
2. Tick this phase's box in the "## Phase Checklist" in docs/progress-log.md and re-derive any affected derived views (Feature Track Status row, AGENTS.md build order).
3. Commit ALL changes for this phase (only if exit criteria are met / tests are green):
   git add -A
   git commit -m "Phase N: <name>" -m "<one-line summary of what was built>" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
   Do NOT push — pushing stays manual unless I explicitly ask.
4. Report the test output to me honestly. If anything failed or was skipped, say so explicitly — do not claim success without showing results.
```

---

## Phase 85 — Git remote URL validator (pure core)

```
Work on Phase 85 of GitWarden (docs/plans/initialize-repository-plan.md §"Phase 85"). Pure core only — no IPC, no UI. Honor AGENTS.md rule #1 (src/core is pure — no fs/child_process/electron/DOM imports).

Tasks:
- Add src/core/remoteUrl.ts exporting isValidGitRemoteUrl(url: string): boolean — a format-only check (no network, no filesystem). Accept: https:// and http:// URLs; ssh:// URLs; scp-like git@host:path (and user@host:path); file:// URLs; absolute local paths (POSIX /…; Windows drive/UNC best-effort). Reject: empty/whitespace-only; a bare host/owner/repo with no scheme; strings containing spaces or newlines. Do NOT require a .git suffix.
- Keep it dependency-free (no Zod, no Node) so it runs under plain Vitest and passes core-purity.

Exit: npx tsc --noEmit clean on both tsconfigs; Vitest (tests/unit/remote-url.test.ts) covers each accepted form (https, http, ssh://, git@host:path, file://, POSIX absolute path) and each rejected form (empty, github.com/o/r without scheme, spaces); src/core stays pure (core-purity-reviewer subagent passes); npm test green; npm run lint clean. No IPC/UI.

Then run the standard progress footer.
```

---

## Phase 86 — Init, connect, nested-guard, push `-u` (main + IPC)

```
Work on Phase 86 of GitWarden (docs/plans/initialize-repository-plan.md §"Phase 86"). Main + IPC only — no UI. Honor AGENTS.md rules #2 (GitRunner is the only executor), #3 (args arrays; URL/ref are data), #4 (identity is --local only), #6 (the explicit Initialize click is the action — no second modal).

Tasks:
- GitService.initRepository(repoPath): ['init', '-b', 'main'], readOnly:false, run with cwd: repoPath (so a non-existent/typo'd path fails on spawn instead of creating a phantom folder).
- GitService.addRemote(repoPath, name, url): ['remote', 'add', name, url], readOnly:false; url is a single array element, never shell-interpolated (mirror setRemoteUrl, GitService.ts:152-163).
- Nested-repo helper: run ['rev-parse', '--show-toplevel'] (readOnly:true); return the canonical toplevel on success or null on error; compare via fs.realpath against the canonical target folder.
- GitService.push upstream: before pushing, probe ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']; if it errors (no upstream), push with ['push', '-u', remote, branch], else keep ['push', remote, branch]. Auth/env unchanged (GitService.ts:191-199).
- Orchestrator IPC git:initializeRepository: new GitInitializePayload = { repoPath: string, remoteUrl?: string, identityName: z.string().min(1), identityEmail: z.string().min(1) } in ipc-schemas.ts. Handler (copy the wrap() shape of git:validateRepository, ipc-handlers.ts:272-277): (1) nested-check → if inside an existing repo, throw a plain-language error naming the enclosing toplevel; (2) initRepository; (3) setLocalIdentity(repoPath, identityName, identityEmail) (GitService.ts:130-141); (4) if remoteUrl present, TRY addRemote(repoPath, 'origin', remoteUrl) and on failure capture the message. Return { name: basename(repoPath), remoteUrl?: <url if added>, remoteError?: <message> } — never roll back the init.
- Bridge: git.initializeRepository(...) in preload/index.ts (mirror preload/index.ts:145-193) and its type in src/renderer/types/window.d.ts (mirror window.d.ts:137-152).

Exit: npx tsc --noEmit clean; Vitest integration (offline, real temp dirs) — initRepository creates .git on branch main; addRemote adds origin; the nested check returns the enclosing toplevel for a subfolder and null for a standalone folder; the orchestrator writes --local identity + adds the remote, and with a bad remote URL still leaves the repo initialized and returns a remoteError; the orchestrator refuses (throws) when the target is inside an existing repo, leaving no .git in the subfolder; push uses -u when there is no upstream and omits it once one exists (verified against a local bare remote); npm test green; npm run lint clean; the safety-reviewer subagent passes (args arrays, --local only, no secrets logged, no global/system state). No UI.

Then run the standard progress footer.
```

---

## Phase 87 — Empty-repo (unborn HEAD) tolerance (main)

```
Work on Phase 87 of GitWarden (docs/plans/initialize-repository-plan.md §"Phase 87"). Main only — no UI. Honor AGENTS.md rules #2/#3.

Tasks:
- GitService.getCommitHistory: wrap the queryCommitLog call so the "no commits yet" case (git exits non-zero on an unborn HEAD) returns [] instead of throwing, mirroring the existing getCommitsAhead try/catch (GitService.ts:308-321, 323-343). Other errors still propagate.
- Confirm getStatus already tolerates an unborn HEAD (the porcelain parser ignores # branch.oid (initial), PorcelainParser.ts:41-53) with a test; adjust the parser ONLY if the test proves it necessary (if so, core-purity must still pass).

Exit: npx tsc --noEmit clean; Vitest integration (offline, real temp repo) — on a git init'd dir with NO commits, getCommitHistory(...) returns [] (no throw) and getStatus(...) returns a valid GitStatus (branch main, empty files); existing history/status tests stay green; npm test green; npm run lint clean; core-purity-reviewer passes if the parser is touched. No UI.

Then run the standard progress footer.
```

---

## Phase 88 — Inline Initialize panel + land on Commit (renderer + e2e)

```
Work on Phase 88 of GitWarden (docs/plans/initialize-repository-plan.md §"Phase 88"). Renderer + e2e — the feature-complete stop point. Honor AGENTS.md rule #6 (explicit click is the action — no modal) and the no-hard-coded-strings rule.

Tasks:
- repositoriesStore (repositoriesStore.ts:30-44): add initializeRepository(localPath, remoteUrl, identity, profileId) mirroring addRepository — call window.api.git.initializeRepository({ repoPath: localPath, remoteUrl, identityName, identityEmail }); on success call repositories.create({ name, localPath, remoteUrl, assignedProfileId: profileId, isFavorite: false }), push into repos, and return { repo, remoteError? }.
- RepositoriesScreen (RepositoriesScreen.tsx:328-417): in add mode, after a failed Validate & Add, render an "Initialize Git repository" button. Clicking reveals an inline mini-form: an optional GitHub URL input, an identity line "Identity: <active profile displayName> (<gitAuthorEmail>)", and an "Initialize" button. If there is NO active profile (profilesStore.activeProfileId null, profilesStore.ts:14-39), replace the button with a hint ("Select or create a profile first") and block init. On submit: if the URL is non-empty, validate with isValidGitRemoteUrl (Phase 85) and show an inline message on failure; otherwise call initializeRepository with the active profile's gitAuthorName/gitAuthorEmail + id. On success setActiveRepo(repo) + navigate('commit') (appStore.ts:29-74); on a nested-repo error show the warning; on a partial remote failure (remoteError) show the note but still proceed.
- Strings: add to strings.ts — the Initialize button label, URL label/placeholder, the identity-line template, the no-profile hint, the nested-repo warning, the invalid-URL message, and the partial-remote note. English; no hard-coded user-facing strings.

Exit (Playwright e2e, offline fixtures + local bare remote): browse to a temp non-git dir → Validate & Add fails → the Initialize panel appears; with an active profile, entering a local bare repo path as the URL → Initialize → the repo appears assigned to the active profile, its local identity equals the profile's (assert via effective identity / git config --local), the app lands on Commit, and History/Commit render the empty repo without an error; no active profile → the button is replaced by the hint and no repo is created; a folder inside an existing repo → the nested-repo warning shows and no .git is created in the subfolder. npm test, npm run e2e, npm run lint all green; no hard-coded user-facing strings.

Then run the standard progress footer.
```
