import type { GitStatus } from '../../core/types.js'
import { parsePorcelainV2 } from '../../core/parsers/PorcelainParser.js'
import type { GitRunner } from '../git/GitRunner.js'

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
}
