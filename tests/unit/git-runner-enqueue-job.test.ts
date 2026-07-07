import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'

const execFileAsync = promisify(execFile)

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Phase 91: GitRunner.enqueueJob is the compound-job primitive every verified-target
// write is built on. These tests exercise it directly (no GitService/executor layer)
// because the property that matters — the queue slot is held for the WHOLE job, and a
// write issued from inside the job never re-enters enqueue() and deadlocks — is a
// GitRunner-level guarantee that a higher-level test could only observe indirectly.
describe('GitRunner.enqueueJob (Phase 91)', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let runner: GitRunner

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-enqueue-job-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    runner = new GitRunner(gitPath)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('a write issued via runWrite from inside the job resolves — does not deadlock', async () => {
    // This is the property the whole compound-job design hinges on: runWrite executes
    // directly (bypassing run()'s own enqueue dispatch), so it cannot re-enter the
    // queue slot this very job already holds. If it did, this call would hang forever.
    const result = await Promise.race([
      runner.enqueueJob(repoPath, async (runWrite) => {
        await runWrite({ args: ['commit', '--allow-empty', '-m', 'inside job'] })
        return 'done'
      }),
      sleep(5000).then(() => 'timed out'),
    ])
    expect(result).toBe('done')
    expect(await git(repoPath, 'log', '--oneline')).toContain('inside job')
  })

  it('reads inside the job (readOnly: true via run()) are unaffected — they never enqueue', async () => {
    await git(repoPath, 'commit', '--allow-empty', '-m', 'seed')

    const branch = await runner.enqueueJob(repoPath, async () => {
      const res = await runner.run({
        args: ['symbolic-ref', '--short', 'HEAD'],
        cwd: repoPath,
        readOnly: true,
      })
      return res.stdout.toString('utf8').trim()
    })
    expect(branch).toBe('main')
  })

  it('holds the queue slot for the WHOLE job — a separately-enqueued write waits its turn', async () => {
    const order: string[] = []
    const jobA = runner.enqueueJob(repoPath, async (runWrite) => {
      order.push('A start')
      await sleep(50) // simulate the read→decide portion of a real compound job
      await runWrite({ args: ['commit', '--allow-empty', '-m', 'A'] })
      order.push('A done')
    })
    // Issued while job A is still in its simulated read→decide phase.
    const jobB = runner
      .run({ args: ['commit', '--allow-empty', '-m', 'B'], cwd: repoPath, readOnly: false })
      .then(() => order.push('B done'))

    await Promise.all([jobA, jobB])

    // B's write must not land until A's job (which holds the slot) has finished.
    expect(order).toEqual(['A start', 'A done', 'B done'])
    const log = await git(repoPath, 'log', '--format=%s')
    expect(log.split('\n')).toEqual(['B', 'A']) // most-recent-first
  })

  it('a rejected job does not wedge the queue for the next job on the same cwd', async () => {
    await expect(
      runner.enqueueJob(repoPath, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    // The queue must still be usable afterward.
    const result = await runner.enqueueJob(repoPath, async (runWrite) => {
      await runWrite({ args: ['commit', '--allow-empty', '-m', 'after failure'] })
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(await git(repoPath, 'log', '--oneline')).toContain('after failure')
  })

  it('two enqueueJob calls for the same cwd run their writes strictly in order', async () => {
    const messages: string[] = []
    await Promise.all([
      runner.enqueueJob(repoPath, async (runWrite) => {
        await sleep(30)
        await runWrite({ args: ['commit', '--allow-empty', '-m', 'first'] })
        messages.push('first')
      }),
      runner.enqueueJob(repoPath, async (runWrite) => {
        await runWrite({ args: ['commit', '--allow-empty', '-m', 'second'] })
        messages.push('second')
      }),
    ])
    // Whichever enqueueJob call happened first in source order holds the slot first,
    // matching the existing FIFO enqueue() contract this wraps.
    expect(messages).toEqual(['first', 'second'])
  })

  it('enqueueJob for DIFFERENT cwds runs concurrently, not serialized against each other', async () => {
    const repoPathB = path.join(tmpDir, 'repo-b')
    await execFileAsync('git', ['init', '-b', 'main', repoPathB])
    await git(repoPathB, 'config', 'user.name', 'Test User')
    await git(repoPathB, 'config', 'user.email', 'test@example.com')

    const order: string[] = []
    await Promise.all([
      runner.enqueueJob(repoPath, async (runWrite) => {
        await sleep(50)
        await runWrite({ args: ['commit', '--allow-empty', '-m', 'repo-a'] })
        order.push('a')
      }),
      runner.enqueueJob(repoPathB, async (runWrite) => {
        await runWrite({ args: ['commit', '--allow-empty', '-m', 'repo-b'] })
        order.push('b')
      }),
    ])
    // repo-b's job has no reason to wait on repo-a's slower job — different cwd, own queue.
    expect(order).toEqual(['b', 'a'])
  })
})
