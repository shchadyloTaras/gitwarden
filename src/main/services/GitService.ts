import type { GitStatus, EffectiveGitIdentity, GitConfigScope } from '../../core/types.js'
import { parsePorcelainV2 } from '../../core/parsers/PorcelainParser.js'
import type { GitRunner } from '../git/GitRunner.js'

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
