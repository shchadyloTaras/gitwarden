# CHANGELOG Release Automation — Implementation Plan (Slice 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/release` command that, at release time, deterministically gathers the app's commits since the last tag (excluding landing), has the agent summarise them into user-facing `CHANGELOG.md` entries, bumps the version, and makes the release commit + tag locally — the human does the final `git push`.

**Architecture:** Pure, unit-tested functions in `src/core/changelog/` (parse/filter/bump/roll) do everything that must be exact; a thin `scripts/release-changelog.ts` shell (run with the already-installed `vite-node`) wires git + filesystem to those functions; a `.claude/commands/release.md` slash command orchestrates the flow and is the only place the agent writes prose. No agent in CI; no automatic push.

**Tech Stack:** TypeScript (strict), Vitest, Node `child_process.execFileSync` (array args, never a shell), `vite-node` (vitest's runner — already in `node_modules/.bin`, no new dependency).

## Global Constraints

- **`src/core/**` is pure** — no `fs`, `child_process`, Electron, or DOM imports in `src/core/changelog/`. All I/O lives in `scripts/release-changelog.ts`. (AGENTS.md architecture rule; enforced by the `core-purity-reviewer` subagent.)
- **Git args are always an array**, never string-interpolated (AGENTS.md).
- **Never push.** The slash command stops after `git tag`; its `allowed-tools` has no `git push` (mirrors `.claude/commands/commit-phase.md`).
- **TypeScript strict** everywhere; source files in `src/core/changelog/` import siblings with `.js` extensions (matching `src/core/updates/`). Tests and the script import sources **without** an extension (matching `tests/unit/update-version.test.ts`).
- **Source-of-truth values:** repo URL `https://github.com/shchadyloTaras/gitwarden`; current version `0.1.1`; last tag `v0.1.1`; changelog format is *Keep a Changelog* with bottom link-references (see `CHANGELOG.md`).
- **Commit policy — ONE commit for this slice.** This repo enforces a Progress-Log gate on **every** commit via the `.claude/hooks/commit-needs-log.sh` PreToolUse hook (`docs/progress-log.md` must be staged). Therefore: do each task's TDD and keep the tree green, but **do not commit per task** — make a single commit in Task 10 after writing the Progress-Log entry. (The hook checks the index *before* the command runs, so staging must precede the `git commit` in a **separate** Bash call.)
- **Co-author trailer:** `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

### Task 1: Types + `parseGitLog`

**Files:**
- Create: `src/core/changelog/types.ts`
- Create: `src/core/changelog/commits.ts`
- Test: `tests/unit/changelog.test.ts`

**Interfaces:**
- Produces: `interface Commit { hash: string; subject: string; body: string; files: string[] }`, `type BumpKind = 'major' | 'minor' | 'patch' | 'none'`, `interface RollResult { text: string; alreadyRolled: boolean }` (all in `types.ts`); `parseGitLog(raw: string): Commit[]`, plus `const FIELD_SEP = '\x1f'` and `const RECORD_SEP = '\x1e'` (in `commits.ts`).

- [ ] **Step 1: Write the failing test** — create `tests/unit/changelog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseGitLog, FIELD_SEP, RECORD_SEP } from '../../src/core/changelog/commits'

function record(hash: string, subject: string, body: string, files: string[]): string {
  return `${RECORD_SEP}${hash}${FIELD_SEP}${subject}${FIELD_SEP}${body}${FIELD_SEP}\n${files.join('\n')}\n`
}

describe('parseGitLog', () => {
  it('parses hash, subject, body and files for each commit record', () => {
    const raw =
      record('abc123', 'feat: a', 'body line', ['src/a.ts', 'src/b.ts']) +
      record('def456', 'fix: b', '', ['landing/x.astro'])
    expect(parseGitLog(raw)).toEqual([
      { hash: 'abc123', subject: 'feat: a', body: 'body line', files: ['src/a.ts', 'src/b.ts'] },
      { hash: 'def456', subject: 'fix: b', body: '', files: ['landing/x.astro'] },
    ])
  })

  it('returns an empty array for empty output', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('keeps a body that contains newlines intact and tolerates no files', () => {
    const raw = `${RECORD_SEP}h1${FIELD_SEP}sub${FIELD_SEP}line1\nline2${FIELD_SEP}\n`
    expect(parseGitLog(raw)).toEqual([{ hash: 'h1', subject: 'sub', body: 'line1\nline2', files: [] }])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: FAIL — `Failed to resolve import '../../src/core/changelog/commits'`.

- [ ] **Step 3: Create `src/core/changelog/types.ts`**

```ts
// Pure types for the release-changelog tooling (no Node/Electron/DOM imports).
// See docs/superpowers/specs/2026-06-28-changelog-release-automation-design.md.

/** One commit parsed from `git log`, with the files it changed. */
export interface Commit {
  hash: string
  subject: string
  body: string
  files: string[]
}

/** Semantic-version bump magnitude implied by a set of commits. */
export type BumpKind = 'major' | 'minor' | 'patch' | 'none'

/** Result of rolling the `[Unreleased]` section into a dated version section. */
export interface RollResult {
  /** The rewritten changelog text. */
  text: string
  /** True when `## [<version>]` already existed, so nothing changed (idempotent re-run). */
  alreadyRolled: boolean
}
```

- [ ] **Step 4: Create `src/core/changelog/commits.ts`**

```ts
import type { Commit } from './types.js'

// Field/record separators for the `git log --format` string the release script runs. Defined here
// so the parser and its producer (scripts/release-changelog.ts) agree on the wire format.
export const FIELD_SEP = '\x1f' // US — between hash / subject / body / files
export const RECORD_SEP = '\x1e' // RS — before each commit record

/**
 * Parse the output of
 *   git log <range> --format=%x1e%H%x1f%s%x1f%b%x1f --name-only
 * Each record starts with RECORD_SEP; its first three FIELD_SEP-delimited fields are hash, subject,
 * body; the remainder is the newline-separated file list. Splitting on FIELD_SEP (never "\n") keeps
 * multi-line bodies intact.
 */
export function parseGitLog(raw: string): Commit[] {
  return raw
    .split(RECORD_SEP)
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((r) => {
      const [hash = '', subject = '', body = '', filesBlob = ''] = r.split(FIELD_SEP)
      const files = filesBlob
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f !== '')
      return { hash: hash.trim(), subject: subject.trim(), body: body.trim(), files }
    })
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: PASS (3 tests).

---

### Task 2: `filterAppCommits`

**Files:**
- Modify: `src/core/changelog/commits.ts`
- Test: `tests/unit/changelog.test.ts`

**Interfaces:**
- Consumes: `Commit` (Task 1).
- Produces: `filterAppCommits(commits: Commit[]): Commit[]`.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/changelog.test.ts`:

```ts
import { filterAppCommits } from '../../src/core/changelog/commits'

function c(subject: string, files: string[]): { hash: string; subject: string; body: string; files: string[] } {
  return { hash: 'h', subject, body: '', files }
}

describe('filterAppCommits', () => {
  it('drops commits whose every file is under landing/', () => {
    const result = filterAppCommits([c('feat(landing): x', ['landing/a.astro', 'landing/b.css'])])
    expect(result).toEqual([])
  })

  it('keeps commits that touch any non-landing path (even mixed)', () => {
    const mixed = c('feat: x', ['src/a.ts', 'landing/b.astro'])
    const app = c('fix: y', ['src/b.ts'])
    expect(filterAppCommits([mixed, app])).toEqual([mixed, app])
  })

  it('keeps commits that report no files (cannot prove landing-only)', () => {
    const empty = c('chore: merge', [])
    expect(filterAppCommits([empty])).toEqual([empty])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: FAIL — `filterAppCommits is not a function` / import not found.

- [ ] **Step 3: Add `filterAppCommits` to `src/core/changelog/commits.ts`** (after `parseGitLog`):

```ts
/**
 * Drop commits that only touch the landing site. A commit is "landing-only" iff it changed at least
 * one file and EVERY changed path starts with "landing/". Everything else is kept (it touches the
 * app). Commits with no detected files are kept — we cannot prove they are landing-only.
 */
export function filterAppCommits(commits: Commit[]): Commit[] {
  return commits.filter((c) => c.files.length === 0 || !c.files.every((f) => f.startsWith('landing/')))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: PASS (6 tests).

---

### Task 3: `suggestBump`

**Files:**
- Modify: `src/core/changelog/commits.ts`
- Test: `tests/unit/changelog.test.ts`

**Interfaces:**
- Consumes: `Commit`, `BumpKind`.
- Produces: `suggestBump(commits: Commit[]): BumpKind`.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/changelog.test.ts`:

```ts
import { suggestBump } from '../../src/core/changelog/commits'

describe('suggestBump', () => {
  it('returns none for no commits', () => {
    expect(suggestBump([])).toBe('none')
  })

  it('returns patch when only fixes/chores are present', () => {
    expect(suggestBump([c('fix: a', ['src/a.ts']), c('chore: b', ['src/b.ts'])])).toBe('patch')
  })

  it('returns minor when any feat is present', () => {
    expect(suggestBump([c('fix: a', ['src/a.ts']), c('feat: b', ['src/b.ts'])])).toBe('minor')
  })

  it('returns major on a "!" marker', () => {
    expect(suggestBump([c('feat!: breaking', ['src/a.ts'])])).toBe('major')
  })

  it('returns major on a BREAKING CHANGE body', () => {
    expect(suggestBump([{ hash: 'h', subject: 'fix: a', body: 'BREAKING CHANGE: x', files: ['src/a.ts'] }])).toBe('major')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: FAIL — `suggestBump is not a function`.

- [ ] **Step 3: Add `suggestBump` to `src/core/changelog/commits.ts`** (update the type import line to `import type { Commit, BumpKind } from './types.js'`, then add):

```ts
/**
 * Advisory SemVer bump implied by the (already app-filtered) commits, from Conventional Commit
 * subjects/bodies: 'major' on a "!" marker or "BREAKING CHANGE"; else 'minor' on any "feat"; else
 * 'patch'; 'none' when there are no commits. Advisory only — the human confirms the version.
 */
export function suggestBump(commits: Commit[]): BumpKind {
  if (commits.length === 0) return 'none'
  let hasFeat = false
  for (const commit of commits) {
    const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(commit.subject)
    if (match?.[3] === '!' || /(^|\n)BREAKING CHANGE/.test(commit.body)) return 'major'
    if (match?.[1] === 'feat') hasFeat = true
  }
  return hasFeat ? 'minor' : 'patch'
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: PASS (11 tests).

---

### Task 4: `nextVersion`

**Files:**
- Modify: `src/core/changelog/commits.ts`
- Test: `tests/unit/changelog.test.ts`

**Interfaces:**
- Consumes: `BumpKind`; `parseVersion` from `src/core/updates/version.ts` (existing: `parseVersion(raw: string): { major: number; minor: number; patch: number; prerelease: string[] } | null`).
- Produces: `nextVersion(current: string, kind: BumpKind): string | null`.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/changelog.test.ts`:

```ts
import { nextVersion } from '../../src/core/changelog/commits'

describe('nextVersion', () => {
  it('bumps patch and minor normally', () => {
    expect(nextVersion('0.1.1', 'patch')).toBe('0.1.2')
    expect(nextVersion('0.1.1', 'minor')).toBe('0.2.0')
  })

  it('softens a major bump to minor while major is 0 (pre-1.0 policy)', () => {
    expect(nextVersion('0.1.1', 'major')).toBe('0.2.0')
  })

  it('bumps major normally once major >= 1', () => {
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0')
  })

  it('returns null for none or an unparseable current version', () => {
    expect(nextVersion('0.1.1', 'none')).toBeNull()
    expect(nextVersion('not-a-version', 'patch')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: FAIL — `nextVersion is not a function`.

- [ ] **Step 3: Add `nextVersion` to `src/core/changelog/commits.ts`** (add the import `import { parseVersion } from '../updates/version.js'` at the top, then):

```ts
/**
 * Compute the next version string from the current one and a bump kind, applying the repo's pre-1.0
 * policy (docs/release-checklist.md): while major === 0, a 'major' bump is softened to 'minor' (the
 * public API has not stabilised). Returns null for 'none' or an unparseable current version.
 */
export function nextVersion(current: string, kind: BumpKind): string | null {
  if (kind === 'none') return null
  const parsed = parseVersion(current)
  if (!parsed) return null
  let { major, minor, patch } = parsed
  const effective = kind === 'major' && major === 0 ? 'minor' : kind
  if (effective === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (effective === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: PASS (15 tests).

---

### Task 5: `rollUnreleased`

**Files:**
- Create: `src/core/changelog/render.ts`
- Test: `tests/unit/changelog.test.ts`

**Interfaces:**
- Consumes: `RollResult` (Task 1).
- Produces: `rollUnreleased(changelogText: string, version: string, date: string, repoUrl: string, prevTag: string): RollResult`.

- [ ] **Step 1: Write the failing test** — append to `tests/unit/changelog.test.ts`:

```ts
import { rollUnreleased } from '../../src/core/changelog/render'

const REPO = 'https://github.com/shchadyloTaras/gitwarden'
const SAMPLE = `# Changelog

## [Unreleased]

### Added

- New thing.

## [0.1.1] — 2026-06-28

### Fixed

- Old fix.

[0.1.1]: ${REPO}/compare/v0.1.0...v0.1.1
[0.1.0]: ${REPO}/releases/tag/v0.1.0
`

describe('rollUnreleased', () => {
  it('renames [Unreleased] to a dated version, re-opens an empty [Unreleased], and adds the link', () => {
    const { text, alreadyRolled } = rollUnreleased(SAMPLE, '0.2.0', '2026-06-30', REPO, 'v0.1.1')
    expect(alreadyRolled).toBe(false)
    expect(text).toContain('## [Unreleased]\n\n## [0.2.0] — 2026-06-30')
    expect(text).toContain('### Added\n\n- New thing.')
    expect(text).toContain(`[0.2.0]: ${REPO}/compare/v0.1.1...v0.2.0\n[0.1.1]:`)
  })

  it('is idempotent when the version section already exists', () => {
    const once = rollUnreleased(SAMPLE, '0.2.0', '2026-06-30', REPO, 'v0.1.1').text
    const twice = rollUnreleased(once, '0.2.0', '2026-06-30', REPO, 'v0.1.1')
    expect(twice.alreadyRolled).toBe(true)
    expect(twice.text).toBe(once)
  })

  it('uses a release-tag link when there is no previous tag (first release)', () => {
    const { text } = rollUnreleased(SAMPLE, '0.2.0', '2026-06-30', REPO, '')
    expect(text).toContain(`[0.2.0]: ${REPO}/releases/tag/v0.2.0`)
  })

  it('throws when there is no [Unreleased] heading', () => {
    expect(() => rollUnreleased('# Changelog\n\n## [0.1.0] — x\n', '0.2.0', 'd', REPO, 'v0.1.0')).toThrow(
      /Unreleased/,
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: FAIL — `Failed to resolve import '../../src/core/changelog/render'`.

- [ ] **Step 3: Create `src/core/changelog/render.ts`**

```ts
import type { RollResult } from './types.js'

/**
 * Roll the (agent-filled) "## [Unreleased]" section into a dated version section:
 *   - rename "## [Unreleased]" → "## [<version>] — <date>" (carrying its content down with it),
 *   - insert a fresh empty "## [Unreleased]" above it,
 *   - add a link reference for the new version at the top of the bottom link block.
 * Idempotent: if "## [<version>]" already exists, returns the text unchanged with alreadyRolled =
 * true. Throws if there is no "## [Unreleased]" heading. When `prevTag` is empty (first release) the
 * link points at the release-tag page instead of a compare range (matching the existing [0.1.0] style).
 */
export function rollUnreleased(
  changelogText: string,
  version: string,
  date: string,
  repoUrl: string,
  prevTag: string,
): RollResult {
  if (new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm').test(changelogText)) {
    return { text: changelogText, alreadyRolled: true }
  }

  const unreleased = /^## \[Unreleased\][^\n]*$/m
  if (!unreleased.test(changelogText)) {
    throw new Error('rollUnreleased: no "## [Unreleased]" heading found')
  }

  let text = changelogText.replace(unreleased, `## [Unreleased]\n\n## [${version}] — ${date}`)

  const link = prevTag
    ? `[${version}]: ${repoUrl}/compare/${prevTag}...v${version}`
    : `[${version}]: ${repoUrl}/releases/tag/v${version}`

  const firstRef = /^\[\d+\.\d+\.\d+\]:/m
  if (firstRef.test(text)) {
    text = text.replace(firstRef, `${link}\n$&`)
  } else {
    text = `${text.replace(/\n*$/, '')}\n\n${link}\n`
  }
  return { text, alreadyRolled: false }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/changelog.test.ts`
Expected: PASS (19 tests).

---

### Task 6: Integration smoke — real git output → parse → filter

**Files:**
- Create: `tests/integration/release-changelog.test.ts`

**Interfaces:**
- Consumes: `parseGitLog`, `filterAppCommits`, `FIELD_SEP`, `RECORD_SEP` (Tasks 1–2).

- [ ] **Step 1: Write the failing test** — create `tests/integration/release-changelog.test.ts` (temp-repo pattern copied from `tests/integration/git-runner.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { parseGitLog, filterAppCommits, FIELD_SEP, RECORD_SEP } from '../../src/core/changelog/commits'

const execFileAsync = promisify(execFile)

describe('release-changelog git integration', () => {
  let tmpDir: string
  let repo: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-cl-'))
    repo = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', repo])
    await execFileAsync('git', ['-C', repo, 'config', 'user.name', 'Test User'])
    await execFileAsync('git', ['-C', repo, 'config', 'user.email', 'test@example.com'])
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  async function commit(file: string, message: string): Promise<void> {
    const full = path.join(repo, file)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, 'x')
    await execFileAsync('git', ['-C', repo, 'add', '-A'])
    await execFileAsync('git', ['-C', repo, 'commit', '-m', message])
  }

  it('parses real git log output and filters landing-only commits', async () => {
    await commit('src/app.ts', 'feat: app feature')
    await commit('landing/page.astro', 'feat(landing): landing-only change')

    const { stdout } = await execFileAsync('git', [
      '-C',
      repo,
      'log',
      `--format=${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}`,
      '--name-only',
    ])

    const all = parseGitLog(stdout)
    expect(all).toHaveLength(2)

    const app = filterAppCommits(all)
    expect(app).toHaveLength(1)
    expect(app[0].subject).toBe('feat: app feature')
  })
})
```

- [ ] **Step 2: Run it to verify it passes** (this is an integration check of already-built pure functions against real git — it should pass on first run; if it FAILS, the bug is in `parseGitLog`/`filterAppCommits`, fix there):

Run: `npx vitest run tests/integration/release-changelog.test.ts`
Expected: PASS (1 test).

---

### Task 7: The `release-changelog.ts` shell + npm script + tsconfig include

**Files:**
- Create: `scripts/release-changelog.ts`
- Modify: `package.json` (add a `release:changelog` script)
- Modify: `tsconfig.node.json` (add `scripts/**/*` to `include` so the script typechecks + lints)

**Interfaces:**
- Consumes: `parseGitLog`, `filterAppCommits`, `suggestBump`, `nextVersion`, `FIELD_SEP`, `RECORD_SEP` (commits.ts); `rollUnreleased` (render.ts).
- Produces (CLI): `release-changelog.ts collect` → prints JSON `{ prevTag, currentVersion, suggestedKind, suggestedVersion, commits[] }`; `release-changelog.ts apply <version>` → rewrites `CHANGELOG.md` + `package.json`.

- [ ] **Step 1: Add `scripts/**/*` to `tsconfig.node.json` `include`** — insert the line after `"src/main/**/*",`:

```json
    "scripts/**/*",
```

- [ ] **Step 2: Add the npm script** — in `package.json` `scripts`, after `"after-pack"`-less list, add:

```json
    "release:changelog": "vite-node scripts/release-changelog.ts",
```

(Place it after `"dist:dir": ...` — append a comma to the previous line.)

- [ ] **Step 3: Create `scripts/release-changelog.ts`**

```ts
// Deterministic release-changelog tool. Run via vite-node (vitest's runner — already installed):
//   npm run release:changelog -- collect
//   npm run release:changelog -- apply <version>
// The exact logic lives in src/core/changelog (unit-tested); this file is only git + filesystem
// glue. It NEVER commits, tags, or pushes — the /release slash command (and the human) do that.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  parseGitLog,
  filterAppCommits,
  suggestBump,
  nextVersion,
  FIELD_SEP,
  RECORD_SEP,
} from '../src/core/changelog/commits'
import { rollUnreleased } from '../src/core/changelog/render'

const root = process.cwd()
const CHANGELOG = `${root}/CHANGELOG.md`
const PKG = `${root}/package.json`

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function lastTag(): string {
  try {
    return git(['describe', '--tags', '--abbrev=0']).trim()
  } catch {
    return '' // no tags yet → first release
  }
}

function tagExists(tag: string): boolean {
  try {
    git(['rev-parse', '--verify', `refs/tags/${tag}`])
    return true
  } catch {
    return false
  }
}

function pkg(): { version: string; repoUrl: string } {
  const data = JSON.parse(readFileSync(PKG, 'utf8')) as {
    version: string
    repository?: { url?: string }
  }
  const repoUrl = String(data.repository?.url ?? '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
  return { version: String(data.version), repoUrl }
}

function collectAppCommits(): { tag: string; commits: ReturnType<typeof parseGitLog> } {
  const tag = lastTag()
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const raw = git([
    'log',
    range,
    `--format=${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}`,
    '--name-only',
  ])
  return { tag, commits: filterAppCommits(parseGitLog(raw)) }
}

function cmdCollect(): void {
  const { tag, commits } = collectAppCommits()
  if (commits.length === 0) {
    console.error('REFUSED: no app commits since the last tag (landing-only or nothing to release).')
    process.exit(1)
  }
  const { version } = pkg()
  const kind = suggestBump(commits)
  console.log(
    JSON.stringify(
      {
        prevTag: tag,
        currentVersion: version,
        suggestedKind: kind,
        suggestedVersion: nextVersion(version, kind),
        commits: commits.map((c) => ({ hash: c.hash.slice(0, 9), subject: c.subject })),
      },
      null,
      2,
    ),
  )
}

function cmdApply(version: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`REFUSED: "${version}" is not a plain X.Y.Z version.`)
    process.exit(1)
  }
  if (tagExists(`v${version}`)) {
    console.error(`REFUSED: tag v${version} already exists.`)
    process.exit(1)
  }
  const { repoUrl } = pkg()
  const date = new Date().toISOString().slice(0, 10)
  const result = rollUnreleased(readFileSync(CHANGELOG, 'utf8'), version, date, repoUrl, lastTag())
  if (result.alreadyRolled) {
    console.log(`CHANGELOG already has [${version}] — nothing to apply.`)
    return
  }
  writeFileSync(CHANGELOG, result.text)
  const pkgRaw = readFileSync(PKG, 'utf8').replace(/("version":\s*")[^"]*(")/, `$1${version}$2`)
  writeFileSync(PKG, pkgRaw)
  console.log(`Applied v${version} to CHANGELOG.md and package.json.`)
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'collect') {
  cmdCollect()
} else if (cmd === 'apply' && arg) {
  cmdApply(arg)
} else {
  console.error('Usage: release-changelog.ts (collect | apply <version>)')
  process.exit(1)
}
```

- [ ] **Step 4: Verify the shell runs (dry-run on the real repo — `collect` reads only, writes nothing)**

Run: `npm run release:changelog -- collect`
Expected: JSON to stdout with `currentVersion: "0.1.1"`, `prevTag: "v0.1.1"`, and a `commits` array. (If there are zero app commits since `v0.1.1`, it prints the `REFUSED: no app commits` line and exits 1 — that is correct behaviour, not a failure of the script.) Confirm no files changed: `git status --porcelain` is unchanged.

- [ ] **Step 5: Typecheck the new script**

Run: `npx tsc -p tsconfig.node.json --noEmit`
Expected: no errors. (If `vite-node` cannot resolve the `../src/core/...` imports at runtime in Step 4, the fallback is to add a one-line `vite.config.ts` exporting `import { defineConfig } from 'vite'; export default defineConfig({})` — but the default resolver already handles `.ts`, so this should not be needed.)

---

### Task 8: The `/release` slash command

**Files:**
- Create: `.claude/commands/release.md`

**Interfaces:**
- Consumes: `npm run release:changelog -- collect|apply` (Task 7); `CHANGELOG.md`, `package.json`, `docs/progress-log.md`.

- [ ] **Step 1: Create `.claude/commands/release.md`** (modeled on `.claude/commands/commit-phase.md`):

````markdown
---
description: "Draft the app CHANGELOG for a release from commits since the last tag, bump the version, and make the release commit + tag locally. Never pushes."
argument-hint: '[major|minor|patch] (optional — overrides the suggested bump)'
allowed-tools: Bash(npm test), Bash(npm run release:changelog*), Bash(git status), Bash(git diff*), Bash(git log*), Bash(git add*), Bash(git commit*), Bash(git tag*), Read, Edit
---

Build a release **locally** for the app (`CHANGELOG.md`), excluding landing changes. The final
`git push` is always the human's — this command never pushes.

## Step 1 — Gate: clean working tree

```bash
git status --porcelain
```

If the output is non-empty, STOP and report:

```
REFUSED: working tree is not clean. Commit or stash changes first.
```

## Step 2 — Gate: tests green

```bash
npm test 2>&1
```

If any test fails (exit code ≠ 0), STOP and report:

```
REFUSED: tests are red. Fix tests first.
```

## Step 3 — Collect the app commits

```bash
npm run release:changelog -- collect
```

If it exits non-zero (e.g. `REFUSED: no app commits`), STOP and report its message. Otherwise read
the JSON: `prevTag`, `currentVersion`, `suggestedKind`, `suggestedVersion`, `commits[]`.

## Step 4 — Confirm the version (human checkpoint 1)

Show the human `suggestedVersion` and the `commits[]` list. If `$ARGUMENTS` names a bump
(`major|minor|patch`), recompute and prefer that. Ask the human to confirm the exact version string
(e.g. `0.2.0`). Use the confirmed value as `<version>` below. Do not continue without confirmation.

## Step 5 — Write the changelog entries

Read `CHANGELOG.md`. Under the `## [Unreleased]` heading, write user-facing bullets summarising
`commits[]`, grouped into `### Added`, `### Fixed`, `### Changed` (omit empty groups). Match the tone
of the existing entries: concise, user-facing, present tense. Apply editorial judgment — omit pure
chore/ci/test/docs commits that carry no user-facing change. Do NOT write the version heading or
date — Step 6 does that. Use Edit.

## Step 6 — Apply version + structure (deterministic)

```bash
npm run release:changelog -- apply <version>
```

Renames `[Unreleased]` → `[<version>] — <date>`, re-opens an empty `[Unreleased]`, adds the compare
link, and bumps `package.json`. If it prints `already has [<version>]`, the section was already
rolled — continue.

## Step 7 — Review the diff (human checkpoint 2)

```bash
git diff -- CHANGELOG.md package.json
```

Show the diff. Apply any wording tweaks the human requests with Edit.

## Step 8 — Log the release (required for the commit gate)

The `commit-needs-log.sh` hook requires `docs/progress-log.md` to be staged on every commit. Append
a release entry under the existing log style (a dated `### <YYYY-MM-DD> — v<version> released` entry
with a one-line summary) using Edit. This is a real release record, not a phase entry.

## Step 9 — Commit + tag (local only)

Stage first (the hook reads the index before the commit runs), then commit, then tag:

```bash
git add CHANGELOG.md package.json docs/progress-log.md
```

```bash
git commit -m "$(cat <<'EOF'
chore: release v<version>

<one-line summary>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

```bash
git tag v<version>
```

## Step 10 — Stop and hand off

Print the version, then STOP and report exactly:

```
Release v<version> staged locally (commit + tag). To publish, run:
  git push origin <branch> && git push origin v<version>
```

## Step 11 — Never push

Do NOT run `git push` under any circumstances, even if asked within this command. Pushing is always
a separate, explicit manual step by the human.
````

- [ ] **Step 2: Sanity-check the command file** (no automated test — it is agent instructions). Verify the frontmatter parses and `allowed-tools` contains no `git push`:

Run: `npx prettier --check .claude/commands/release.md` (or `--write` to fix formatting)
Expected: no formatting errors.

---

### Task 9: Update the release checklist

**Files:**
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Replace the manual changelog step.** In `docs/release-checklist.md` §2 "Version bump", replace the manual `CHANGELOG.md` editing sub-steps (the bullet that starts "Edit `CHANGELOG.md`:" and its nested sub-bullets, plus the separate `package.json` version edit and the `chore: bump version` commit bullet) with:

```markdown
- [ ] Run `/release` (or `npm run release:changelog -- collect` then, after writing entries, `-- apply <version>`). This drafts the `CHANGELOG.md` entries from commits since the last tag (landing excluded), bumps `package.json`, re-opens an empty `[Unreleased]`, adds the compare link, and makes the `chore: release v<new>` commit + `v<new>` tag locally. Review the diff at the prompt.
```

- [ ] **Step 2: Leave §6 (paste notes into the GitHub Release) as-is** but add a forward-reference note (this is automated in a later slice — 2b):

```markdown
> Slice 2b (deferred) will fill the GitHub Release notes from `CHANGELOG.md` automatically in CI; until then, paste the section manually.
```

- [ ] **Step 3: Verify formatting**

Run: `npx prettier --check docs/release-checklist.md` (or `--write`)
Expected: no formatting errors.

---

### Task 10: Progress-Log entry + full gate + single commit

**Files:**
- Modify: `docs/progress-log.md`
- Commit: all of the above

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all pass, including the new `changelog` unit tests (+19) and the `release-changelog` integration test (+1). Note the new total.

- [ ] **Step 2: Typecheck both TS projects**

Run: `npx tsc -p tsconfig.node.json --noEmit` then `npx tsc -p tsconfig.web.json --noEmit`
Expected: no errors in either.

- [ ] **Step 3: Lint + format**

Run: `npx prettier --write src/core/changelog scripts/release-changelog.ts tests/unit/changelog.test.ts tests/integration/release-changelog.test.ts .claude/commands/release.md docs/release-checklist.md docs/progress-log.md` then `npm run lint`
Expected: `npm run lint` clean **except** the pre-existing `docs/plans/sdd-migration-plan.md` Prettier issue noted in earlier progress-log entries (do not "fix" unrelated files). No new issues from the files this slice touched.

- [ ] **Step 4: Write the Progress-Log entry.** In `docs/progress-log.md`, under the `## Documentation` section (or a new dated entry following the surrounding style), append:

```markdown
### 2026-06-28 — /release changelog automation (Slice 1)

- Built: A release-time `/release` command that drafts the app `CHANGELOG.md` from commits since the last tag (landing excluded). Pure logic in `src/core/changelog/` (`parseGitLog`, `filterAppCommits`, `suggestBump`, `nextVersion`, `rollUnreleased`), unit-tested; thin `scripts/release-changelog.ts` shell run via `vite-node` (`collect` / `apply`); `.claude/commands/release.md` orchestrates (two human checkpoints, never pushes). Implements docs/superpowers/specs/2026-06-28-changelog-release-automation-design.md (Slice 1). Landing sync + CI release notes remain deferred.
- Files: added `src/core/changelog/{types,commits,render}.ts`, `tests/unit/changelog.test.ts`, `tests/integration/release-changelog.test.ts`, `scripts/release-changelog.ts`, `.claude/commands/release.md`; updated `package.json` (`release:changelog` script), `tsconfig.node.json` (include `scripts/`), `docs/release-checklist.md`.
- Tests: full `npm test` <NEW TOTAL> (+20: 19 unit + 1 integration); both `tsc` projects clean; lint clean (pre-existing sdd-migration-plan Prettier issue unrelated). `npm run release:changelog -- collect` dry-run verified against the live repo.
- Notes / follow-ups: Not a numbered phase (DX/tooling). Deferred: Slice 2a landing changelog sync, Slice 2b CI release notes (`extractSection` + `gh release edit`), Slice 3 in-app "What's new".
```

(Replace `<NEW TOTAL>` with the number from Step 1.)

- [ ] **Step 2 of committing — stage, then commit in a SEPARATE call** (the hook reads the index before the command runs):

```bash
git add src/core/changelog tests/unit/changelog.test.ts tests/integration/release-changelog.test.ts scripts/release-changelog.ts .claude/commands/release.md package.json tsconfig.node.json docs/release-checklist.md docs/progress-log.md docs/superpowers/plans/2026-06-28-changelog-release-automation.md
```

Then, in a new Bash call:

```bash
git commit -m "$(cat <<'EOF'
feat: /release changelog automation (slice 1)

Release-time command drafts the app CHANGELOG from commits since the last tag;
deterministic core + agent prose, human pushes.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Report** the commit and confirm nothing was pushed:

```bash
git log -1 --format="%H %s" && git status -sb
```

Expected: the commit exists; branch is ahead of origin (not pushed). **Do not push** — that is the human's call.

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-28-changelog-release-automation-design.md`):
- §3 ① pure functions → Tasks 1–5 (`filterAppCommits`, `suggestBump`, `nextVersion`/`rollUnreleased`; `parseGitLog` added as the spec's "deterministic commit list" needs it). `extractSection` correctly **absent** (deferred, §5). ✓
- §3 ② `scripts/release-changelog.ts` → Task 7. ✓ (spec said `.cjs`; switched to `.ts` run by the already-installed `vite-node` so it can import the tested TS — noted deviation, no new dep.)
- §3 ③ slash command → Task 8. ✓
- §4 flow (gates → collect → checkpoint 1 → write → apply → checkpoint 2 → commit+tag → STOP) → Task 8 Steps 1–11. ✓
- §6 gates (clean tree, tests green, no app commits, version already tagged, idempotent, never push) → script Task 7 + command Task 8. ✓
- §7 testing (pure unit + tooling smoke vs temp repo) → Tasks 1–6. ✓
- §8 file inventory → Tasks 1–10 (all listed files covered, incl. `docs/release-checklist.md`, `docs/progress-log.md`). ✓

**2. Placeholder scan:** the only intentional fill-ins are `<version>` / `<one-line summary>` / `<NEW TOTAL>` / `<branch>` (runtime values the operator supplies at release time, not plan gaps) and `$ARGUMENTS` (the slash-command convention). No TODO/TBD; every code step shows complete code.

**3. Type consistency:** `Commit`/`BumpKind`/`RollResult` defined in Task 1 and used verbatim in Tasks 2–7. `parseVersion` signature matches `src/core/updates/version.ts`. `FIELD_SEP`/`RECORD_SEP` defined once (Task 1) and reused by the script (Task 7) and integration test (Task 6). `nextVersion`/`suggestBump`/`rollUnreleased` names match across the script and command. ✓
