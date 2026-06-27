// Pure glob-matching for branch names. No node/browser globals.
// Semantics from client-branch-access-plan.md Appendix A.

function escapeRegexChar(c: string): string {
  return c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

/**
 * Match a branch name against a single glob pattern.
 *
 * Rules (anchored, case-sensitive):
 *   `**`  — matches any sequence of characters including `/`
 *   `*`   — matches any sequence of characters EXCEPT `/`
 *   `?`   — matches exactly one character that is not `/`
 *   other — literal (regex-escaped)
 */
export function matchesBranchPattern(branch: string, pattern: string): boolean {
  let regexStr = ''
  let i = 0
  while (i < pattern.length) {
    if (pattern[i] === '*' && i + 1 < pattern.length && pattern[i + 1] === '*') {
      regexStr += '.*'
      i += 2
    } else if (pattern[i] === '*') {
      regexStr += '[^/]*'
      i++
    } else if (pattern[i] === '?') {
      regexStr += '[^/]'
      i++
    } else {
      regexStr += escapeRegexChar(pattern[i])
      i++
    }
  }
  return new RegExp(`^${regexStr}$`).test(branch)
}

/** True if `branch` matches at least one pattern in `patterns`. */
export function matchesAnyPattern(branch: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesBranchPattern(branch, p))
}
