---
status: draft
owner: Taras Shchadylo (PM + Tech Lead)
reviewers: []
updated_at: 2026-06-28
feature_size: XL
---

# Spec — gitwarden

<!-- Inputs cited: docs/features/gitwarden/CONTEXT.md (glossary); sources read — docs/plans/gitwarden-plan.md (§1–§3, §8–§12, §15–§17), README.md, DECISIONS.md, SECURITY.md; ideation — sdd:researcher (competitive landscape), sdd:devils-advocate (failure-mode hunt). Architecture-map absent (survey not run); spec captured at product level. -->

## 1. Context

A **Developer** who works across multiple GitHub accounts — primarily an employee with separate **work** and **personal** accounts, and secondarily a contractor handling **client** repositories — routinely risks acting with the wrong identity. The everyday accidents are committing with the wrong author name/email, pushing to the wrong repository, or pushing with the wrong key/account. The danger is two-sided: the **Author Identity** written into the commit _and_ the **Transport Identity** that authenticates the push are independent — a Developer can have the correct email and still push with the wrong key or account. Today this mistake is usually noticed only after it has already reached the remote.

Why now: multi-account development is the norm (one machine spanning employer and personal work), and the cost of a leak is concrete — a personal email embedded in an employer's history, or employer code reaching a remote under a personal account, carries privacy, compliance, and reputational consequences. Existing Git GUIs and do-it-yourself setups treat identity as something the Developer _selects or organizes_, not something the tool _enforces and audits_; none close the three-way binding of commit identity, transport key, and account ownership at the moment of push.

The committed approach: a **cross-platform desktop application** built around **Profiles**, where each **Repository** is bound to exactly one Profile, the active identity is **continuously visible**, and a **Safety Verdict** is surfaced before every identity-bearing action — **blocking** on hard mismatches and **warning** on soft ones. GitWarden is deliberately a **local convenience-and-visibility guard, not a security boundary**: local checks are bypassable, and the authoritative boundary remains server-side account/branch protection. Where a fact cannot be locally verified — notably the account behind an SSH key — it is presented as **assumed/unverified** rather than asserted, so a green verdict is never mistaken for a server-enforced guarantee.

**Verdict classification (hard = block, soft = warn).** _Hard_ mismatches block the action: the Active Profile differs from the Repository's Bound Profile (AC-07); the Effective Identity author name **or** email differs from the Active Profile (AC-05b); the host parsed from the target remote URL is not the Active Profile's expected host (AC-08). _Soft_ mismatches warn and allow the action behind a single explicit confirmation: the Effective Identity is inherited from global configuration (AC-11); the account behind the key is assumed/unverified (AC-12). Assumed/unverified facts are never used as a hard block.

<!-- Traceability / critic overrides: none yet. -->

## 2. Goals

- Prevent wrong-identity commits and pushes by surfacing a clear, reasoned Safety Verdict before every identity-bearing action.
- Keep the active identity — Active Profile, Effective Identity and its source, key/account, Repository binding, branch, and target remote — continuously visible so the Developer never acts blind.
- Let the Developer do everyday Git work across multiple accounts without the terminal while staying confident the right identity is in use.

## 3. Non-goals

- **Not a full-featured Git client** (interactive rebase, conflict editor, commit graph, stash UI) — that scope would dilute the identity-safety focus that is the product's reason to exist.
- **Not a security boundary or access-control system** — local checks are bypassable by other tools, so server-side branch/account protection remains the real enforcement; stating this prevents a green verdict being mistaken for server-enforced safety.
- **Does not create, manage, or rotate SSH keys or accounts** — it reads and surfaces the Developer's existing key/agent configuration, to avoid owning the credential lifecycle.
- **Not a team, cloud-sync, or hosted service** — it runs locally per Developer with no server storing identities, to keep the trust surface minimal.
- **Does not clone or initialize repositories** — the app registers existing local Git repositories only; obtaining a repository (clone, `init`) stays with the Developer's existing tools, keeping the MVP scoped to identity safety over repos already on disk.
- **Not a commit-history browser** — "view history" is a read-only linear list of recent commits; a commit graph, diff viewer, or commit-detail browser is out of scope (it would dilute the identity-safety focus).

## 4. User stories

- **US-01 Define profiles** — As a Developer, I want to define named Profiles for my accounts (work, personal, client) so the app knows each identity I switch between.
- **US-02 Bind a repository to a profile** — As a Developer, I want to bind each Repository to exactly one Profile so the app knows which identity that Repository expects.
- **US-03 See the active identity** — As a Developer, I want the Active Profile, Effective Identity and its source, Repository binding, branch, and target remote always visible so I never act blind.
- **US-04 Commit safely** — As a Developer, I want a Safety Verdict before I commit so I don't author a commit with the wrong name or email.
- **US-05 Push safely** — As a Developer, I want a Safety Verdict before I push so I don't push to the wrong Repository or with the wrong account/key.
- **US-06 Fix identity in one step** — As a Developer, I want to set a Repository's local identity to the Active Profile in one action so I can resolve a mismatch without the terminal.
- **US-07 Do everyday Git without the terminal** — As a Developer, I want to stage, commit, branch, fetch, pull, push, and view history in one place so multi-account work stays safe.
- **US-08 Be told what cannot be verified** — As a Developer, I want facts the app cannot verify locally (the account behind an SSH key) shown as assumed/unverified so I don't over-trust a green verdict.
- **US-09 Register a local repository** — As a Developer, I want to add an existing local Git repository to the app so I can open, manage, and bind it.

## 5. Acceptance criteria

- **AC-01 (US-01) — happy:** Given a Developer with no Profiles, When they define a Profile with a display name, author name, author email, expected account/host, and key alias, Then the Profile is saved and becomes available to select and to bind to Repositories.
- **AC-02 (US-02) — happy:** Given a registered Repository and at least one Profile, When the Developer binds the Repository to a Profile, Then the binding persists across app restarts and is shown wherever the Repository appears.
- **AC-03 (US-02) — domain invariant:** Given any registered Repository, Then it is bound to at most one Profile at a time, and binding it to a new Profile replaces the previous binding.
- **AC-04 (US-03) — happy:** Given an open Repository with an Active Profile, Then the app continuously displays the Active Profile, the Effective Identity (author name and email) with its source (repository-local or global), the Bound Profile, the current branch, and the target remote.
- **AC-04b (US-03) — default behavior:** Given a Repository with a Bound Profile is opened, When it becomes the open Repository, Then its Bound Profile is made the Active Profile automatically, and the Developer may override the Active Profile manually; an override that leaves the Active Profile different from the Bound Profile is the state AC-07 then blocks on commit.
- **AC-05 (US-04) — happy:** Given the Active Profile matches the Bound Profile and the Effective Identity author name and email both match the Active Profile, When the Developer commits with staged changes and a non-empty message, Then the commit proceeds and is authored with the Active Profile's name and email.
- **AC-05b (US-04) — authorization:** Given the Effective Identity author name or email differs from the Active Profile, When the Developer attempts to commit, Then the commit is blocked and the differing field (name and/or email) is named.
- **AC-06 (US-04) — error:** Given there are no staged changes or the commit message is empty, When the Developer attempts to commit, Then the commit is blocked and the specific reason is shown.
- **AC-07 (US-04) — authorization:** Given the Active Profile differs from the Repository's Bound Profile, When the Developer attempts to commit, Then the commit is blocked until the correct Profile is made active or the binding is corrected.
- **AC-08 (US-05) — authorization:** Given the host parsed from the target remote URL is not the Active Profile's expected host, When the Developer attempts to push, Then the push is blocked and the likely wrong-account/wrong-key cause is explained. Matching is on host only; the repository owner/org is not checked.
- **AC-09 (US-05) — happy:** Given the Active Profile matches the Bound Profile and the target remote's host is expected, When the Developer pushes, Then the push proceeds only after an explicit confirmation that restates the Repository, branch, target remote, and acting identity.
- **AC-09b (US-05) — warning path:** Given a push carries a soft/warning verdict (globally-inherited identity per AC-11, or an assumed/unverified key account per AC-12) but no hard mismatch, When the Developer pushes, Then the same explicit confirmation is shown with the warning restated, and the push proceeds on a single confirmation; assumed/unverified facts never block.
- **AC-10 (US-06) — happy:** Given the Effective Identity is inherited from global configuration or differs from the Repository's Bound Profile, When the Developer chooses the one-step fix to align the local identity, Then the repository-local identity is updated to the Bound Profile's name and email and the global configuration is left unchanged.
- **AC-11 (US-03, US-04) — cross-context:** Given the Effective Identity comes only from global configuration and is not set for this Repository, When the Developer reviews the Safety Verdict, Then a warning states the identity is inherited globally and may not be intended for this Repository.
- **AC-12 (US-08) — domain invariant:** Given a push that authenticates over a key whose account cannot be locally verified, Then the acting account is presented as assumed/unverified and is never shown as a verified fact or used as a hard block; an unexpected host (AC-08) still blocks independently of this account assumption.
- **AC-13 (US-07) — happy:** Given a registered Repository, When the Developer stages or unstages files, switches or creates a branch, fetches, pulls, or views history, Then each action completes without requiring the terminal; these read/navigation actions display the active identity context for visibility but are not gated by a blocking verdict — only commit and push are gated. "View history" presents a read-only linear list of recent commits (author, message, date); no commit graph or diff browser (§3).
- **AC-14 (US-05) — error:** Given a push fails because of an authentication problem, Then the failure is presented as a human-readable explanation rather than raw tool output.
- **AC-15 (US-05) — cross-context:** Given commits were authored outside the app (for example in the terminal) with an identity differing from the Bound Profile, When the Developer pushes through the app, Then the verdict reflects the current identity configuration and the app does not claim to have verified the authorship of pre-existing commits.
- **AC-16 (US-09) — happy:** Given an existing local Git repository on disk, When the Developer adds it by selecting its folder, Then it becomes a registered Repository available to open and to bind to a Profile. The app registers existing local repositories only — it does not clone or initialize repositories (§3).

## 6. Non-functional requirements

| Aspect                          | Target (numeric)                                                               | Measurement                                                     |
| ------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Safety Verdict latency          | Verdict displayed within 300 ms of opening a Repository or staging a change    | UI performance test against a fixture Repository                |
| Status refresh                  | Status refreshes within 500 ms for a Repository with up to 1,000 changed files | Timed test against a generated fixture                          |
| Offline operation               | 100% of identity-safety checks function with no network access                 | Full test suite executes offline (no network calls in any test) |
| Cross-platform support          | Runs on 3 operating systems (macOS, Linux, Windows)                            | Green CI matrix on all three                                    |
| Cancellation of long operations | Any fetch/pull/push is cancellable within 1 s of the request                   | Integration test asserting the underlying process is terminated |
| Secret hygiene                  | 0 secrets or tokens present in logs                                            | Automated log-scan test plus redaction at the logging boundary  |

### 6.1 Security / privacy

- **Data classification.** Profiles hold low-sensitivity personal data (author name/email, account usernames, key aliases) stored locally. Account tokens (where used) are secrets, stored via OS-backed secure storage, never in plaintext, never logged.
- **Personal data.** Author names/emails and account usernames are personal data, stored only on the Developer's machine; there is no server-side collection.
- **AuthZ / AuthN impact.** The product grants no access — it surfaces identity. It never modifies global Git configuration (repository-local only). Tokens, when present, can be disconnected locally.
- **Key/account resolution (no SSH config parsing — by design).** The app reads **no** SSH configuration to resolve which key/account authenticates a push. For AC-08 it parses only the **host** from the remote URL; for AC-12 it treats the account behind the key as the Profile's configured expectation, shown **assumed/unverified**, never resolved live. Key selection is delegated entirely to the Developer's ambient SSH agent / OS SSH client (the app passes through `SSH_AUTH_SOCK` only; it sets no `GIT_SSH_COMMAND` and parses no `~/.ssh/config`). No live key resolver is built — consistent with §1, §3, and AC-12.
- **Abuse / failure cases:**
  1. **Over-trust** — the Developer treats a green verdict as server-enforced and pushes risky changes via another tool; mitigated by explicit "local convenience, not a security boundary" framing.
  2. **SSH-account blind spot** — a mis-mapped key authenticates as the wrong account, which the app cannot locally verify; mitigated by presenting the account as assumed/unverified, never a hard block.
  3. **Mis-binding** — a Repository bound to the wrong Profile yields confidently wrong verdicts; mitigated (candidate, see §8) by warning on implausible bindings.
  4. **Guard fatigue** — repeated false-positive blocks lead the Developer to bypass or disable checks; mitigated by minimizing false positives and keeping warnings distinct from blockers.
  5. **Token persistence after disconnect** — disconnecting an account removes the local token but may not revoke it server-side; mitigated by directing the Developer to revoke it server-side and stating the limitation.
- **Security review verdict.** Advisory-only product; no destructive or remote action without confirmation; irreversible actions are distinctly warned; secrets use OS-backed secure storage. Reviewed against the project threat model (`SECURITY.md`) for MVP scope.

## 7. Metrics / KPIs

> The KPIs below are measured against a **local safety-event record** the app keeps — an on-device log of Safety Verdicts and identity-bearing actions (no server collection, per §6.1). This record is the load-bearing capability behind KPI-1 and KPI-2.

- **KPI-1 — Wrong-identity actions prevented (headline).** Baseline: not measurable today (no guard exists) → Target: ≥ 95% of detected identity-mismatch commit/push attempts are blocked before completion, over the first 3 months of use. Measured via the in-app safety-event record.
- **KPI-2 — Mis-push incidents.** Baseline: TBD (measurement plan: in-app safety-event record + Developer-reported incidents) → Target: < 1 reported wrong-identity push per active Developer per 6 months.
- **KPI-3 — Terminal-free everyday Git.** Baseline: 0% (all Git work in the terminal) → Target: ≥ 80% of a Developer's daily commits and pushes performed through the app within 1 month of adoption.
- **KPI-4 — Identity clarity.** Baseline: TBD (usability check) → Target: ≥ 90% of Developers can correctly state the acting Profile/identity when prompted, within the first month.

## 8. Open questions

- [ ] Should the app detect and warn on _implausible_ Repository↔Profile bindings (e.g. an organisation-named remote bound to a personal Profile), since a mis-binding makes every verdict confidently wrong? Default now: no automatic plausibility check (manual binding only). — owner: Product, due: next feature cycle.
- [ ] How should the app handle non-linear push targets (forks with a separate upstream, multiple remotes, detached HEAD, monorepo/submodule/worktree) where the resolved target may not be what Git actually pushes? Default now: evaluate the single resolved target; advanced topologies out of scope. — owner: Tech Lead, due: design stage.
- [ ] Should the app verify the authorship of the commits actually being pushed (not just the current configuration), to catch commits authored elsewhere with the wrong identity? Default now: check current identity configuration only. — owner: Product, due: roadmap review.
- [ ] What privacy-preserving signal (if any) is needed to detect guard bypass/disable patterns in the wild, given there is no telemetry today? Default now: none. — owner: Product, due: post-launch.
- [ ] What numeric bound should the false-positive verdict rate carry, to make the §6.1(4) guard-fatigue mitigation measurable? Default now: none (no baseline until the guard is deployed). — owner: Product, due: post-launch.
