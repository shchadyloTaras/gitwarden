import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import { removeTempDir } from '../fixtures/tempDir'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

// Phase 93: GitService.stashSwitchPop — stash push --include-untracked → switch →
// stash pop, as one compound job. A pop conflict is never auto-resolved (ok:false,
// stash kept); a switch failure restores the stash before rethrowing; and if that
// restore itself ever fails, the thrown message says so explicitly instead of
// silently leaving the user's edits stranded in the stash with no indication.
describe('GitService.stashSwitchPop (Phase 93)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-gs-stash-switch-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    service = new GitService(new GitRunner(gitPath))

    await writeFile(path.join(repoPath, 'shared.txt'), 'line1\nline2\nline3\n')
    await git(repoPath, 'add', 'shared.txt')
    await git(repoPath, 'commit', '-m', 'init')

    await git(repoPath, 'checkout', '-b', 'feature-a')
    await writeFile(path.join(repoPath, 'shared.txt'), 'FEATURE-line1\nline2\nline3\n')
    await git(repoPath, 'add', 'shared.txt')
    await git(repoPath, 'commit', '-m', 'feature change line1')
    await git(repoPath, 'checkout', 'main')
  })

  afterEach(async () => {
    await removeTempDir(tmpDir)
  })

  it('a clean tree just switches — no stash created', async () => {
    const result = await service.stashSwitchPop(repoPath, 'feature-a')
    expect(result).toEqual({ ok: true })
    expect(await git(repoPath, 'branch', '--show-current')).toBe('feature-a')
    expect(await git(repoPath, 'stash', 'list')).toBe('')
  })

  it('a non-overlapping dirty edit auto-merges cleanly and is preserved after the switch', async () => {
    await writeFile(path.join(repoPath, 'shared.txt'), 'line1\nline2\nline3-EDITED\n')

    const result = await service.stashSwitchPop(repoPath, 'feature-a')

    expect(result).toEqual({ ok: true })
    expect(await git(repoPath, 'branch', '--show-current')).toBe('feature-a')
    expect(await git(repoPath, 'stash', 'list')).toBe('')
    const content = await readFile(path.join(repoPath, 'shared.txt'), 'utf8')
    expect(content).toContain('FEATURE-line1')
    expect(content).toContain('line3-EDITED')
  })

  it('an overlapping dirty edit never auto-resolves — pop conflict keeps the stash and returns ok:false', async () => {
    // Edits the SAME line feature-a's own commit changed — pop cannot 3-way merge it.
    await writeFile(path.join(repoPath, 'shared.txt'), 'MAIN-EDITED-line1\nline2\nline3\n')

    const result = await service.stashSwitchPop(repoPath, 'feature-a')

    expect(result.ok).toBe(false)
    // The switch itself succeeded even though the pop conflicted.
    expect(await git(repoPath, 'branch', '--show-current')).toBe('feature-a')
    // The stash is deliberately kept, not dropped, on a pop conflict.
    expect(await git(repoPath, 'stash', 'list')).toContain('stash@{0}')
  })

  it('a failed switch restores the stash before rethrowing — nothing is lost, no stash left behind', async () => {
    await writeFile(path.join(repoPath, 'shared.txt'), 'line1\nline2\nline3-EDITED\n')

    await expect(service.stashSwitchPop(repoPath, 'no-such-branch')).rejects.toThrow()

    // Still on main; the edit is back in the working tree, not stranded in the stash.
    expect(await git(repoPath, 'branch', '--show-current')).toBe('main')
    expect(await git(repoPath, 'stash', 'list')).toBe('')
    const content = await readFile(path.join(repoPath, 'shared.txt'), 'utf8')
    // Normalize: restoring the stash goes through git's own write path, which is free
    // to smudge line endings per core.autocrlf (e.g. forced true on Windows — see
    // GitRunner.buildArgs) — a platform-correct difference, not a content mismatch.
    expect(content.replace(/\r\n/g, '\n')).toBe('line1\nline2\nline3-EDITED\n')
  })

  it('if the restore pop itself fails, the error says the changes are safe in the stash (not silently swallowed)', async () => {
    await writeFile(path.join(repoPath, 'shared.txt'), 'line1\nline2\nline3-EDITED\n')

    const runner = new GitRunner(gitPath)
    let stashPushSeen = false
    // Shadow the private `execute` the compound job's `exec`/`runWrite` calls
    // directly (bypassing `run`'s own queue — see GitRunner.enqueueJob). Let the
    // real `stash push` and the real (failing) `switch` through; force ONLY the
    // restore's `stash pop` to fail, simulating the rare case this fix targets.
    const runnerWithPrivateAccess = runner as unknown as {
      execute: (inv: { args: string[] }) => Promise<{ stdout: Buffer; stderr: Buffer }>
    }
    const originalExecute = runnerWithPrivateAccess.execute.bind(runner)
    runnerWithPrivateAccess.execute = (inv) => {
      if (inv.args[0] === 'stash' && inv.args[1] === 'push') stashPushSeen = true
      if (stashPushSeen && inv.args[0] === 'stash' && inv.args[1] === 'pop') {
        return Promise.reject(new Error('simulated stash pop failure'))
      }
      return originalExecute(inv)
    }
    const svc = new GitService(runner)

    await expect(svc.stashSwitchPop(repoPath, 'no-such-branch')).rejects.toThrow(
      /safe in the stash/i
    )

    // The (simulated) restore never actually ran against git — the real stash is
    // still there, exactly as the message promises.
    expect(await git(repoPath, 'stash', 'list')).toContain('stash@{0}')
  })
})
