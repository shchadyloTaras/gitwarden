# Repository Mismatch Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace warning triangles in repository rows with a neutral repository tile and a subtle amber mismatch dot.

**Architecture:** Keep the existing mismatch predicate and repository-row ownership in
`RepositoriesScreen`. Render a small local JSX icon component with an inline decorative SVG and a
conditional accessible status dot, then style both through the existing repository-screen
stylesheet. No dependency, state, IPC, persistence, or safety-engine changes are required.

**Tech Stack:** React 18, TypeScript strict mode, CSS custom properties, Playwright Electron e2e.

## Global Constraints

- Preserve the existing mismatch predicate exactly.
- Render the neutral repository tile for every repository row.
- Render the amber dot only when the assigned profile differs from the active profile.
- Keep `repo-item-mismatch` stable for existing automation.
- Use an inline SVG and existing theme tokens; add no package.
- Externalize the accessible mismatch label in `STR`.
- Do not alter the detailed mismatch warning or remediation.
- Do not commit unless the user separately requests it; the worktree contains in-progress Phase
  118 changes and GitWarden commits are phase-gated.

---

### Task 1: Repository tile and mismatch dot

**Files:**

- Modify: `tests/e2e/repositories.spec.ts:139-150,198-212`
- Modify: `src/renderer/strings.ts:82-86`
- Modify: `src/renderer/screens/RepositoriesScreen.tsx:12-49,320-378`
- Modify: `src/renderer/screens/dataScreens.css:120-130`

**Interfaces:**

- Consumes: existing `mismatch` predicate in `RepositoriesScreen`.
- Produces: `RepositoryListIcon({ mismatch }: { mismatch: boolean }): React.ReactElement`.
- Produces: `STR.REPOSITORY_PROFILE_MISMATCH: string`.
- Preserves: `data-testid="repo-item-mismatch"` for the conditional status dot.
- Adds: `data-testid="repo-item-icon"` for the neutral icon tile.

- [ ] **Step 1: Write failing Playwright assertions**

In the first repository-management test, replace the current mismatch-indicator assertion with:

```ts
const repositoryRow = win.getByTestId('repo-item').filter({ hasText: repoName })
const repositoryIcon = repositoryRow.getByTestId('repo-item-icon')
const mismatchIndicator = repositoryRow.getByTestId('repo-item-mismatch')

await expect(repositoryIcon).toBeVisible()
await expect(mismatchIndicator).toBeVisible()
await expect(mismatchIndicator).toHaveAttribute('aria-label', 'Profile mismatch')
await expect(mismatchIndicator).toHaveText('')
await expect(repositoryRow).not.toContainText('⚠')
```

In the test where the active profile matches after save, add:

```ts
const repositoryRow = win.getByTestId('repo-item').filter({ hasText: path.basename(fixtureRepo) })
await expect(repositoryRow.getByTestId('repo-item-icon')).toBeVisible()
await expect(repositoryRow.getByTestId('repo-item-mismatch')).toHaveCount(0)
```

- [ ] **Step 2: Run the focused e2e test and verify RED**

Run:

```bash
npm run build
npx playwright test tests/e2e/repositories.spec.ts --grep "adds a repository"
```

Expected: the build succeeds, then Playwright FAILS because `repo-item-icon` does not exist and
the current mismatch element contains the `⚠` character.

- [ ] **Step 3: Externalize the mismatch description**

Add under the Repositories screen strings in `src/renderer/strings.ts`:

```ts
REPOSITORY_PROFILE_MISMATCH: 'Profile mismatch',
```

- [ ] **Step 4: Add the icon component and replace the row markup**

Add this component above the default screen component:

```tsx
function RepositoryListIcon({ mismatch }: { mismatch: boolean }): React.ReactElement {
  return (
    <span data-testid="repo-item-icon" className="gw-repository-list-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.75 7.25A1.75 1.75 0 0 1 5.5 5.5h4l1.75 2h7.25a1.75 1.75 0 0 1 1.75 1.75v8.25a1.75 1.75 0 0 1-1.75 1.75h-13a1.75 1.75 0 0 1-1.75-1.75V7.25Z" />
      </svg>
      {mismatch && (
        <span
          data-testid="repo-item-mismatch"
          className="gw-repository-list-icon__mismatch"
          role="img"
          aria-label={STR.REPOSITORY_PROFILE_MISMATCH}
          title={STR.REPOSITORY_PROFILE_MISMATCH}
        />
      )}
    </span>
  )
}
```

Replace the repository button's two current copy rows with this structure while leaving the
button props, selection styling, and click handler unchanged:

```tsx
<div className="gw-repository-list-row-content">
  <RepositoryListIcon mismatch={Boolean(mismatch)} />
  <div className="gw-repository-list-row-copy">
    <span className="gw-repository-list-row-name">{r.name}</span>
    <span className="gw-repository-list-row-profile">
      {assigned ? assigned.displayName : 'Unassigned'}
    </span>
  </div>
</div>
```

- [ ] **Step 5: Add restrained light/dark-theme styling**

Add beside `.gw-management-repo-row` in `src/renderer/screens/dataScreens.css`:

```css
.gw-repository-list-row-content {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.gw-repository-list-row-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.gw-repository-list-row-name,
.gw-repository-list-row-profile {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gw-repository-list-row-name {
  color: var(--gw-text, #f4f4f5);
  font-size: 14px;
}

.gw-repository-list-row-profile {
  color: var(--gw-text-dim, #52525b);
  font-size: 14px;
}

.gw-repository-list-icon {
  position: relative;
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--gw-border-subtle, #3f3f46);
  border-radius: 6px;
  background: var(--gw-surface-sunken, #111318);
  color: var(--gw-text-muted, #b3b7c5);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
}

.gw-repository-list-icon svg {
  width: 15px;
  height: 15px;
}

.gw-repository-list-icon__mismatch {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 7px;
  height: 7px;
  border: 2px solid var(--gw-surface, #18181b);
  border-radius: 50%;
  background: var(--gw-warning-solid, #a16915);
  box-sizing: content-box;
}
```

- [ ] **Step 6: Verify GREEN and run the renderer gate**

Run:

```bash
npm run build
npx playwright test tests/e2e/repositories.spec.ts
npx tsc -p tsconfig.node.json --noEmit
npx tsc -p tsconfig.web.json --noEmit
npm test
npm run lint
```

Expected: all repository e2e tests pass, both TypeScript projects report no errors, Vitest is
green, and ESLint/Prettier report no violations.

Visually inspect the Repositories list in light and dark themes. Confirm the tile is neutral, the
dot is subtle, long names still ellipsize, and selected rows remain legible.

- [ ] **Step 7: Leave the verified changes uncommitted**

Run:

```bash
git status --short
```

Expected: the icon refinement remains visible alongside the existing in-progress Phase 118 files.
Do not stage or commit it without a separate user request and the repository's phase gate.
