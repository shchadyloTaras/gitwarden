# GitWarden — Client Branch Access Implementation Plan

> Add a **per-repository push policy** so a user can work on a **client's repository from their own GitHub account** (collaborator access, no client token) without ever pushing to a branch they shouldn't. The Safety Engine gains local, _verifiable_ guards — branch scope, protected-branch block, and remote owner/repo identity — surfaced before every push.
>
> **Reframing the Profile (no schema change to its meaning):** a Profile already describes a _working context_ (identity + expected remote hosts + optional linked GitHub), not "whose account owns the repo." The client stays the repo owner and adds the user as a collaborator; GitWarden enforces the **local** half of the contract. This plan does **not** require the client's GitHub account or token.

## 0. How to Read This Plan

A continuation of the main plan (`docs/plans/gitwarden-plan.md`) and the OAuth/AI sub-plans. Same conventions: each phase has a **Goal**, **Tasks**, and an explicit **Exit criteria** gate that always names the tests that must pass. Build **logic-first** — pure `core/` + green Vitest before any UI. Do not start a phase until the previous one's exit criteria are ✅ in `docs/progress-log.md`.

Phase order (continues after Phase 55a; 40–51 belong to other tracks and are independent):

- **Phase 56 — Push Policy Foundations & Pure Helpers** (core, pure) — types, Zod, migration, branch-glob + owner/repo parsing + push-target resolution.
- **Phase 57 — Safety Engine: Branch Access Checks** (core, pure) — the heart; new issue codes, opt-in, deny-overrides-allow.
- **Phase 58 — Policy Persistence, IPC & Push-Path Wiring** (main + store) — resolve the real push target, feed `checkPush`.
- **Phase 59 — Push Policy UI** ← the guarded-workflow experience; **feature-complete stop point**.

**Where you can stop:** Phases 56–58 deliver a fully verified engine (push verdicts computed correctly, headlessly tested). Phase 59 makes it visible and editable. There is no "optional epic" beyond 59 in the MVP — the deferred `ssh -T` actor probe (Appendix C) is the only post-MVP add-on.

**Verifiability principle (unchanged):** every new check lives in pure `core/` and is unit-tested under Vitest with hand-built inputs. Persistence and the push-target resolution are integration-tested; the UI is driven by Playwright against **local fixture repos** (a real git repo in a temp dir, a local bare repo as the "remote") — **no test makes a network call, and no test needs a client's GitHub account.**

---

## 1. Why this feature (and why it's local-only honest)

GitWarden's reason to exist is **preventing the wrong push**. Today the engine verifies identity (name/email/profile) and remote _host_, and — for HTTPS-token pushes — the GitHub _account_ (`GITHUB_ACCOUNT_MISMATCH`, Phase 27). It does **not** check **which branch** you're about to push or **which owner/repo** the push targets. The client-collaborator workflow needs exactly those:

1. **Branch scope** — "this client profile may push only to `client-x/taras/*`; never to `main`/`develop`/`release/*`."
2. **Remote identity** — "this push must go to `client-org/project`, not your personal fork."

### 1.1 GitWarden is the _convenience_ guard, not the _security_ boundary

A desktop client's local check is bypassable (plain `git push`, another GUI, CI). So this feature is **defense-in-depth on the human-error axis**, not access control. The actual boundary is the **client's GitHub branch protection / rulesets** (Appendix B). The plan states this explicitly in the UI and docs so the user never mistakes a green local verdict for server-enforced safety.

### 1.2 What is and isn't locally verifiable (drives every design call)

| Fact                                  | Locally verifiable before push?     | How                                  |
| ------------------------------------- | ----------------------------------- | ------------------------------------ |
| Current branch                        | ✅ yes                              | `git status` / current ref           |
| Push-target remote owner/repo         | ✅ yes                              | parse the resolved remote URL        |
| Branch ∈ allowed / ∈ blocked patterns | ✅ yes                              | pure glob match                      |
| GitHub actor on **HTTPS-token** push  | ✅ yes (Phase 27 already)           | token → `/user` login                |
| GitHub actor on **SSH** push          | ❌ **no** (without a network probe) | only known _after_ the SSH handshake |

The SSH-actor gap is the single most important honesty constraint: the push sheet must present the actor as **assumed from config (unverified)** on SSH, never as a verified fact (see Appendix C). Everything else is a hard, local, testable check.

---

## 2. Domain Model Additions (`core/types.ts`)

Extends `RepositoryRecord`. All plain TS, Zod-validated at the storage/IPC boundary. **Policy is opt-in** — a record with no `pushPolicy` behaves exactly as today (`unrestricted`).

```ts
export type PushPolicyMode = 'unrestricted' | 'branchScoped'

export interface RepositoryPushPolicy {
  mode: PushPolicyMode
  /** Glob patterns the current branch MUST match (branchScoped only). See Appendix A. */
  allowedBranchPatterns: string[] // e.g. ['client-x/taras/*', 'feature/taras/*']
  /** Glob patterns that are ALWAYS denied — highest precedence, both modes. */
  blockedBranchPatterns: string[] // e.g. ['main', 'develop', 'release/*']
  /** Expected push-target identity. Compared against the resolved push remote. */
  expectedRemoteOwner?: string // 'client-org'
  expectedRemoteRepo?: string // 'project'
  /**
   * Optional per-repo OVERRIDE of the expected GitHub actor. When absent, the actor
   * defaults to the assigned profile's linkedGitHub.login. Only meaningfully *verified*
   * on HTTPS-token pushes (reuses GITHUB_ACCOUNT_MISMATCH); on SSH it is informational.
   */
  expectedGitHubActor?: string // '@taras'
  /** Optional free-text branch suggestion shown on the Branches screen, e.g. a prefix. */
  suggestedBranchPrefix?: string // 'client-x/taras/'
}
```

`RepositoryRecord` gains one optional field:

```ts
export interface RepositoryRecord {
  // …existing fields…
  pushPolicy?: RepositoryPushPolicy
}
```

> **Deliberately NOT in the model** (vs the original sketch — rationale in Appendix D): a `pullRequestOnly` mode, a `requirePullRequestForProtectedBranches` boolean, and a `PUSH_POLICY_MISSING` blocker. They overlap with `blockedBranchPatterns` / `mode` or would regress every existing repo. Two modes + two pattern lists fully express the MVP.

---

## 3. New Pure Helpers (`core/`)

All pure, no IO — unit-tested directly. Reuse where possible; `isHttpsGitHubRemoteUrl` already exists in `core/github/remoteUrl.ts`.

```ts
// core/safety/branchPatterns.ts
/** Glob match per Appendix A: '*' within a segment, '**' across '/', case-sensitive, anchored. */
export function matchesBranchPattern(branch: string, pattern: string): boolean
export function matchesAnyPattern(branch: string, patterns: string[]): boolean

// core/github/remoteOwner.ts
/** Parse owner/repo from BOTH scp-like SSH (git@github.com:o/r.git) and HTTPS. Strips '.git'. */
export function parseRemoteOwnerRepo(url: string): { owner: string; repo: string } | undefined

// core/safety/pushTarget.ts
/** The single remote a push will actually target: the upstream's remote, else a preferred
 *  name (default 'origin'), else the sole remote, else undefined. Pure — inputs only. */
export function resolvePushTarget(input: {
  remotes: GitRemote[]
  upstream?: string // e.g. 'origin/client-x/taras/foo' from GitStatus.upstream
  preferredRemoteName?: string // default 'origin'
}): GitRemote | undefined
```

`SafetyCheckService.checkPush` (pure) consumes these — see §5.

---

## 4. Verdict computation (sequence)

```text
checkPush(repo, activeProfile, identity, remotes, currentBranch, upstream, github?)
   │
   ├─ existing identity + host + GitHub-account checks  (unchanged)
   │
   ├─ if !repo.pushPolicy || mode === 'unrestricted'  → no policy issues (opt-in)
   │
   ├─ resolvePushTarget({remotes, upstream})  → target remote
   │     └─ parseRemoteOwnerRepo(target.url)  → {owner, repo}
   │           ├─ owner !== expectedRemoteOwner  → REMOTE_OWNER_MISMATCH (blocker)
   │           └─ repo  !== expectedRemoteRepo   → REMOTE_REPO_MISMATCH  (blocker)
   │
   └─ branch evaluation (precedence: BLOCKED wins over ALLOWED)
         ├─ matchesAny(currentBranch, blockedBranchPatterns) → PROTECTED_BRANCH_PUSH (blocker)
         ├─ branchScoped && allowed is empty                 → PUSH_POLICY_INCOMPLETE (warning, safe-deny)
         └─ branchScoped && !matchesAny(currentBranch, allowed) → BRANCH_NOT_ALLOWED (blocker)
```

`canPush` stays `!hasBlocker(issues)` — so any of the four new blockers disables Confirm Push, exactly like existing blockers.

---

## 5. Safety Logic Extensions

New, **optional** codes — they only fire when a repo has a `branchScoped` policy (or non-empty `blockedBranchPatterns` / expected owner-repo). Repos with no policy are byte-for-byte unchanged.

### New issue codes

| Code                     | Severity | Fires when                                                                                                   |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| `PROTECTED_BRANCH_PUSH`  | blocker  | Current branch matches a `blockedBranchPatterns` entry (e.g. `main`). Message points to "open a PR instead." |
| `BRANCH_NOT_ALLOWED`     | blocker  | `branchScoped` and current branch matches no `allowedBranchPatterns` entry (and isn't explicitly blocked).   |
| `REMOTE_OWNER_MISMATCH`  | blocker  | Resolved push-target owner ≠ `expectedRemoteOwner`.                                                          |
| `REMOTE_REPO_MISMATCH`   | blocker  | Resolved push-target repo ≠ `expectedRemoteRepo`.                                                            |
| `PUSH_POLICY_INCOMPLETE` | warning  | `branchScoped` with an empty `allowedBranchPatterns` (misconfiguration → safe-deny + nudge to fix).          |

### Actor — reuse, don't duplicate

There is **no** new `GITHUB_ACTOR_MISMATCH` code. The actor concept already exists as `GITHUB_ACCOUNT_MISMATCH` (Phase 27), verified only on HTTPS-token pushes. The policy's `expectedGitHubActor` (when set) **overrides** the assigned profile's `linkedGitHub.login` as the expected login fed into that existing check. On **SSH**, the actor is **informational only** — surfaced in the sheet as "assumed (unverified)", never a blocker (Appendix C).

The push confirmation sheet (Phase 14 / 35) gains a **Branch Access** block separating _verified_ facts (branch, owner/repo) from _assumed_ ones (SSH actor).

---

## 6. Implementation Phases

### Phase 56 — Push Policy Foundations & Pure Helpers

**Goal:** types, schema, migration, and the three pure helpers — no engine wiring, no UI.
**Tasks:**

- Add `PushPolicyMode`, `RepositoryPushPolicy` to `src/core/types.ts`; extend `RepositoryRecord` with `pushPolicy?`.
- Add a Zod `RepositoryPushPolicySchema`; extend `RepositoryRecordSchema` (`src/core/schemas.ts`); ensure the persisted-data round-trip tolerates **old records with no `pushPolicy`** (parse → `undefined`, never throw) — that is the migration.
- Implement `matchesBranchPattern` / `matchesAnyPattern` (`core/safety/branchPatterns.ts`) per Appendix A.
- Implement `parseRemoteOwnerRepo` (`core/github/remoteOwner.ts`) for scp-like SSH **and** HTTPS, stripping `.git` / trailing slash.
- Implement `resolvePushTarget` (`core/safety/pushTarget.ts`).

**Exit:** `core/` stays pure; `npx tsc --noEmit` clean on both tsconfigs; Vitest covers — the branch-glob matrix from Appendix A (segment `*`, cross-segment `**`, anchoring, case sensitivity, no-match); `parseRemoteOwnerRepo` for SSH, HTTPS, `.git` suffix, trailing slash, and a non-GitHub/garbage URL (→ `undefined`); `resolvePushTarget` for upstream-wins, preferred-name fallback, sole-remote, and none; `RepositoryRecord` round-trips **with and without** `pushPolicy`.

### Phase 57 — Safety Engine: Branch Access Checks

**Goal:** extend `checkPush` with the §5 codes — pure, fully unit-tested. The heart of the feature.
**Tasks:**

- Extend `SafetyCheckService.checkPush` to accept `upstream?: string` (from `GitStatus.upstream`) alongside the existing inputs, and to evaluate `repo.pushPolicy` using the Phase 56 helpers and the §4 sequence.
- Add the five codes to the `SafetyCode` union + `safetyMessages.ts` (message + severity). Precedence: **blocked overrides allowed**; owner/repo checked against the **resolved push target only** (not "any remote matches").
- Opt-in guarantee: `!pushPolicy || mode === 'unrestricted'` ⇒ **zero** new issues. SSH actor stays informational (no blocker); HTTPS actor reuses `GITHUB_ACCOUNT_MISMATCH` with `expectedGitHubActor` as the override source of the expected login.

**Exit:** Vitest matrix — allowed branch passes; `main` (blocked) → `PROTECTED_BRANCH_PUSH`; off-scope branch → `BRANCH_NOT_ALLOWED`; wrong owner → `REMOTE_OWNER_MISMATCH`; wrong repo → `REMOTE_REPO_MISMATCH`; empty allowed in `branchScoped` → `PUSH_POLICY_INCOMPLETE` (warning) + safe-deny; blocked-and-allowed branch → blocked wins; **regression guard:** an existing repo with no policy produces an issue set identical to pre-Phase-57. `tsc --noEmit` clean.

### Phase 58 — Policy Persistence, IPC & Push-Path Wiring

**Goal:** persist a policy and feed the engine the **real** push target through the store and push path.
**Tasks:**

- Wire `pushPolicy` save/load through the repository storage + the existing repo IPC (Zod-validate the policy payload both directions; reuse `IpcResult<T>`).
- In `safetyCenterStore` (and the push path that drives the push sheet), resolve the effective push remote via `resolvePushTarget` using `GitStatus.upstream` + remotes, parse owner/repo, and pass `upstream` into `checkPush`. Keep the existing `GitHubPushContext` for HTTPS actor; pass `expectedGitHubActor` (when set) as the expected login override.
- SSH actor stays informational — main does **not** run a network probe in the MVP (Appendix C documents the deferred `ssh -T` option).

**Exit:** Vitest/integration — a `pushPolicy` round-trips through storage (save → reload → equal); the store computes a `pushCheck` that reflects the resolved target (a two-remote repo with the policy's owner/repo on a non-default remote is judged against the **upstream's** remote, not "any"); invalid policy IPC payload rejected by Zod (`ok:false`). `tsc --noEmit` clean on both tsconfigs.

### Phase 59 — Push Policy UI (feature-complete stop point)

**Goal:** the guarded-workflow surfaces across the existing screens. Externalize all strings.
**Tasks:**

- **RepositoriesScreen → "Push Policy"** editor: mode toggle (`unrestricted` / `branchScoped`), allowed + protected pattern lists, expected owner/repo, optional actor override, optional suggested prefix.
- **RemoteScreen push sheet → "Branch Access"** block: profile · pushing-as · branch · verdict; **Confirm Push disabled** on any blocker, with "This profile can only push to `<allowed>` — use a Pull Request for `<branch>`" copy. **Visually separate verified** (branch, owner/repo) **from assumed/unverified** (SSH actor).
- **Safety Center → "Branch Access"** block (allowed · current branch · status).
- **Branch badge** near the branch (`main · blocked` / `client-x/taras/fix · allowed`); **suggested branch name** on the Branches screen from `suggestedBranchPrefix`.
- Externalize every new user-facing string in `src/renderer/strings.ts`.

**Exit:** Playwright against a **local fixture repo** (+ a local bare "remote") — pushing on an allowed branch shows a Safe verdict and proceeds **only after explicit confirm**; on `main` the verdict is Blocked and **Confirm Push is disabled**; a wrong owner/repo remote is judged Blocked. `tsc --noEmit` clean; no new hard-coded user strings.

---

## 7. Acceptance Criteria (feature-level)

A user can: open a client repo, set a **branchScoped** push policy (allowed `client-x/taras/*`, protected `main`/`develop`/`release/*`, expected owner/repo `client-org/project`); push on `client-x/taras/...` and have GitWarden show a **Safe** verdict that proceeds only after explicit confirm; be **blocked locally** when on `main` (Confirm disabled, "use a PR" copy), when the resolved push remote is the wrong owner/repo, and when the **wrong profile** is active. The policy works with **no client GitHub account or token**, and the SSH actor is shown as **assumed (unverified)**, never as a verified fact. **Quality gate:** the branch-glob, owner/repo parser, push-target resolver, and the five new safety codes are covered by passing Vitest; persistence + resolved-target wiring by integration tests; the allowed-vs-blocked UI by Playwright on a local fixture; **no test makes a network call or needs a client account.**

---

## Appendix A — Branch Pattern Matching Semantics (canonical)

The one place pattern behavior is defined. Implement exactly this in `matchesBranchPattern`, with tests:

- Patterns match the **short branch name** (`client-x/taras/foo`), anchored — the whole name must match (implicit `^…$`).
- `*` matches any run of characters **except `/`** (one path segment). `**` matches across `/` (any number of segments). `?` matches a single non-`/` char. All other characters are literal.
- Matching is **case-sensitive** (git refs are).
- **Precedence:** an entry in `blockedBranchPatterns` always wins over `allowedBranchPatterns`.
- **Empty `allowedBranchPatterns` in `branchScoped`** is a misconfiguration → **safe-deny** the push and raise `PUSH_POLICY_INCOMPLETE` (warning), rather than silently allowing or hard-blocking with a confusing message.
- `unrestricted` mode ignores `allowedBranchPatterns` entirely; `blockedBranchPatterns` is honored in **both** modes (so you can protect `main` without scoping every feature branch).

Examples: `client-x/taras/*` matches `client-x/taras/fix` but **not** `client-x/taras/a/b` (use `client-x/taras/**` for that) and **not** `client-x/bob/fix`. `release/*` matches `release/1.2` (and protects it).

---

## Appendix B — Required GitHub-Side Protection (the real boundary)

GitWarden's local check is convenience, not access control. The client (repo owner) **must** also configure server-side enforcement, or a plain `git push` from any tool bypasses everything:

- **Branch protection / rulesets** on `main`, `develop`, `release/*`: block direct pushes; require pull requests + review for merge.
- Optionally restrict who may push to which branch patterns (push rulesets) so even a mis-scoped collaborator cannot write to protected refs.
- The collaborator pushes only to their scoped branches (`client-x/taras/*`); changes reach protected branches **only via PR**.

The UI states this ("GitWarden enforces this locally; ask the repo owner to set GitHub branch protection for real enforcement") so a green local verdict is never mistaken for a server guarantee.

---

## Appendix C — Honest Limitation: the SSH actor is not locally verifiable

On an **SSH** push GitWarden cannot know which GitHub identity the key will authenticate as without contacting GitHub — that's only known _after_ the handshake. Therefore in the MVP:

1. `expectedGitHubActor` on SSH is **informational** — the sheet shows "Pushing as **@taras** _(assumed from policy — unverified)_", never a blocker, never a bare "Pushing as @taras" that implies verification.
2. On **HTTPS-token** pushes the actor **is** verified — this reuses the existing `GITHUB_ACCOUNT_MISMATCH` check (Phase 27), with `expectedGitHubActor` overriding the expected login when set.

**Deferred (post-MVP) option:** a best-effort `ssh -T git@github.com` probe through `GitRunner` parses `Hi <login>!` to verify the SSH actor before push. It's a network call with its own failure modes, so it's intentionally out of the Phase 56–59 MVP; add it only if real-world use shows the unverified label isn't enough.

---

## Appendix D — Data-Model Decisions (vs the original sketch)

Three fields from the first sketch were **dropped**; recording why so they aren't re-added without cause:

- **`mode: 'pullRequestOnly'`** — a desktop git client cannot open a PR (`git push` ≠ a GitHub PR API call). In practice "PR-only" reduces to "block direct pushes to protected branches," which `blockedBranchPatterns` already expresses. Dropped to keep one clear mental model.
- **`requirePullRequestForProtectedBranches: boolean`** — overlaps with `blockedBranchPatterns`; having both creates undefined precedence ("flag true but branch not in blocked list — now what?"). The pattern list is the single source of truth.
- **`PUSH_POLICY_MISSING` as a blocker** — every existing repo has no policy; emitting a blocker would regress the whole app. Policy is **opt-in**; absence means `unrestricted`. (If a "you haven't scoped this client repo yet" nudge is ever wanted, it should be at most a dismissible warning gated on an explicit "this is a client repo" flag — not in the MVP.)

The MVP keeps **two modes** (`unrestricted` | `branchScoped`) + **two pattern lists** + **expected owner/repo** + an **optional actor override** — the smallest model that delivers every acceptance criterion.
