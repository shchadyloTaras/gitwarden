import type { ChangeKind, FileChange, GitStatus } from '../types.js'

const XY_MAP: Readonly<Record<string, ChangeKind>> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  '.': 'unmodified',
  u: 'conflicted',
  '?': 'untracked',
}

function mapXY(c: string): ChangeKind {
  return XY_MAP[c] ?? 'unmodified'
}

/**
 * Parses the NUL-delimited stdout of:
 *   git status --porcelain=v2 -z --branch
 *
 * With -z each record is NUL-terminated. Rename/copy records (`2`) consume
 * an additional NUL-delimited token for the original path.
 */
export function parsePorcelainV2(raw: Buffer): GitStatus {
  const tokens = raw.toString('utf8').split('\0')

  const files: FileChange[] = []
  let branch: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    i++

    if (!token) continue

    if (token.startsWith('# branch.head ')) {
      const val = token.slice('# branch.head '.length)
      branch = val === '(detached)' ? undefined : val
    } else if (token.startsWith('# branch.upstream ')) {
      upstream = token.slice('# branch.upstream '.length)
    } else if (token.startsWith('# branch.ab ')) {
      const m = token.slice('# branch.ab '.length).match(/^\+(\d+) -(\d+)$/)
      if (m) {
        ahead = parseInt(m[1], 10)
        behind = parseInt(m[2], 10)
      }
    } else if (token.startsWith('# ')) {
      // Other branch headers (e.g. branch.oid) — ignore
    } else if (token.startsWith('1 ')) {
      // Ordinary changed: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const parts = token.split(' ')
      const xy = parts[1] ?? '..'
      files.push({
        path: parts.slice(8).join(' '),
        indexStatus: mapXY(xy[0]),
        worktreeStatus: mapXY(xy[1]),
      })
    } else if (token.startsWith('2 ')) {
      // Rename/copy: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>
      // followed by a separate NUL-delimited token: <origPath>
      const parts = token.split(' ')
      const xy = parts[1] ?? '..'
      const newPath = parts.slice(9).join(' ')
      const origPath = tokens[i] ?? ''
      i++ // consume the origPath token
      files.push({
        path: newPath,
        originalPath: origPath || undefined,
        indexStatus: mapXY(xy[0]),
        worktreeStatus: mapXY(xy[1]),
      })
    } else if (token.startsWith('u ')) {
      // Unmerged (conflict): u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const parts = token.split(' ')
      files.push({
        path: parts.slice(10).join(' '),
        indexStatus: 'conflicted',
        worktreeStatus: 'conflicted',
      })
    } else if (token.startsWith('? ')) {
      // Untracked
      files.push({
        path: token.slice(2),
        indexStatus: 'untracked',
        worktreeStatus: 'untracked',
      })
      // '!' (ignored) — skip
    }
  }

  return { files, branch, upstream, ahead, behind }
}
