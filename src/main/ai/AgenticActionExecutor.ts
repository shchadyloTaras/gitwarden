import fs from 'node:fs/promises'
import path from 'node:path'
import { assertSafeAgenticRepoPath } from '../../core/ai/agenticActions.js'
import type { AiAgenticFileEdit } from '../../core/ai/types.js'
import type { IRepositoryService } from '../services/RepositoryService.js'

export interface AgenticExecutionResult {
  writtenFiles: string[]
}

export class AgenticActionExecutor {
  constructor(private readonly repositories: IRepositoryService) {}

  async executeFileEdits(
    repositoryId: string,
    fileEdits: AiAgenticFileEdit[]
  ): Promise<AgenticExecutionResult> {
    const repository = await this.repositories.get(repositoryId)
    if (!repository) throw new Error(`Repository not found: ${repositoryId}`)

    const writtenFiles: string[] = []
    for (const edit of fileEdits) {
      assertSafeAgenticRepoPath(edit.path)
      const absolute = path.resolve(repository.localPath, edit.path)
      if (!isInsideRepo(repository.localPath, absolute)) {
        throw new Error(`Refusing to write outside repository: ${edit.path}`)
      }
      await fs.mkdir(path.dirname(absolute), { recursive: true })
      await fs.writeFile(absolute, edit.after, 'utf8')
      writtenFiles.push(edit.path)
    }
    return { writtenFiles }
  }
}

function isInsideRepo(repoRoot: string, candidate: string): boolean {
  const root = path.resolve(repoRoot)
  const resolved = path.resolve(candidate)
  return resolved.startsWith(`${root}${path.sep}`)
}
