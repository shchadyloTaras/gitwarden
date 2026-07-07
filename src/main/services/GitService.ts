import path from 'node:path'
import type {
  GitStatus,
  EffectiveGitIdentity,
  GitConfigScope,
  GitRemote,
  GitBranch,
  GitCommit,
} from '../../core/types.js'
import { parsePorcelainV2 } from '../../core/parsers/PorcelainParser.js'
import type { UncommitContext } from '../../core/history/uncommit.js'
import type { GitRunner, GitInvocation, GitResult } from '../git/GitRunner.js'
import { GitLocator } from '../git/GitLocator.js'
import { buildAskpassEnv, ensureAskpassHelper } from '../git/askpass.js'
import { GitError } from '../git/ErrorMapper.js'

/**
 * HTTPS-token credentials for a single remote operation (push, fetch, or pull).
 * The token never enters argv or config — it is supplied only via the GIT_ASKPASS env.
 */
export interface PushAuth {
  username: string
  token: string
}

function parseRemoteHost(url: string): string | undefined {
  // SSH style: git@github.com:user/repo.git or git@github.com-work:user/repo.git
  const sshMatch = url.match(/^[\w.+-]+@([^:]+):/)
  if (sshMatch) return sshMatch[1]
  // HTTPS / git:// style
  try {
    const parsed = new URL(url)
    if (parsed.hostname) return parsed.hostname
  } catch {
    // local path or unparseable — no host
  }
  return undefined
}

function parseRemoteLines(output: string): GitRemote[] {
  const seen = new Map<string, GitRemote>()
  for (const line of output.split('\n')) {
    const match = line.match(/^(\S+)\t(\S+)\s+\(fetch\)/)
    if (!match) continue
    const [, name, url] = match
    seen.set(name, { name, url, host: parseRemoteHost(url) })
  }
  return Array.from(seen.values())
}

// Derive config scope from the origin string git emits, e.g. "file:/path/.git/config".
// GIT_CONFIG_NOSYSTEM=1 suppresses system config, so what remains is local or global.
function parseScope(origin: string): GitConfigScope {
  // git emits either "file:.git/config" (relative) or "file:/abs/path/.git/config"
  if (origin.endsWith('.git/config')) return 'local'
  return 'global'
}

/**
 * Executes a single WRITE invocation. Passed to a compound job's callback (see
 * `GitService.enqueueJob`) so a write inside the job bypasses the write queue it is
 * already occupying, instead of re-entering it and deadlocking (see
 * `GitRunner.enqueueJob`'s doc comment). Every write method below accepts this as an
 * optional trailing `exec` param: omitted, it behaves exactly as before (a standalone
 * call that enqueues itself); passed, it runs as part of the caller's compound job.
 */
export type WriteExecutor = (inv: Omit<GitInvocation, 'cwd' | 'readOnly'>) => Promise<GitResult>

export class GitService {
  constructor(private readonly runner: GitRunner) {}

  /**
   * Public compound-job API (Phase 91): the read → decide → write sequence a caller
   * builds inside `fn` runs atomically against every other write for this repo — see
   * `GitRunner.enqueueJob`.
   */
  enqueueJob<T>(repoPath: string, fn: (exec: WriteExecutor) => Promise<T>): Promise<T> {
    return this.runner.enqueueJob(repoPath, fn)
  }

  /**
   * True iff HEAD is still on the expected branch, checked via `symbolic-ref --short
   * HEAD` — the in-queue verification every compound write performs immediately
   * before mutating (Phase 91). A detached HEAD (or any other `symbolic-ref` failure)
   * counts as a mismatch, not a crash: there is no branch to match against.
   */
  async verifyHeadBranch(repoPath: string, expected: string): Promise<boolean> {
    try {
      const res = await this.runner.run({
        args: ['symbolic-ref', '--short', 'HEAD'],
        cwd: repoPath,
        readOnly: true,
      })
      return res.stdout.toString('utf8').trim() === expected
    } catch {
      return false
    }
  }

  async getStatus(repoPath: string): Promise<GitStatus> {
    const result = await this.runner.run({
      args: ['status', '--porcelain=v2', '-z', '--branch'],
      cwd: repoPath,
      readOnly: true,
    })
    return parsePorcelainV2(result.stdout)
  }

  async validateRepository(repoPath: string): Promise<{ name: string; remoteUrl?: string }> {
    // Throws GitError if not a valid git working tree
    await this.runner.run({
      args: ['rev-parse', '--show-toplevel'],
      cwd: repoPath,
      readOnly: true,
    })

    let remoteUrl: string | undefined
    try {
      const res = await this.runner.run({
        args: ['remote', 'get-url', 'origin'],
        cwd: repoPath,
        readOnly: true,
      })
      remoteUrl = res.stdout.toString('utf8').trim() || undefined
    } catch {
      // no remote is fine
    }

    return { name: path.basename(repoPath), remoteUrl }
  }

  async stageFile(repoPath: string, filePath: string): Promise<void> {
    await this.runner.run({ args: ['add', '--', filePath], cwd: repoPath, readOnly: false })
  }

  /**
   * Unstage via `git reset`, not `git restore --staged`: `restore` reads the index
   * back from HEAD, so in a freshly-init'd repo with no commits (unborn HEAD) it dies
   * with "could not resolve HEAD" (surfaced to the user as the generic "unexpected Git
   * error" after Init + Stage All). `git reset [-- <path>]` treats an unborn HEAD as the
   * empty tree, so it unstages cleanly whether or not any commit exists — and behaves
   * identically to `restore --staged` once HEAD is present. Path after `--`.
   */
  async unstageFile(repoPath: string, filePath: string): Promise<void> {
    await this.runner.run({
      args: ['reset', '--', filePath],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async stageAll(repoPath: string): Promise<void> {
    await this.runner.run({ args: ['add', '-A'], cwd: repoPath, readOnly: false })
  }

  /** Unstage everything. Bare `git reset` resets the whole index to HEAD (or the empty
   * tree on an unborn HEAD); see `unstageFile` for why `restore --staged` is unsafe here. */
  async unstageAll(repoPath: string): Promise<void> {
    await this.runner.run({
      args: ['reset'],
      cwd: repoPath,
      readOnly: false,
    })
  }

  /**
   * The commit and the hash read that follows it run inside one compound job (W26) —
   * without it, the hash read is a separate, unqueued call that could race a
   * concurrently-enqueued write (e.g. a switchBranch) moving HEAD in between.
   */
  async commit(repoPath: string, message: string): Promise<{ hash: string }> {
    return this.enqueueJob(repoPath, async (exec) => {
      await exec({ args: ['commit', '-m', message] })
      const result = await this.runner.run({
        args: ['rev-parse', '--short', 'HEAD'],
        cwd: repoPath,
        readOnly: true,
      })
      return { hash: result.stdout.toString('utf8').trim() }
    })
  }

  /**
   * `git init -b main` run with `cwd: repoPath` (not `git init <path>`) so a
   * non-existent/typo'd path fails on spawn instead of creating a phantom folder
   * (Initialize Repository, Phase 86). `-b main` makes the default branch
   * deterministic rather than inheriting the user's `init.defaultBranch`.
   */
  async initRepository(repoPath: string): Promise<void> {
    await this.runner.run({
      args: ['init', '-b', 'main'],
      cwd: repoPath,
      readOnly: false,
    })
  }

  /** `git remote add <name> <url>` — `url` is a single array element, never shell-interpolated. */
  async addRemote(repoPath: string, name: string, url: string): Promise<void> {
    await this.runner.run({
      args: ['remote', 'add', name, url],
      cwd: repoPath,
      readOnly: false,
    })
  }

  /**
   * The git-reported toplevel of the repo enclosing `repoPath`, or `null` if `repoPath`
   * is not inside any git working tree — the nested-repo guard for the Initialize flow
   * (Initialize Repository, Phase 86). The caller compares this (after `fs.realpath`)
   * against `repoPath` itself to detect "already inside an existing repo."
   */
  async findEnclosingToplevel(repoPath: string): Promise<string | null> {
    try {
      const result = await this.runner.run({
        args: ['rev-parse', '--show-toplevel'],
        cwd: repoPath,
        readOnly: true,
      })
      return result.stdout.toString('utf8').trim()
    } catch {
      return null
    }
  }

  async setLocalIdentity(repoPath: string, name: string, email: string): Promise<void> {
    await this.runner.run({
      args: ['config', '--local', 'user.name', name],
      cwd: repoPath,
      readOnly: false,
    })
    await this.runner.run({
      args: ['config', '--local', 'user.email', email],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async getRemotes(repoPath: string): Promise<GitRemote[]> {
    const result = await this.runner.run({
      args: ['remote', '-v'],
      cwd: repoPath,
      readOnly: true,
    })
    return parseRemoteLines(result.stdout.toString('utf8'))
  }

  /**
   * Repoint a remote's URL. `git remote set-url` writes the repo's `.git/config` only
   * (local scope — there is no global variant), used to bind/restore the SSH host alias
   * (ADR 0009). Args stay an array; the URL is data, never shell-interpolated.
   */
  async setRemoteUrl(repoPath: string, remote: string, url: string): Promise<void> {
    await this.runner.run({
      args: ['remote', 'set-url', remote, url],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async fetch(
    repoPath: string,
    remote: string,
    auth?: PushAuth,
    exec?: WriteExecutor
  ): Promise<void> {
    const run = exec ?? ((inv) => this.runner.run({ ...inv, cwd: repoPath, readOnly: false }))
    await run({
      args: [...this.credentialIsolationArgs(auth), 'fetch', remote],
      timeoutMs: 60_000,
      extraEnv: this.askpassEnv(auth),
    })
  }

  async pull(
    repoPath: string,
    remote: string,
    branch: string,
    auth?: PushAuth,
    exec?: WriteExecutor
  ): Promise<void> {
    // `--ff-only`: integrate the remote ONLY when it is a clean fast-forward. This
    // keeps the common "local is behind" case working while turning a divergence
    // into a single, predictable "Not possible to fast-forward" error (mapped to
    // `divergentBranches`) — instead of git's cryptic "Need to specify how to
    // reconcile" or a surprise merge commit / conflict a user did not ask for.
    // A merge/rebase is a deliberate action, not a silent side effect of Pull.
    const run = exec ?? ((inv) => this.runner.run({ ...inv, cwd: repoPath, readOnly: false }))
    await run({
      args: [...this.credentialIsolationArgs(auth), 'pull', '--ff-only', remote, branch],
      timeoutMs: 60_000,
      extraEnv: this.askpassEnv(auth),
    })
  }

  /**
   * `-u` is added only when the branch being pushed has no upstream yet, so the first
   * push after connecting a remote (Initialize Repository, Phase 86) wires tracking
   * exactly like GitHub's own "git push -u origin main" — behavior is unchanged once
   * an upstream already exists. Probes the NAMED branch's upstream (`<branch>@{u}`),
   * not HEAD's (W10) — pushing a branch other than the checked-out one used to get
   * `-u` decided by the wrong ref entirely.
   */
  async push(
    repoPath: string,
    remote: string,
    branch: string,
    auth?: PushAuth,
    exec?: WriteExecutor
  ): Promise<void> {
    const hasUpstream = await this.hasUpstream(repoPath, branch)
    const pushArgs = hasUpstream ? ['push', remote, branch] : ['push', '-u', remote, branch]
    const run = exec ?? ((inv) => this.runner.run({ ...inv, cwd: repoPath, readOnly: false }))
    await run({
      args: [...this.credentialIsolationArgs(auth), ...pushArgs],
      timeoutMs: 60_000,
      extraEnv: this.askpassEnv(auth),
    })
  }

  private async hasUpstream(repoPath: string, branch: string): Promise<boolean> {
    try {
      await this.runner.run({
        args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{u}`],
        cwd: repoPath,
        readOnly: true,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Merge `ref` into the current branch (Merge a Branch, Phase 82). Purely
   * local: NO `auth` param, no credential env, no network call. `--no-edit`
   * accepts git's default merge message so a GUI user is never dropped into an
   * editor. A real content conflict rejects with a `GitError` (code
   * `mergeConflict`, thanks to the GitRunner stdout-classification fix above)
   * and leaves the repo in git's standard mid-merge state — this method does
   * NOT catch or resolve it.
   */
  async mergeBranch(repoPath: string, ref: string, exec?: WriteExecutor): Promise<void> {
    const run = exec ?? ((inv) => this.runner.run({ ...inv, cwd: repoPath, readOnly: false }))
    await run({ args: ['merge', '--no-edit', ref], timeoutMs: 60_000 })
  }

  /**
   * Merge the already-fetched `<remote>/<branch>` tracking ref into the current
   * local branch (Diverged-Branch Merge, Phase 69). Delegates to `mergeBranch`
   * so both flows share one merge code path and one conflict-classification
   * behaviour.
   */
  async mergeRemoteBranch(
    repoPath: string,
    remote: string,
    branch: string,
    exec?: WriteExecutor
  ): Promise<void> {
    return this.mergeBranch(repoPath, `${remote}/${branch}`, exec)
  }

  /**
   * Per-invocation env that supplies HTTPS-token credentials to a remote operation.
   * When token auth is present the credential is routed through the GIT_ASKPASS env
   * ONLY — the args stay token-free, and nothing is written to the URL or .git/config.
   * Used by push, fetch, AND pull so the repo's assigned profile authenticates every
   * remote operation (not just push); returns undefined for SSH / ambient-credential
   * remotes, leaving their behavior unchanged.
   */
  private askpassEnv(auth?: PushAuth): Record<string, string> | undefined {
    return auth ? buildAskpassEnv(ensureAskpassHelper(), auth.username, auth.token) : undefined
  }

  /**
   * When pushing/fetching/pulling with the assigned profile's token, force git to
   * IGNORE every inherited credential helper (macOS keychain, `gh`'s git-credential,
   * etc.) so the per-invocation GIT_ASKPASS token is the ONLY credential source.
   * Without this a global/host-specific helper could authenticate as the wrong
   * account — the exact failure GitWarden exists to prevent. An empty `credential.helper`
   * resets git's *entire* helper list (generic AND host-specific, verified empirically),
   * so no host needs to be named; this works for github.com and Enterprise alike.
   * Returns no args when there is no token (SSH / ambient credentials are left intact).
   */
  private credentialIsolationArgs(auth?: PushAuth): string[] {
    return auth ? ['-c', 'credential.helper='] : []
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    const localRes = await this.runner.run({
      args: ['for-each-ref', '--format=%(refname:short)\t%(HEAD)\t%(worktreepath)', 'refs/heads'],
      cwd: repoPath,
      readOnly: true,
    })
    const localBranches: GitBranch[] = localRes.stdout
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, head, worktreePath] = line.split('\t')
        return {
          name,
          isCurrent: head === '*',
          isRemote: false,
          worktreePath: worktreePath || undefined,
        }
      })

    const remoteRes = await this.runner.run({
      args: ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'],
      cwd: repoPath,
      readOnly: true,
    })
    const remoteBranches: GitBranch[] = remoteRes.stdout
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .filter((name) => !name.endsWith('/HEAD'))
      .map((name) => ({ name, isCurrent: false, isRemote: true }))

    return [...localBranches, ...remoteBranches]
  }

  async switchBranch(repoPath: string, branch: string): Promise<void> {
    await this.runner.run({ args: ['switch', branch], cwd: repoPath, readOnly: false })
  }

  async createBranch(repoPath: string, name: string): Promise<void> {
    await this.runner.run({ args: ['switch', '-c', name], cwd: repoPath, readOnly: false })
  }

  async deleteBranch(repoPath: string, name: string): Promise<void> {
    const existsRes = await this.runner.run({
      args: ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      cwd: repoPath,
      readOnly: true,
    })
    const exists = existsRes.stdout
      .toString('utf8')
      .split('\n')
      .some((branch) => branch === name)
    if (!exists) return

    await this.runner.run({ args: ['branch', '-D', name], cwd: repoPath, readOnly: false })
  }

  /**
   * A freshly-init'd repo with no commits (unborn HEAD) makes `git log` exit non-zero
   * with "does not have any commits yet" — that specific case returns `[]` instead of
   * throwing (Initialize Repository, Phase 87), mirroring `getCommitsAhead`'s
   * no-tracking-ref fallback below. Any other error still propagates.
   */
  async getCommitHistory(repoPath: string, limit: number, skip: number): Promise<GitCommit[]> {
    try {
      return await this.queryCommitLog(repoPath, ['-n', String(limit), '--skip', String(skip)])
    } catch (err) {
      if (err instanceof GitError && /does not have any commits yet/i.test(err.technicalDetails)) {
        return []
      }
      throw err
    }
  }

  /** Commits on HEAD not yet on remote/branch — used for Push Brief (Phase 35). */
  async getCommitsAhead(
    repoPath: string,
    remote: string,
    branch: string,
    limit: number
  ): Promise<GitCommit[]> {
    try {
      return await this.queryCommitLog(repoPath, ['-n', String(limit), `${remote}/${branch}..HEAD`])
    } catch (err) {
      // First push — the remote-tracking ref doesn't exist yet, so git reports the
      // range itself as an unresolvable revision. Narrowed to that specific failure
      // (W29, mirroring getCommitHistory's pattern above): any OTHER error (a bad
      // repo path, a timeout, a real permissions failure) must still propagate
      // instead of being silently reinterpreted as "first push".
      if (
        err instanceof GitError &&
        /unknown revision or path not in the working tree|ambiguous argument/i.test(
          err.technicalDetails
        )
      ) {
        return this.getCommitHistory(repoPath, limit, 0)
      }
      throw err
    }
  }

  private async queryCommitLog(repoPath: string, extraArgs: string[]): Promise<GitCommit[]> {
    const result = await this.runner.run({
      args: ['log', '-z', '--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s', ...extraArgs],
      cwd: repoPath,
      readOnly: true,
    })
    const raw = result.stdout.toString('utf8')
    if (!raw) return []
    const fields = raw.split('\0').filter((f) => f !== '')
    const commits: GitCommit[] = []
    for (let i = 0; i + 5 < fields.length; i += 6) {
      commits.push({
        fullHash: fields[i],
        shortHash: fields[i + 1],
        authorName: fields[i + 2],
        authorEmail: fields[i + 3],
        date: fields[i + 4],
        message: fields[i + 5],
      })
    }
    return commits
  }

  /**
   * Count of commits in `<remote>/<branch>..HEAD` — the "unpushed" set (Uncommit to Working
   * Changes, Phase 77). Mirrors `getCommitsAhead`'s no-tracking-ref fallback (finding 1 of the
   * plan): when the remote-tracking ref doesn't exist yet (first push), every local commit on
   * HEAD counts as unpushed and `hasUpstream` reports `false` so callers can distinguish "0
   * commits ahead of a real upstream" from "no upstream to compare against."
   */
  async getUnpushedCount(
    repoPath: string,
    remote: string,
    branch: string
  ): Promise<{ count: number; hasUpstream: boolean }> {
    try {
      const result = await this.runner.run({
        args: ['rev-list', '--count', `${remote}/${branch}..HEAD`],
        cwd: repoPath,
        readOnly: true,
      })
      return { count: Number(result.stdout.toString('utf8').trim()), hasUpstream: true }
    } catch {
      return { count: await this.countLocalCommits(repoPath), hasUpstream: false }
    }
  }

  private async countLocalCommits(repoPath: string): Promise<number> {
    const result = await this.runner.run({
      args: ['rev-list', '--count', 'HEAD'],
      cwd: repoPath,
      readOnly: true,
    })
    return Number(result.stdout.toString('utf8').trim())
  }

  /** True iff HEAD has ≥2 parents (a merge commit). */
  private async isHeadMerge(repoPath: string): Promise<boolean> {
    const result = await this.runner.run({
      args: ['rev-list', '--parents', '-n', '1', 'HEAD'],
      cwd: repoPath,
      readOnly: true,
    })
    const tokens = result.stdout.toString('utf8').trim().split(/\s+/).filter(Boolean)
    return tokens.length >= 3 // HEAD's own hash + 2 or more parent hashes
  }

  /** True iff HEAD has no parent (the root commit — `HEAD~1` doesn't resolve). */
  private async isHeadRoot(repoPath: string): Promise<boolean> {
    return !(await this.refExists(repoPath, 'HEAD~1'))
  }

  /** True iff there is a merge commit anywhere in `HEAD~n..HEAD`. */
  private async hasMergeInRange(repoPath: string, n: number): Promise<boolean> {
    const result = await this.runner.run({
      args: ['rev-list', '--merges', `HEAD~${n}..HEAD`],
      cwd: repoPath,
      readOnly: true,
    })
    return result.stdout.toString('utf8').trim().length > 0
  }

  /** True iff a merge, rebase, or cherry-pick is currently in progress. */
  private async isInProgressOp(repoPath: string): Promise<boolean> {
    for (const ref of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD']) {
      if (await this.refExists(repoPath, ref)) return true
    }
    return false
  }

  private async refExists(repoPath: string, ref: string): Promise<boolean> {
    try {
      await this.runner.run({
        args: ['rev-parse', '--verify', '-q', ref],
        cwd: repoPath,
        readOnly: true,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Assembles the read-only snapshot the pure `evaluateUncommit` decides on (Uncommit to Working
   * Changes, Phase 76/77). Derives the upstream remote/branch from `getStatus`'s `upstream` field
   * (e.g. `"origin/main"`) rather than requiring the caller to pass them, so a single `getStatus`
   * call also answers the clean-tree and detached-HEAD questions. `rangeHasMerge` is only
   * evaluated when there is a real upstream and at least one unpushed commit — with no upstream,
   * `HEAD~unpushedCount` may not resolve, and the "return all unpushed" action is refused
   * `no-upstream-for-all` before `rangeHasMerge` would matter anyway.
   */
  async getUncommitContext(repoPath: string): Promise<UncommitContext> {
    const status = await this.getStatus(repoPath)
    const workingTreeClean = status.files.length === 0
    const detachedHead = status.branch === undefined

    const slash = status.upstream?.indexOf('/') ?? -1
    const { count: unpushedCount, hasUpstream } =
      status.upstream && slash > 0
        ? await this.getUnpushedCount(
            repoPath,
            status.upstream.slice(0, slash),
            status.upstream.slice(slash + 1)
          )
        : { count: await this.countLocalCommits(repoPath), hasUpstream: false }

    const [headIsMerge, headIsRoot, inProgressOp, rangeHasMerge] = await Promise.all([
      this.isHeadMerge(repoPath),
      this.isHeadRoot(repoPath),
      this.isInProgressOp(repoPath),
      hasUpstream && unpushedCount >= 1 ? this.hasMergeInRange(repoPath, unpushedCount) : false,
    ])

    return {
      unpushedCount,
      hasUpstream,
      workingTreeClean,
      headIsMerge,
      headIsRoot,
      rangeHasMerge,
      inProgressOp,
      detachedHead,
    }
  }

  /**
   * Moves HEAD (and the index) to `target` while leaving the working tree untouched, so the
   * commits between `target` and the old HEAD reappear as unstaged changes (Uncommit to Working
   * Changes, Phase 77). Callers pass a validated `` `HEAD~${n}` `` — never free-form user text —
   * so this stays a safe array element (AGENTS.md rule #3), same as every other GitService call.
   */
  async resetMixed(repoPath: string, target: string, exec?: WriteExecutor): Promise<void> {
    const run = exec ?? ((inv) => this.runner.run({ ...inv, cwd: repoPath, readOnly: false }))
    await run({ args: ['reset', '--mixed', target] })
  }

  async discardFile(repoPath: string, filePath: string): Promise<void> {
    await this.runner.run({
      args: ['restore', '--', filePath],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async cleanFile(repoPath: string, filePath: string): Promise<void> {
    await this.runner.run({
      args: ['clean', '-fd', '--', filePath],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async validateGitPath(gitPath: string): Promise<{ version: string }> {
    return GitLocator.inspect(gitPath)
  }

  async getDiff(repoPath: string, filePath: string, staged: boolean): Promise<string> {
    const args = ['diff', '--no-color']
    if (staged) args.push('--staged')
    args.push('--', filePath)
    const result = await this.runner.run({ args, cwd: repoPath, readOnly: true })
    return result.stdout.toString('utf8')
  }

  async getEffectiveIdentity(repoPath: string): Promise<EffectiveGitIdentity> {
    const fetchConfig = async (
      key: string
    ): Promise<{ value: string; scope: GitConfigScope } | undefined> => {
      try {
        const result = await this.runner.run({
          args: ['config', '--show-origin', '--get', key],
          cwd: repoPath,
          readOnly: true,
        })
        const line = result.stdout.toString('utf8').trim()
        const tabIdx = line.indexOf('\t')
        if (tabIdx === -1) return undefined
        const origin = line.slice(0, tabIdx)
        const value = line.slice(tabIdx + 1)
        return { value, scope: parseScope(origin) }
      } catch {
        // git exits 1 when the key is not set — treat as absent
        return undefined
      }
    }

    const [name, email] = await Promise.all([fetchConfig('user.name'), fetchConfig('user.email')])

    return {
      userName: name?.value,
      userEmail: email?.value,
      nameSource: name?.scope,
      emailSource: email?.scope,
    }
  }
}
