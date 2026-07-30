import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import { AgenticActionExecutor } from '../../src/main/ai/AgenticActionExecutor'
import type { IRepositoryService } from '../../src/main/services/RepositoryService'
import type { RepositoryRecord } from '../../src/core/types'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

function fakeRepositories(record: RepositoryRecord | undefined): IRepositoryService {
  return {
    list: async () => (record ? [record] : []),
    get: async (id: string) => (record?.id === id ? record : undefined),
    create: async () => {
      throw new Error('not implemented')
    },
    update: async () => {
      throw new Error('not implemented')
    },
    delete: async () => {},
    pruneAssignments: async () => [],
  }
}

// Phase 94 (W2/W11 sibling protection for file edits): AgenticActionExecutor refuses
// to overwrite a file whose disk content no longer matches `edit.before` — the AI's
// last-known snapshot — instead of blindly clobbering whatever changed underneath it
// since the AI looked. The whole batch runs inside GitService.enqueueJob so it can't
// interleave a queued checkout.
describe('AgenticActionExecutor (Phase 94)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let git_: GitService
  let repository: RepositoryRecord
  let executor: AgenticActionExecutor

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-agentic-exec-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    git_ = new GitService(new GitRunner(gitPath))
    repository = { id: 'r1', name: 'repo', localPath: repoPath, isFavorite: false }
    executor = new AgenticActionExecutor(fakeRepositories(repository), git_)
  })

  afterEach(async () => {
    await removeTempDir(tmpDir)
  })

  it('rejects an unknown repositoryId with a clear error', async () => {
    const missing = new AgenticActionExecutor(fakeRepositories(undefined), git_)
    await expect(missing.executeFileEdits('nope', [{ path: 'a.txt', after: 'x' }])).rejects.toThrow(
      /Repository not found/
    )
  })

  it('rejects an empty batch of file edits — belt-and-braces, never a silent no-op success (Phase 104)', async () => {
    await expect(executor.executeFileEdits(repository.id, [])).rejects.toThrow(
      /No file edits to apply/
    )
  })

  it('writes a new file when `before` is omitted (backward compatible)', async () => {
    const result = await executor.executeFileEdits(repository.id, [
      { path: 'notes.txt', after: 'hello\n' },
    ])
    expect(result.writtenFiles).toEqual(['notes.txt'])
    expect(await readFile(path.join(repoPath, 'notes.txt'), 'utf8')).toBe('hello\n')
  })

  it('writes the edit when `before` matches the current disk content', async () => {
    await writeFile(path.join(repoPath, 'a.txt'), 'original\n')
    const result = await executor.executeFileEdits(repository.id, [
      { path: 'a.txt', before: 'original\n', after: 'updated\n' },
    ])
    expect(result.writtenFiles).toEqual(['a.txt'])
    expect(await readFile(path.join(repoPath, 'a.txt'), 'utf8')).toBe('updated\n')
  })

  it('refuses when `before` no longer matches the current disk content', async () => {
    await writeFile(path.join(repoPath, 'a.txt'), 'CHANGED BY SOMEONE ELSE\n')
    await expect(
      executor.executeFileEdits(repository.id, [
        { path: 'a.txt', before: 'original\n', after: 'updated\n' },
      ])
    ).rejects.toThrow(/a\.txt changed since the AI looked at it/)
    // The refusal must be real — the file on disk is untouched.
    expect(await readFile(path.join(repoPath, 'a.txt'), 'utf8')).toBe('CHANGED BY SOMEONE ELSE\n')
  })

  it('treats a `before` for a file that no longer exists as a mismatch, not a crash', async () => {
    await expect(
      executor.executeFileEdits(repository.id, [
        { path: 'gone.txt', before: 'it used to say this\n', after: 'updated\n' },
      ])
    ).rejects.toThrow(/gone\.txt changed since the AI looked at it/)
  })

  it('an earlier edit in the batch that already succeeded stays written when a later edit refuses', async () => {
    await writeFile(path.join(repoPath, 'b.txt'), 'stale\n')
    await expect(
      executor.executeFileEdits(repository.id, [
        { path: 'a.txt', after: 'first edit, no before check\n' },
        { path: 'b.txt', before: 'original\n', after: 'second edit, refused\n' },
      ])
    ).rejects.toThrow(/b\.txt changed since the AI looked at it/)
    expect(await readFile(path.join(repoPath, 'a.txt'), 'utf8')).toBe(
      'first edit, no before check\n'
    )
    expect(await readFile(path.join(repoPath, 'b.txt'), 'utf8')).toBe('stale\n')
  })

  it('still refuses to write outside the repository or into .git', async () => {
    await expect(
      executor.executeFileEdits(repository.id, [{ path: '../escape.txt', after: 'x' }])
    ).rejects.toThrow(/safe relative path/)
    await expect(
      executor.executeFileEdits(repository.id, [{ path: '.git/config', after: 'x' }])
    ).rejects.toThrow(/\.git metadata/)
  })

  it('runs the whole batch through GitService.enqueueJob — it waits behind an in-flight job on the same repo', async () => {
    const order: string[] = []
    let releaseSlowJob: () => void = () => {}
    const slowJob = git_.enqueueJob(repoPath, async () => {
      order.push('slow-job-start')
      await new Promise<void>((resolve) => {
        releaseSlowJob = resolve
      })
      order.push('slow-job-end')
    })

    const editPromise = executor
      .executeFileEdits(repository.id, [{ path: 'queued.txt', after: 'ran after the slow job\n' }])
      .then(() => order.push('edit-done'))

    // Give the edit a chance to (wrongly) run early if it weren't actually queued.
    await new Promise((r) => setTimeout(r, 20))
    expect(order).toEqual(['slow-job-start'])

    releaseSlowJob()
    await Promise.all([slowJob, editPromise])
    expect(order).toEqual(['slow-job-start', 'slow-job-end', 'edit-done'])
  })
})
