// Deterministic release-changelog tool. Run via vite-node (vitest's runner — already installed):
//   npm run release:changelog -- collect
//   npm run release:changelog -- apply <version>
// The exact logic lives in src/core/changelog (unit-tested); this file is only git + filesystem
// glue. It NEVER commits, tags, or pushes — the /release slash command (and the human) do that.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  parseGitLog,
  filterAppCommits,
  suggestBump,
  nextVersion,
  FIELD_SEP,
  RECORD_SEP,
} from '../src/core/changelog/commits'
import { rollUnreleased, renderLandingChangelog } from '../src/core/changelog/render'

const root = process.cwd()
const CHANGELOG = `${root}/CHANGELOG.md`
const PKG = `${root}/package.json`
const LANDING_CHANGELOG = `${root}/landing/src/content/docs/changelog.md`

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

function pkg(): { version: string } {
  const data = JSON.parse(readFileSync(PKG, 'utf8')) as { version: string }
  return { version: String(data.version) }
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
    console.error(
      'REFUSED: no app commits since the last tag (landing-only or nothing to release).'
    )
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
      2
    )
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
  const date = new Date().toISOString().slice(0, 10)
  const result = rollUnreleased(readFileSync(CHANGELOG, 'utf8'), version, date)
  if (result.alreadyRolled) {
    console.log(`CHANGELOG already has [${version}] — nothing to apply.`)
    return
  }
  writeFileSync(CHANGELOG, result.text)
  const pkgRaw = readFileSync(PKG, 'utf8').replace(
    /^(\s*"version":\s*")[^"]*(")/m,
    `$1${version}$2`
  )
  writeFileSync(PKG, pkgRaw)
  syncLandingChangelog()
  console.log(`Applied v${version} to CHANGELOG.md, package.json, and the landing changelog.`)
}

// Refresh the committed landing copy of the changelog so the release commit ships the new
// version's entry to the site (the astro build regenerates the same file — see
// syncChangelog() in landing/astro.config.mjs; tests/integration pins the two in sync).
function syncLandingChangelog(): void {
  if (!existsSync(dirname(LANDING_CHANGELOG))) return // repo without the landing package
  writeFileSync(LANDING_CHANGELOG, renderLandingChangelog(readFileSync(CHANGELOG, 'utf8')))
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'collect') {
  cmdCollect()
} else if (cmd === 'apply' && arg) {
  cmdApply(arg)
} else if (cmd === 'sync-landing') {
  syncLandingChangelog()
  console.log('Synced CHANGELOG.md into landing/src/content/docs/changelog.md.')
} else {
  console.error('Usage: release-changelog.ts (collect | apply <version> | sync-landing)')
  process.exit(1)
}
