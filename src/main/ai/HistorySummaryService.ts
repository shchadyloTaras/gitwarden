import { buildDeterministicHistorySummary } from '../../core/ai/historySummary.js'
import type { AiHistorySummary } from '../../core/ai/types.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { GitService } from '../services/GitService.js'

const HISTORY_COMMITS_LIMIT = 30

export class HistorySummaryService {
  constructor(
    private readonly repositories: IRepositoryService,
    private readonly git: Pick<GitService, 'getCommitHistory' | 'getStatus'>
  ) {}

  async buildDeterministic(repositoryId: string): Promise<AiHistorySummary> {
    const repository = await this.requireRepository(repositoryId)
    const [status, commits] = await Promise.all([
      this.git.getStatus(repository.localPath),
      this.git.getCommitHistory(repository.localPath, HISTORY_COMMITS_LIMIT, 0),
    ])
    return buildDeterministicHistorySummary(commits, status.branch)
  }

  private async requireRepository(id: string) {
    const repository = await this.repositories.get(id)
    if (!repository) throw new Error(`Repository not found: ${id}`)
    return repository
  }
}
