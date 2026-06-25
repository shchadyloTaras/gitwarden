import type { AiContextDiff } from '../../core/ai/context.js'
import { scanDeterministicFindings } from '../../core/ai/changeReview.js'
import type { AiReviewFinding } from '../../core/ai/types.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { GitService } from '../services/GitService.js'

export interface StagedChangeReviewInput {
  repositoryId: string
}

/** Loads staged diffs and runs the pure-core deterministic scanner (AI not required). */
export class StagedChangeReviewService {
  constructor(
    private readonly repositories: IRepositoryService,
    private readonly git: Pick<GitService, 'getStatus' | 'getDiff'>
  ) {}

  async scanDeterministic(input: StagedChangeReviewInput): Promise<AiReviewFinding[]> {
    const diffs = await this.collectStagedDiffs(input.repositoryId)
    return scanDeterministicFindings(diffs)
  }

  private async collectStagedDiffs(repositoryId: string): Promise<AiContextDiff[]> {
    const repository = await this.repositories.get(repositoryId)
    if (!repository) throw new Error(`Repository not found: ${repositoryId}`)

    const status = await this.git.getStatus(repository.localPath)
    const stagedPaths = status.files
      .filter(
        (file) =>
          file.indexStatus !== 'unmodified' &&
          file.indexStatus !== 'untracked' &&
          file.indexStatus !== 'ignored' &&
          file.indexStatus !== 'conflicted'
      )
      .map((file) => file.path)

    const diffs: AiContextDiff[] = []
    for (const path of stagedPaths) {
      const diff = await this.git.getDiff(repository.localPath, path, true)
      diffs.push({ path, staged: true, diff })
    }
    return diffs
  }
}
