import type { GitCommandError, GitErrorCode } from '../../core/types'

export class GitError extends Error {
  readonly code: GitErrorCode
  readonly userMessage: string
  readonly technicalDetails: string
  readonly exitCode?: number

  constructor(details: GitCommandError) {
    super(details.userMessage)
    this.name = 'GitError'
    this.code = details.code
    this.userMessage = details.userMessage
    this.technicalDetails = details.technicalDetails
    this.exitCode = details.exitCode
  }
}

export class ErrorMapper {
  static map(stderr: string, exitCode: number): GitError {
    return new GitError(ErrorMapper.classify(stderr, exitCode))
  }

  private static classify(stderr: string, exitCode: number): GitCommandError {
    if (/not a git repository/i.test(stderr)) {
      return {
        code: 'notARepository',
        userMessage: 'This directory is not a Git repository.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    // GitHub HTTPS wrong-account / 403 push rejection — the token is VALID but for
    // the wrong account. Checked BEFORE authenticationFailed so a 403 is diagnosed
    // as switch-and-retry, not a generic auth failure. (SSH's "permission denied
    // (publickey)" stays with authenticationFailed below.)
    if (
      /remote: Permission to .+ denied to .+/i.test(stderr) ||
      /The requested URL returned error: 403/i.test(stderr) ||
      /\berror: 403\b/i.test(stderr)
    ) {
      return {
        code: 'pushRejectedWrongAccount',
        userMessage:
          "GitHub rejected the push: you're authenticated as a different account than this repository's profile. Switch to the assigned profile and push again.",
        technicalDetails: stderr,
        exitCode,
      }
    }

    // SSH key rejection OR HTTPS token rejection (401 / bad credentials). A valid
    // token for the WRONG account is handled above as pushRejectedWrongAccount.
    if (
      /authentication failed|could not authenticate|permission denied \(publickey\)|could not read Username|Invalid username or password|\b401\b/i.test(
        stderr
      )
    ) {
      return {
        code: 'authenticationFailed',
        userMessage:
          'Authentication failed: GitHub rejected your credentials — the token or SSH key may be missing, expired, or revoked. Reconnect GitHub for this profile (or check your SSH key).',
        technicalDetails: stderr,
        exitCode,
      }
    }

    // The repository folder moved/renamed (or is owned by another user) → Git
    // refuses with "dubious ownership". Explain-only: GitWarden will NOT write a
    // global safe.directory (AGENTS.md rule #4: --local config only).
    if (/detected dubious ownership in repository/i.test(stderr)) {
      return {
        code: 'dubiousOwnership',
        userMessage:
          "Git refused to use this repository because its folder looks like it moved or is owned by another user ('dubious ownership'). Re-point or re-add the repository in GitWarden — your global Git config is left untouched.",
        technicalDetails: stderr,
        exitCode,
      }
    }

    if (
      /remote .* not found|repository .* not found|does not appear to be a git repository/i.test(
        stderr
      )
    ) {
      return {
        code: 'remoteNotFound',
        userMessage: 'The remote repository was not found.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    if (/branch .* not found|pathspec .* did not match any/i.test(stderr)) {
      return {
        code: 'branchNotFound',
        userMessage: 'The specified branch was not found.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    const worktreeMatch = stderr.match(
      /(?:is already checked out|checked out|used by worktree) at ['"]([^'"]+)['"]/i
    )
    if (worktreeMatch) {
      return {
        code: 'branchCheckedOutElsewhere',
        userMessage: `This branch is already open in another worktree: ${worktreeMatch[1]}. Open that worktree or remove it before switching here.`,
        technicalDetails: stderr,
        exitCode,
      }
    }

    if (/merge conflict|CONFLICT \(|automatic merge failed/i.test(stderr)) {
      return {
        code: 'mergeConflict',
        userMessage: 'A merge conflict occurred. Resolve conflicts before continuing.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    if (/nothing to commit|nothing added to commit/i.test(stderr)) {
      return {
        code: 'nothingToCommit',
        userMessage: 'There is nothing staged to commit.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    if (
      /could not resolve host|network is unreachable|connection refused|connection timed out/i.test(
        stderr
      )
    ) {
      return {
        code: 'networkError',
        userMessage: 'A network error occurred. Check your internet connection.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    return {
      code: 'unknown',
      userMessage: 'An unexpected Git error occurred.',
      technicalDetails: stderr,
      exitCode,
    }
  }
}
