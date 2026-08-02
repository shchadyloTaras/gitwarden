# Plan — Profile Repository Summary: assigned repositories at a glance

**Status:** ✅ complete — Phases 117–118 complete — **derived view**; the
authoritative state is the Phase Checklist in [`docs/progress-log.md`](../progress-log.md).
**Phases:** 117 → 118.
**Feature-complete stop point:** Phase 118.
**Prompts:** [`docs/prompts/profile-repository-summary-prompts.md`](../prompts/profile-repository-summary-prompts.md).

## Goal

The Profiles screen currently shows each identity and whether it is active, but it does not show
how many local repositories are assigned to that profile. A user who has several local working
copies of the same remote — or many unrelated repositories under one identity — must switch to the
Repositories screen and reconstruct the relationship manually.

This feature adds a small repository-count badge to every profile row and, when a profile is
selected for editing, shows its assigned repository names and paths in the existing **Context**
panel. The Context panel explicitly separates the current **Active workspace** from the
**Selected profile**, so inspecting a profile never implies that it has become active.

**Product boundary (decided — repositories, not GitHub accounts):** the number represents local
`RepositoryRecord`s assigned to the profile. `Profile.linkedGitHub` remains a single optional
GitHub account and is not counted.

**Product boundary (decided — local working copies remain distinct):** every repository record
counts once. Two local paths that point to the same remote, or two records with the same display
name, remain two repositories. Unassigned repositories and assignments to deleted/nonexistent
profiles do not contribute to any visible profile count.

**Product boundary (decided — Context, not Edit Profile):** the Edit Profile form remains focused
on identity and authentication. Repository names are read-only contextual information in the
right panel, not new form fields.

## Approved interaction and visual contract

### Profiles list

- Every profile row gets a compact numeric badge between the profile name and the existing
  **Active** / **Set Active** control.
- `0` is visible but muted, so zero assignments are explicit rather than indistinguishable from a
  loading failure.
- `1` and higher use the normal neutral badge treatment. The badge does not compete with the green
  **Active** state.
- The badge remains visible when the right panel is closed or the **AI Chat** tab is selected.
- The accessible label uses repository wording, for example `3 assigned repositories`; the
  visible badge remains numeric to preserve row width.

### Context panel on the Profiles screen

When `activeScreen === 'profiles'`, the existing Context content is grouped as follows:

1. **ACTIVE WORKSPACE** — the current active profile, active repository, branch, and Guard state.
   This is the existing Inspector information, preserved rather than replaced.
2. **SELECTED PROFILE** — the profile clicked in the Profiles list, including its color dot and
   display name.
3. **ASSIGNED REPOSITORIES · N** — a read-only list of the selected profile's local repository
   records. Each row shows the repository name and an ellipsized local path; the full path is
   available through the native tooltip and accessible name.

The selected-profile section is screen-aware: it appears only on the Profiles screen. Context on
Repositories, Status, Commit & Push, Branches, History, Safety Center, and Settings keeps its
current behavior and copy.

Selecting a profile does not activate it, does not open the right panel, and does not switch the
user away from AI Chat. If Context is already visible, it updates immediately. The count badges
provide the always-visible summary.

### State matrix

| State                                             | Profile badge                            | Selected-profile Context                                   |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| No profile selected / creating a profile          | Counts still shown per row               | Compact `Select a profile` prompt; no repository list      |
| Selected profile, zero assignments                | Muted `0`                                | `ASSIGNED REPOSITORIES · 0` + `No repositories assigned`   |
| Selected profile, one assignment                  | Neutral `1`                              | One repository name/path row                               |
| Selected profile, many assignments                | Neutral count                            | Scroll-safe list; every local record shown separately      |
| Duplicate name or remote at different local paths | Each record contributes to the count     | Separate rows distinguished by path                        |
| Initial repository load with no cached data       | `—`/loading treatment, never a false `0` | `Loading repositories…`                                    |
| Repository load failed with no cached data        | `—`, never a false `0`                   | `Repository data unavailable`                              |
| Refresh failed but last-known data exists         | Last-known count with stale indication   | Last-known list + `May be outdated`                        |
| Selected profile is deleted or becomes invalid    | Remaining badges recalculate             | Selection clears to `Select a profile`                     |
| User leaves Profiles                              | Badges are no longer on screen           | Selected-profile section is hidden; normal Context remains |

## Codebase findings (grounding)

Verified against the current tree before writing this plan:

1. **The persisted relationship already exists and has the correct cardinality.** `Profile`
   contains one optional `linkedGitHub`, while every `RepositoryRecord` has its own id, name,
   local path, and optional `assignedProfileId`
   ([types.ts:3-16](../../src/core/types.ts), [types.ts:89-115](../../src/core/types.ts)).
   **Consequence:** the feature derives summaries from existing records; it needs no schema,
   migration, persistence, or GitHub-account model changes.

2. **Profiles and repositories are loaded globally at startup.** `App` starts both store loads in
   the same `Promise.all`
   ([App.tsx:241-248](../../src/renderer/App.tsx), [App.tsx:286-295](../../src/renderer/App.tsx)).
   The repository store already carries `repos`, `loading`, and `error`, and deliberately keeps
   last-known data after a failed refresh
   ([repositoriesStore.ts:4-23](../../src/renderer/store/repositoriesStore.ts),
   [repositoriesStore.ts:25-49](../../src/renderer/store/repositoriesStore.ts)).
   **Consequence:** both badges and Context can use renderer state already in memory; no new
   preload, IPC, main-process, filesystem, or Git execution is justified. Loading/error UI must
   preserve the store's honest distinction between zero, unavailable, and stale data.

3. **The exact Profiles-row seam is local and stable.** `ProfilesScreen` owns the profile list,
   selected-row treatment, display name, and existing Active/Set Active actions
   ([ProfilesScreen.tsx:331-449](../../src/renderer/screens/ProfilesScreen.tsx)).
   **Consequence:** Phase 118 inserts one derived badge without restructuring the row or changing
   activation behavior.

4. **Profile selection is currently trapped inside `ProfilesScreen`.** `selectedId` is local
   component state and drives both the chosen profile and form mode
   ([ProfilesScreen.tsx:55-88](../../src/renderer/screens/ProfilesScreen.tsx)); the form's
   `Edit Profile` title begins at
   [ProfilesScreen.tsx:501-520](../../src/renderer/screens/ProfilesScreen.tsx).
   **Consequence:** expose only the selected profile id through lightweight renderer state so the
   Inspector can observe it. Keep all editable form data and save behavior local; repository data
   is not added to the form.

5. **The Inspector currently represents only the active workspace.** It reads active repository,
   branch, active profile, and Guard state
   ([Inspector.tsx:27-32](../../src/renderer/components/Inspector.tsx)) and renders Profile,
   Repository, Branch, and Guard sections
   ([Inspector.tsx:34-114](../../src/renderer/components/Inspector.tsx)).
   **Consequence:** retain those facts under an explicit `ACTIVE WORKSPACE` group on Profiles,
   then append the independent selected-profile summary. Never relabel selected data as active.

6. **Context is already the deterministic half of the right panel.** `RightPanel` owns separate
   Context and AI Chat tabs and mounts `Inspector` only for the selected Context tab
   ([RightPanel.tsx:7-20](../../src/renderer/components/RightPanel.tsx),
   [RightPanel.tsx:87-101](../../src/renderer/components/RightPanel.tsx)). The app store already
   owns `activeScreen` and other shell-level context
   ([appStore.ts:45-76](../../src/renderer/store/appStore.ts)).
   **Consequence:** screen-aware selected-profile context belongs in `Inspector` plus the existing
   renderer store; no third right-panel tab and no AI Chat changes are needed.

7. **The Repositories screen already proves the reverse lookup is a renderer concern.** It maps a
   repository's `assignedProfileId` back to a profile while rendering its list
   ([RepositoriesScreen.tsx:320-377](../../src/renderer/screens/RepositoriesScreen.tsx)).
   **Consequence:** this feature formalizes the opposite projection — profile to repository
   records — as a small pure-core selector so badge and Context cannot drift in counting rules.

8. **The styling surfaces are already separated by responsibility.** Profile-row management
   styles live in `dataScreens.css`
   ([dataScreens.css:50-124](../../src/renderer/screens/dataScreens.css)); right-panel layout and
   tab containment live in `theme.css`
   ([theme.css:916-980](../../src/renderer/theme.css)).
   **Consequence:** badge styles stay with the Profiles screen and the scroll-safe Context list
   stays with the right panel; no new styling framework or global layout rewrite.

9. **Existing e2e coverage provides the required fixture seams.** `profiles.spec.ts` already
   covers create/edit/delete/activate flows
   ([profiles.spec.ts:36-138](../../tests/e2e/profiles.spec.ts)); `repositories.spec.ts` creates
   profiles and repository assignments through existing typed APIs before navigating between
   Profiles and Repositories
   ([repositories.spec.ts:72-160](../../tests/e2e/repositories.spec.ts)).
   **Consequence:** Phase 118 extends the Profiles spec with real persisted records and verifies
   both visual summary surfaces without fake production-only data.

10. **New user-facing strings have one established home.** Profile copy lives in `STR`
    ([strings.ts:61-73](../../src/renderer/strings.ts)). **Consequence:** labels, empty states,
    stale/error copy, and accessible badge text are externalized there rather than embedded across
    components.

## Scope

- **In:**
  - A count badge on every Profiles-list row, including explicit zero, loading, unavailable, and
    stale-data behavior.
  - One pure deterministic selector shared by the badge and Context list.
  - Renderer-level selected-profile state with cleanup on create, delete, and invalid selection.
  - Screen-aware Context grouping that clearly separates active workspace from selected profile.
  - A read-only selected-profile repository list with name, ellipsized local path, full-path
    tooltip/accessibility, empty/loading/error/stale states, and independent vertical overflow.
  - Unit coverage for assignment/counting/sorting semantics and Playwright coverage for the
    approved UI states and non-regression boundaries.
- **Out / Non-goals:**
  - No support for multiple linked GitHub accounts inside one profile.
  - No repository data, picker, or management controls inside Edit Profile.
  - No assigning, unassigning, deleting, opening, or navigating to a repository from Context.
  - No deduplication or grouping by remote URL, repository name, or filesystem parent.
  - No automatic activation when inspecting a profile.
  - No automatic opening of the right panel or switching away from AI Chat.
  - No changes to Context on screens other than Profiles.
  - No model migration, storage service, Git command, main-process, preload, or IPC changes.

## Pure-core contract (Phase 117)

One small pure module under `src/core/profiles/` owns the definition of an assigned repository
summary. It imports only core types and has no `fs`, `child_process`, Electron, or DOM dependency.

```ts
export interface ProfileRepositoryEntry {
  id: string
  name: string
  localPath: string
}

export interface ProfileRepositorySummary {
  profileId: string
  count: number
  repositories: ProfileRepositoryEntry[]
}

export function buildProfileRepositorySummary(
  profileId: string,
  repositories: readonly RepositoryRecord[]
): ProfileRepositorySummary
```

Contract rules:

- Include a record only when `repository.assignedProfileId === profileId`.
- Count repository records, not unique names, paths, or remotes.
- Return only the read-only fields required by the UI; do not mutate or re-order the input.
- Sort the returned copy deterministically by case-insensitive name, then `localPath`, then `id`.
  This keeps duplicate-name working copies stable and distinguishable.
- Return `{ count: 0, repositories: [] }` for an empty or unassigned set.
- `count` always equals `repositories.length` and is never inferred from load/error state. The
  renderer decides whether a summary is current, loading, stale, or unavailable.

## Phase 117 — Profile repository summary selector (pure core)

**Goal:** establish one tested source of truth for repository-count and list membership before
either renderer surface consumes it.

**Implementation:**

- Add `src/core/profiles/profileRepositorySummary.ts` with the contract and invariants above.
- Add a table-driven Vitest suite covering zero, one, many, unassigned records, another profile's
  records, duplicate names, duplicate remotes, distinct local working copies, deterministic sort,
  and input immutability.
- Include a case with a repository assigned to an unrelated/nonexistent profile id; it must not
  enter the requested profile's summary.

**Exit criteria:** `npx tsc --noEmit` clean for both TypeScript configs; `npm test` green including
the new selector suite; `npm run lint` clean; core-purity rules pass for
`src/core/profiles/profileRepositorySummary.ts`.

**Files:** new `src/core/profiles/profileRepositorySummary.ts`, new
`tests/unit/profile-repository-summary.test.ts`.

---

## Phase 118 — Profile badges and screen-aware Context details (renderer + e2e)

**Goal:** deliver the approved UI for all states without changing Edit Profile, activation, or
other screens' Context.

**Implementation:**

- Extend `appStore` with `selectedProfileId: string | null` and a setter. This is transient
  renderer state only; it is not persisted.
- Migrate the Profiles screen's selected id to that shared value while keeping form fields,
  validation, save progress, OAuth connection state, and delete confirmation local to the screen.
  Selecting a row updates the id; **New Profile** clears it; deleting the selected profile clears
  it; a missing id after a profile refresh is treated as no selection.
- Subscribe `ProfilesScreen` to `repos`, `loading`, and `error`. Build summaries through the Phase
  117 selector and render the compact badge inside every profile row without changing the Active
  / Set Active action or row hit target.
- Extend `Inspector` with `activeScreen`, the selected profile id, and repository-store state.
  On Profiles only:
  - label the current Profile/Repository/Branch/Guard group `ACTIVE WORKSPACE`;
  - render a visual divider;
  - render `SELECTED PROFILE` and `ASSIGNED REPOSITORIES · N` from the same summary used by the
    badge;
  - render repository name and local path as read-only rows, with CSS ellipsis and the full path
    in `title`/accessible text;
  - keep the whole Inspector vertically scrollable and make a long assigned-repository list fit
    the narrow resizable panel.
- When `activeScreen !== 'profiles'`, render the current Inspector structure and wording exactly as
  before. Do not make profile selection open the panel or select the Context tab.
- Externalize all new visible and assistive strings in `strings.ts`; add stable test ids for the
  badge, selected-profile group, summary count, list, repository rows, and state messages.
- Add focused styling in `dataScreens.css` for badges and in `theme.css` for Context grouping,
  repository rows, truncation, stale treatment, divider, and narrow-panel behavior.
- Extend Playwright coverage to seed three profiles and repository records through the existing
  typed bridge, including:
  - counts `0`, `1`, and many;
  - two local records with the same name/remote but different paths counted and listed separately;
  - active Personal while selected Eleken, proving both labels and values remain distinct;
  - full local paths available via tooltip while visible paths truncate safely;
  - create mode and deleted-selection cleanup;
  - selected-profile details hidden after navigating away from Profiles;
  - badges still available while the right panel is closed or AI Chat is selected;
  - Edit Profile fields and existing Active/Set Active behavior unchanged.
- Add renderer unit coverage for selected-profile state reset/persistence semantics if the store
  change cannot be fully and cheaply asserted through the focused e2e cases.

**Exit criteria:** `npx tsc --noEmit` clean for both TypeScript configs; `npm test` green;
`npm run lint` clean; targeted `npx playwright test tests/e2e/profiles.spec.ts` green; the full
Playwright suite green (run in the repository's established safe chunks if required); manual visual
check at a narrow and a wide right-panel width confirms no overlap between count, Active/Set Active,
or truncated paths; every state in the matrix above is either automated or explicitly recorded in
the phase verification entry.

**Files:** edit `src/renderer/store/appStore.ts`, `src/renderer/screens/ProfilesScreen.tsx`,
`src/renderer/components/Inspector.tsx`, `src/renderer/strings.ts`,
`src/renderer/screens/dataScreens.css`, `src/renderer/theme.css`,
`tests/e2e/profiles.spec.ts`; optionally add one focused app-store unit test if needed.

---

## End-to-end acceptance criteria

1. Every profile row truthfully shows how many local repository records are assigned to it.
2. Zero assignments are visible as a muted `0`; loading or unavailable data never masquerades as
   zero.
3. Separate local working copies remain separate even when their repository names or remote URLs
   match.
4. Selecting a profile updates Context without activating that profile.
5. On Profiles, Context clearly shows the current active workspace and the independently selected
   profile at the same time.
6. The selected profile's assigned repository count, names, and paths match the row badge and the
   persisted `assignedProfileId` records.
7. Long local paths do not expand or break the right panel; the complete path remains available to
   pointer and assistive-technology users.
8. Empty, loading, unavailable, stale, invalid-selection, one-record, many-record, and duplicate
   working-copy states follow the approved state matrix.
9. Edit Profile contains no repository list or repository-management controls and retains all
   current fields/actions.
10. Context outside Profiles, Active/Set Active behavior, AI Chat, and right-panel visibility/tab
    choice remain unchanged.
11. The feature adds no new IPC, persistence, Git execution, or main-process authority.

## Decisions locked by this plan

1. Feature slug: `profile-repository-summary`.
2. The badge counts assigned local repository records, not connected GitHub accounts.
3. Duplicate remote/name records at different local paths count independently.
4. The count badge is always present on profile rows; zero is muted.
5. Repository names and paths live in Context, not Edit Profile.
6. Profiles Context distinguishes `ACTIVE WORKSPACE` from `SELECTED PROFILE` and never implies
   that selection changes activation.
7. Repository details are read-only in this track; no deep links or management controls.
8. Selecting a profile does not open/switch the right panel and does not disturb AI Chat.
9. The feature uses existing globally loaded repositories and requires no main/IPC/storage phase.
10. Delivery is two phases: pure summary logic (117), then renderer + e2e (118).

## Open questions

None. Product placement, terminology, counting semantics, all UI states, and phase decomposition
were approved before this plan was written.
