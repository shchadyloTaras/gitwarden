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

  /**
   * Maps a `child_process.spawn` 'error' event (thrown before git ever runs, so there is
   * no stderr/exit code to classify) to the same typed GitError the rest of the app
   * expects. GitRunner resolves `gitPath` once at startup — if the binary is later moved
   * or uninstalled, every subsequent command hits this, and without this mapping the raw
   * Node message (e.g. "spawn /usr/bin/git ENOENT") leaked straight through to the UI
   * instead of the existing `gitNotFound` explanation.
   */
  static mapSpawnFailure(err: NodeJS.ErrnoException, gitPath: string): GitError {
    if (err.code === 'ENOENT') {
      return new GitError({
        code: 'gitNotFound',
        userMessage: `Git could not be found at "${gitPath}". It may have been moved or uninstalled since Git Warden started — reinstall Git or make sure it is on your PATH.`,
        technicalDetails: err.message,
      })
    }
    return new GitError({
      code: 'unknown',
      userMessage: `Failed to run git: ${err.message}`,
      technicalDetails: err.message,
    })
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

    // GitHub names the authenticated actor in this shape when the token is for an
    // account that cannot push the repo. Keep this distinct from a generic 403:
    // a generic 403 is often "correct account, token lacks repo/write scope".
    if (/remote: Permission to .+ denied to .+/i.test(stderr)) {
      return {
        code: 'pushRejectedWrongAccount',
        userMessage:
          "GitHub rejected the push: you're authenticated as a different account than this repository's profile. Switch to the assigned profile and push again.",
        technicalDetails: stderr,
        exitCode,
      }
    }

    // No credentials at all for this HTTPS remote (`GIT_CONFIG_NOSYSTEM=1` hides the
    // system keychain helper by design — GitRunner.ts — so a remote with no stored
    // GitWarden token surfaces this instead of a rejected/expired one). Checked
    // BEFORE authenticationFailed and deliberately distinct from it: this is "there
    // is nothing to reject," not "what was tried didn't work."
    if (/could not read Username/i.test(stderr)) {
      return {
        code: 'noCredentialsAvailable',
        userMessage:
          'GitWarden has no saved login for this HTTPS remote — connect GitHub for this profile to push with its token.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    // SSH key rejection OR HTTPS token/scope rejection (401 / generic 403 / bad
    // credentials). A named wrong-account denial is handled above; no-credentials
    // (no stored token at all) is handled above too — this is a REJECTED credential.
    if (
      /authentication failed|could not authenticate|permission denied \(publickey\)|Invalid username or password|\b401\b|The requested URL returned error: 403|\berror: 403\b|Write access to repository not granted/i.test(
        stderr
      )
    ) {
      return {
        code: 'authenticationFailed',
        userMessage:
          'Authentication failed: GitHub rejected your credentials or push permission — the token may be missing repository access, expired, or revoked. Reconnect GitHub for this profile (or check your SSH key).',
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

    // A dirty-tree checkout/switch/merge refusal — previously fell all the way through
    // to the generic "unexpected Git error" (no pattern matched "local changes" at
    // all). The switch-failure banner already offers "Bring changes & switch" beside
    // whatever message renders here, so this only needs to name the real cause.
    if (/Your local changes to the following files would be overwritten by/i.test(stderr)) {
      return {
        code: 'localChangesWouldBeOverwritten',
        userMessage:
          'Your local changes would be overwritten by this operation. Commit or stash them first, or use "Bring changes & switch" to carry them along.',
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

    // Git rejects a new branch/ref whose name breaks its rules (spaces, a leading
    // dash, '..', or ~ ^ : ? * [ \). Without this case the Branches screen showed
    // only the generic "unexpected error" for a routine typo. Checked before
    // "already exists" so an invalid name is never misreported as a duplicate.
    if (/is not a valid branch name|is not a valid ref name/i.test(stderr)) {
      return {
        code: 'invalidBranchName',
        userMessage:
          "That isn't a valid branch name. Branch names can't contain spaces or start with a dash, and can't include ~ ^ : ? * [ \\ or '..'. Try something like feature/my-change.",
        technicalDetails: stderr,
        exitCode,
      }
    }

    // `git branch -d` refuses a branch with commits not reachable from anywhere
    // else. Checked before the generic "not found"/"already exists" branch cases
    // below since none of those patterns overlap with git's actual wording here.
    if (/is not fully merged/i.test(stderr)) {
      return {
        code: 'branchNotMerged',
        userMessage:
          'This branch has commits that exist nowhere else — deleting it would lose them. Force-delete only if you are sure.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    // Creating a branch whose name is already taken. Distinct, common, and easily
    // resolved by choosing another name or switching to the existing branch.
    if (/a branch named .+ already exists|already exists\b.*branch/i.test(stderr)) {
      return {
        code: 'branchAlreadyExists',
        userMessage:
          'A branch with that name already exists. Choose a different name, or switch to the existing branch.',
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

    // Remote rejected the push because local is behind (non-fast-forward).
    // The most common form is "! [rejected] <branch> -> <branch> (fetch first)"
    // or "(non-fast-forward)". Pull first, then push again.
    if (/\[rejected\]|non-fast-forward|fetch first/i.test(stderr)) {
      return {
        code: 'rejectedNonFastForward',
        userMessage:
          'Push rejected: the remote branch has commits your local copy does not. Pull the latest changes first, then push again.',
        technicalDetails: stderr,
        exitCode,
      }
    }

    // Pull could not integrate the remote because the histories diverged. Surfaces
    // as "Not possible to fast-forward" (our `pull --ff-only`), "Need to specify how
    // to reconcile divergent branches" (a plain pull), or "refusing to merge
    // unrelated histories" (independent roots). All mean: a plain pull can't combine
    // them — the user must merge/rebase. NOT auto-fixable (a merge can conflict), so
    // this is explain-only, consistent with the app's safety boundary.
    if (
      /not possible to fast-forward|need to specify how to reconcile|divergent branches|refusing to merge unrelated histories/i.test(
        stderr
      )
    ) {
      return {
        code: 'divergentBranches',
        userMessage:
          'Your local branch and the remote have diverged — each has commits the other does not, so they cannot be combined automatically. Bring the remote changes in (merge or rebase) and resolve any conflicts, then push again.',
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
