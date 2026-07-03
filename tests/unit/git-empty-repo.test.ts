import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('Empty-repo (unborn HEAD) tolerance (Phase 87)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-empty-repo-'))
    repoPath = path.join(tmpDir, 'repo')
    await mkdir(repoPath, { recursive: true })
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    service = new GitService(new GitRunner(gitPath))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('getCommitHistory', () => {
    it('returns [] instead of throwing on a repo with no commits', async () => {
      await expect(service.getCommitHistory(repoPath, 20, 0)).resolves.toEqual([])
    })

    it('still returns real commits once one exists', async () => {
      await git(repoPath, 'config', 'user.name', 'Test User')
      await git(repoPath, 'config', 'user.email', 'test@example.com')
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')

      const commits = await service.getCommitHistory(repoPath, 20, 0)
      expect(commits).toHaveLength(1)
      expect(commits[0].message).toBe('c1')
    })

    it('still propagates a genuine error (invalid repo path)', async () => {
      const notARepo = path.join(tmpDir, 'not-a-repo')
      await mkdir(notARepo, { recursive: true })
      await expect(service.getCommitHistory(notARepo, 20, 0)).rejects.toThrow()
    })
  })

  describe('getStatus', () => {
    it('returns a valid GitStatus (branch main, no files) on an unborn HEAD', async () => {
      const status = await service.getStatus(repoPath)
      expect(status.branch).toBe('main')
      expect(status.files).toEqual([])
    })
  })
})
