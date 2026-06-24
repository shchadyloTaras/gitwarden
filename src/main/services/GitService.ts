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
import type { GitRunner } from '../git/GitRunner.js'
import { GitLocator } from '../git/GitLocator.js'
import { buildAskpassEnv, ensureAskpassHelper } from '../git/askpass.js'

/** HTTPS-token credentials for a single push. The token never enters argv or config. */
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

export class GitService {
  constructor(private readonly runner: GitRunner) {}

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

  async unstageFile(repoPath: string, filePath: string): Promise<void> {
    await this.runner.run({
      args: ['restore', '--staged', '--', filePath],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async stageAll(repoPath: string): Promise<void> {
    await this.runner.run({ args: ['add', '-A'], cwd: repoPath, readOnly: false })
  }

  async unstageAll(repoPath: string): Promise<void> {
    await this.runner.run({
      args: ['restore', '--staged', '--', '.'],
      cwd: repoPath,
      readOnly: false,
    })
  }

  async commit(repoPath: string, message: string): Promise<{ hash: string }> {
    await this.runner.run({
      args: ['commit', '-m', message],
      cwd: repoPath,
      readOnly: false,
    })
    const result = await this.runner.run({
      args: ['rev-parse', '--short', 'HEAD'],
      cwd: repoPath,
      readOnly: true,
    })
    return { hash: result.stdout.toString('utf8').trim() }
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

  async fetch(repoPath: string, remote: string): Promise<void> {
    await this.runner.run({
      args: ['fetch', remote],
      cwd: repoPath,
      readOnly: false,
      timeoutMs: 60_000,
    })
  }

  async pull(repoPath: string, remote: string, branch: string): Promise<void> {
    await this.runner.run({
      args: ['pull', remote, branch],
      cwd: repoPath,
      readOnly: false,
      timeoutMs: 60_000,
    })
  }

  async push(repoPath: string, remote: string, branch: string, auth?: PushAuth): Promise<void> {
    // When token auth is supplied, route the credential through GIT_ASKPASS env only —
    // the args stay token-free, and nothing is written to the URL or .git/config.
    const extraEnv = auth
      ? buildAskpassEnv(ensureAskpassHelper(), auth.username, auth.token)
      : undefined
    await this.runner.run({
      args: ['push', remote, branch],
      cwd: repoPath,
      readOnly: false,
      timeoutMs: 60_000,
      extraEnv,
    })
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    const localRes = await this.runner.run({
      args: ['for-each-ref', '--format=%(refname:short)\t%(HEAD)', 'refs/heads'],
      cwd: repoPath,
      readOnly: true,
    })
    const localBranches: GitBranch[] = localRes.stdout
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, head] = line.split('\t')
        return { name, isCurrent: head === '*', isRemote: false }
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
    await this.runner.run({ args: ['branch', '-D', name], cwd: repoPath, readOnly: false })
  }

  async getCommitHistory(repoPath: string, limit: number, skip: number): Promise<GitCommit[]> {
    const result = await this.runner.run({
      args: [
        'log',
        '-z',
        '--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s',
        `-n`,
        String(limit),
        '--skip',
        String(skip),
      ],
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
