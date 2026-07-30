import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, stat, writeFile, realpath } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import { runGitInitialize, type GitInitializeDeps } from '../../src/main/ipc/gitInitializeHandler'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('Initialize Repository (Phase 86)', () => {
  let gitPath: string
  let tmpDir: string
  let service: GitService
  let deps: GitInitializeDeps

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-init-'))
    service = new GitService(new GitRunner(gitPath))
    deps = { git: service }
  })

  afterEach(async () => {
    await removeTempDir(tmpDir)
  })

  describe('GitService.initRepository', () => {
    it('creates a .git dir with the current branch set to main', async () => {
      const repoPath = path.join(tmpDir, 'plain-folder')
      await mkdir(repoPath, { recursive: true })

      await service.initRepository(repoPath)

      await expect(stat(path.join(repoPath, '.git'))).resolves.toBeDefined()
      expect(await git(repoPath, 'symbolic-ref', '--short', 'HEAD')).toBe('main')
    })
  })

  describe('GitService.addRemote', () => {
    it('adds an origin remote pointing at the given url', async () => {
      const repoPath = path.join(tmpDir, 'repo')
      await mkdir(repoPath, { recursive: true })
      await service.initRepository(repoPath)
      const remoteDir = path.join(tmpDir, 'remote.git')
      await execFileAsync('git', ['init', '--bare', '-b', 'main', remoteDir])

      await service.addRemote(repoPath, 'origin', remoteDir)

      const remotes = await service.getRemotes(repoPath)
      expect(remotes).toEqual([expect.objectContaining({ name: 'origin', url: remoteDir })])
    })
  })

  describe('GitService.findEnclosingToplevel', () => {
    it('returns the enclosing toplevel for a subfolder of an existing repo', async () => {
      const repoPath = path.join(tmpDir, 'existing-repo')
      const subfolder = path.join(repoPath, 'nested', 'deeper')
      await mkdir(subfolder, { recursive: true })
      await service.initRepository(repoPath)

      const toplevel = await service.findEnclosingToplevel(subfolder)

      expect(toplevel).not.toBeNull()
      expect(await realpath(toplevel!)).toBe(await realpath(repoPath))
    })

    it('returns null for a standalone folder outside any repo', async () => {
      const standalone = path.join(tmpDir, 'standalone')
      await mkdir(standalone, { recursive: true })

      expect(await service.findEnclosingToplevel(standalone)).toBeNull()
    })
  })

  describe('runGitInitialize orchestrator', () => {
    it('writes --local identity and adds the remote on a full success', async () => {
      const repoPath = path.join(tmpDir, 'new-repo')
      await mkdir(repoPath, { recursive: true })
      const remoteDir = path.join(tmpDir, 'remote.git')
      await execFileAsync('git', ['init', '--bare', '-b', 'main', remoteDir])

      const result = await runGitInitialize(
        deps,
        repoPath,
        remoteDir,
        'Taras Shchadylo',
        'taras@example.com'
      )

      expect(result).toEqual({ name: 'new-repo', remoteUrl: remoteDir })
      expect(await git(repoPath, 'config', '--local', 'user.name')).toBe('Taras Shchadylo')
      expect(await git(repoPath, 'config', '--local', 'user.email')).toBe('taras@example.com')
      const remotes = await service.getRemotes(repoPath)
      expect(remotes).toEqual([expect.objectContaining({ name: 'origin', url: remoteDir })])
    })

    it('leaves the repo initialized with identity written when remote add fails, and reports remoteError', async () => {
      const repoPath = path.join(tmpDir, 'partial-repo')
      await mkdir(repoPath, { recursive: true })
      // Pre-existing "origin" makes the orchestrator's addRemote step fail
      // (git remote add refuses a duplicate name) without needing network access.
      await service.initRepository(repoPath)
      await service.addRemote(repoPath, 'origin', 'https://example.com/pre-existing.git')

      const result = await runGitInitialize(
        deps,
        repoPath,
        'https://example.com/new.git',
        'Taras Shchadylo',
        'taras@example.com'
      )

      expect(result.name).toBe('partial-repo')
      expect(result.remoteUrl).toBeUndefined()
      expect(result.remoteError).toBeTruthy()
      await expect(stat(path.join(repoPath, '.git'))).resolves.toBeDefined()
      expect(await git(repoPath, 'config', '--local', 'user.name')).toBe('Taras Shchadylo')
    })

    it('skips the remote step entirely when no remoteUrl is given', async () => {
      const repoPath = path.join(tmpDir, 'local-only-repo')
      await mkdir(repoPath, { recursive: true })

      const result = await runGitInitialize(
        deps,
        repoPath,
        undefined,
        'Taras Shchadylo',
        'taras@example.com'
      )

      expect(result).toEqual({ name: 'local-only-repo' })
      expect(await service.getRemotes(repoPath)).toEqual([])
    })

    it('refuses (throws) when the target folder is inside an existing repo, leaving no nested .git', async () => {
      const enclosingRepo = path.join(tmpDir, 'enclosing-repo')
      const subfolder = path.join(enclosingRepo, 'sub')
      await mkdir(subfolder, { recursive: true })
      await service.initRepository(enclosingRepo)

      await expect(
        runGitInitialize(deps, subfolder, undefined, 'Taras Shchadylo', 'taras@example.com')
      ).rejects.toThrow(/already inside a Git repository/i)

      await expect(stat(path.join(subfolder, '.git'))).rejects.toBeDefined()
    })
  })

  describe('GitService.push upstream (-u)', () => {
    it('adds -u on the first push when there is no upstream, and wires tracking', async () => {
      const repoPath = path.join(tmpDir, 'push-repo')
      await mkdir(repoPath, { recursive: true })
      await service.initRepository(repoPath)
      await git(repoPath, 'config', 'user.name', 'Test User')
      await git(repoPath, 'config', 'user.email', 'test@example.com')
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      const remoteDir = path.join(tmpDir, 'remote.git')
      await execFileAsync('git', ['init', '--bare', '-b', 'main', remoteDir])
      await service.addRemote(repoPath, 'origin', remoteDir)

      await service.push(repoPath, 'origin', 'main')

      expect(await git(repoPath, 'config', '--get', 'branch.main.remote')).toBe('origin')
      expect(await git(repoPath, 'config', '--get', 'branch.main.merge')).toBe('refs/heads/main')
    })

    it('omits -u once an upstream already exists', async () => {
      const repoPath = path.join(tmpDir, 'push-repo-2')
      await mkdir(repoPath, { recursive: true })
      await service.initRepository(repoPath)
      await git(repoPath, 'config', 'user.name', 'Test User')
      await git(repoPath, 'config', 'user.email', 'test@example.com')
      await writeFile(path.join(repoPath, 'base.txt'), 'one\n')
      await git(repoPath, 'add', 'base.txt')
      await git(repoPath, 'commit', '-m', 'c1')
      const remoteDir = path.join(tmpDir, 'remote.git')
      await execFileAsync('git', ['init', '--bare', '-b', 'main', remoteDir])
      await service.addRemote(repoPath, 'origin', remoteDir)
      await service.push(repoPath, 'origin', 'main')

      await writeFile(path.join(repoPath, 'second.txt'), 'two\n')
      await git(repoPath, 'add', 'second.txt')
      await git(repoPath, 'commit', '-m', 'c2')
      await expect(service.push(repoPath, 'origin', 'main')).resolves.toBeUndefined()

      const localHead = await git(repoPath, 'rev-parse', 'HEAD')
      const remoteHead = await git(remoteDir, 'rev-parse', 'main')
      expect(remoteHead).toBe(localHead)
    })
  })
})
