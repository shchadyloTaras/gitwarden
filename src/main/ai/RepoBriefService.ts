import { buildDeterministicRepoBrief } from '../../core/ai/repoBrief.js'
import type { AiAllowlistedFile, AiRepoBrief } from '../../core/ai/types.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { GitService } from '../services/GitService.js'
import { RepoBriefFileReader } from './RepoBriefFileReader.js'

const RECENT_COMMITS_LIMIT = 10

export class RepoBriefService {
  private readonly reader = new RepoBriefFileReader()

  constructor(
    private readonly repositories: IRepositoryService,
    private readonly git: Pick<GitService, 'getCommitHistory'>
  ) {}

  async listAllowlistedFiles(repositoryId: string): Promise<AiAllowlistedFile[]> {
    const repository = await this.requireRepository(repositoryId)
    const paths = await this.reader.listAllowlistedPaths(repository.localPath)
    const files = await this.reader.readAllowlistedFiles(repository.localPath)
    const byPath = new Map(files.map((f) => [f.path, f.content.length]))
    return paths.map((p) => ({ path: p, byteLength: byPath.get(p) ?? 0 }))
  }

  async buildDeterministic(repositoryId: string): Promise<AiRepoBrief> {
    const repository = await this.requireRepository(repositoryId)
    const [files, recentCommits] = await Promise.all([
      this.reader.readAllowlistedFiles(repository.localPath),
      this.git.getCommitHistory(repository.localPath, RECENT_COMMITS_LIMIT, 0).catch(() => []),
    ])
    return buildDeterministicRepoBrief(repository.name, files, recentCommits)
  }

  async readAllowlistedFilesForContext(repositoryId: string) {
    const repository = await this.requireRepository(repositoryId)
    return this.reader.readAllowlistedFiles(repository.localPath)
  }

  private async requireRepository(id: string) {
    const repository = await this.repositories.get(id)
    if (!repository) throw new Error(`Repository not found: ${id}`)
    return repository
  }
}
