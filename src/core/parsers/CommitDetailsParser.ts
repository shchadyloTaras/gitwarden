import type {
  GitCommit,
  GitCommitDetails,
  GitCommitFileChange,
  GitCommitFileStatus,
} from '../types.js'

/** Thrown when a NUL-delimited metadata or name-status record is structurally incomplete. */
export class CommitDetailsParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommitDetailsParseError'
  }
}

const STATUS_MAP: Readonly<Record<string, GitCommitFileStatus>> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typeChanged',
  U: 'unmerged',
}

function mapStatus(code: string): GitCommitFileStatus {
  return STATUS_MAP[code] ?? 'unknown'
}

const METADATA_FIELD_COUNT = 7

/**
 * Parses one commit's NUL-delimited metadata record:
 *   <fullHash>\0<shortHash>\0<authorName>\0<authorEmail>\0<date>\0<subject>\0<parentHashes>
 * `parentHashes` mirrors git's space-separated `%P` output (empty string for a root commit).
 */
export function parseCommitMetadata(raw: string): { commit: GitCommit; parentHashes: string[] } {
  const fields = raw.split('\0')
  if (fields.length !== METADATA_FIELD_COUNT) {
    throw new CommitDetailsParseError(
      `expected ${METADATA_FIELD_COUNT} NUL-delimited metadata fields, got ${fields.length}`
    )
  }
  const [fullHash, shortHash, authorName, authorEmail, date, subject, parentHashesRaw] = fields
  if (!fullHash || !shortHash) {
    throw new CommitDetailsParseError('commit metadata is missing a hash')
  }
  return {
    commit: { fullHash, shortHash, authorName, authorEmail, date, message: subject },
    parentHashes:
      parentHashesRaw.length > 0 ? parentHashesRaw.split(' ').filter((h) => h !== '') : [],
  }
}

/**
 * Parses `git diff --name-status -z` output into typed file changes. Rename/copy records carry
 * a two-path pair (`<previousPath>` then `<path>`) plus a similarity score encoded in the status
 * code (`R100`, `C075`); every other status carries exactly one path.
 */
export function parseNameStatus(raw: string): GitCommitFileChange[] {
  const tokens = raw.split('\0').filter((t) => t !== '')
  const files: GitCommitFileChange[] = []

  let i = 0
  while (i < tokens.length) {
    const code = tokens[i]
    i++
    const letter = code[0]
    const status = mapStatus(letter)

    if (letter === 'R' || letter === 'C') {
      const previousPath = tokens[i]
      const path = tokens[i + 1]
      if (previousPath === undefined || path === undefined) {
        throw new CommitDetailsParseError(`truncated ${letter} record: missing rename/copy path`)
      }
      i += 2
      const scoreDigits = code.slice(1)
      const similarity = scoreDigits.length > 0 ? Number(scoreDigits) : undefined
      files.push({
        status,
        path,
        previousPath,
        similarity: similarity !== undefined && !Number.isNaN(similarity) ? similarity : undefined,
      })
      continue
    }

    const path = tokens[i]
    if (path === undefined) {
      throw new CommitDetailsParseError(`truncated ${letter} record: missing path`)
    }
    i++
    files.push({ status, path })
  }

  return files
}

/**
 * Combines validated metadata, changed files, and a caller-supplied patch string into the full
 * `GitCommitDetails` model. The patch passes through opaque — this module never interprets
 * diff-line content (that stays in the renderer-only shared UnifiedDiff component, Phase 113).
 */
export function parseCommitDetails(input: {
  metadataRaw: string
  nameStatusRaw: string
  patch: string
}): GitCommitDetails {
  const { commit, parentHashes } = parseCommitMetadata(input.metadataRaw)
  const files = parseNameStatus(input.nameStatusRaw)
  return { commit, parentHashes, files, patch: input.patch }
}
