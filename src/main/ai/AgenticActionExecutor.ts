import fs from 'node:fs/promises'
import path from 'node:path'
import { assertSafeAgenticRepoPath } from '../../core/ai/agenticActions.js'
import type { AiAgenticFileEdit } from '../../core/ai/types.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { GitService } from '../services/GitService.js'

export interface AgenticExecutionResult {
  writtenFiles: string[]
}

async function readFileIfExists(absolute: string): Promise<string | undefined> {
  try {
    return await fs.readFile(absolute, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

export class AgenticActionExecutor {
  constructor(
    private readonly repositories: IRepositoryService,
    private readonly git: Pick<GitService, 'enqueueJob'>
  ) {}

  async executeFileEdits(
    repositoryId: string,
    fileEdits: AiAgenticFileEdit[]
  ): Promise<AgenticExecutionResult> {
    // Phase 104 (belt-and-braces): the renderer already refuses to call this for an
    // empty proposal, but an empty batch must never silently succeed here either —
    // it is a caller error, not a valid zero-op "Applied 0 file edit(s)".
    if (fileEdits.length === 0) {
      throw new Error('No file edits to apply.')
    }
    const repository = await this.repositories.get(repositoryId)
    if (!repository) throw new Error(`Repository not found: ${repositoryId}`)

    // The whole batch runs as one compound job (Phase 91's enqueueJob/exec-threading
    // pattern, reused here per Phase 94's plan) so it can't interleave a queued
    // checkout — a switch landing mid-batch could otherwise make `before` compare
    // against the WRONG branch's content, or the edits could land split across two
    // different branches' working trees. This closes the GitRunner-vs-GitRunner
    // race, not every conceivable one: a fully external process (an editor, another
    // tool) writing the SAME file between the `before` read below and the `after`
    // write is a separate, out-of-scope race this check does not close — the
    // primary threat this guards against is staleness across the (often
    // minutes-long) gap between the AI drafting an edit and the user clicking Apply.
    return this.git.enqueueJob(repository.localPath, async () => {
      const writtenFiles: string[] = []
      for (const edit of fileEdits) {
        assertSafeAgenticRepoPath(edit.path)
        const absolute = path.resolve(repository.localPath, edit.path)
        if (!isInsideRepo(repository.localPath, absolute)) {
          throw new Error(`Refusing to write outside repository: ${edit.path}`)
        }
        if (edit.before !== undefined) {
          const current = await readFileIfExists(absolute)
          if (current !== edit.before) {
            throw new Error(
              `${edit.path} changed since the AI looked at it — refusing to overwrite it.`
            )
          }
        }
        await fs.mkdir(path.dirname(absolute), { recursive: true })
        await fs.writeFile(absolute, edit.after, 'utf8')
        writtenFiles.push(edit.path)
      }
      return { writtenFiles }
    })
  }
}

function isInsideRepo(repoRoot: string, candidate: string): boolean {
  const root = path.resolve(repoRoot)
  const resolved = path.resolve(candidate)
  return resolved.startsWith(`${root}${path.sep}`)
}
