import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import { GitLocator } from '../../src/main/git/GitLocator'
import { GitRunner } from '../../src/main/git/GitRunner'
import type { GitInvocation } from '../../src/main/git/GitRunner'
import { GitService } from '../../src/main/services/GitService'
import {
  ASKPASS_PASSWORD_ENV,
  ASKPASS_USERNAME_ENV,
  buildAskpassEnv,
  ensureAskpassHelper,
  resetAskpassHelperCache,
} from '../../src/main/git/askpass'

const execFileAsync = promisify(execFile)
const TOKEN = 'gho_INTEGRATIONsecretTOKEN0000000000'
const USERNAME = 'octocat'

// A non-routable HTTPS remote so the push fails fast OFFLINE (no external network),
// while still exercising the HTTPS + GIT_ASKPASS code path.
const HTTPS_REMOTE = 'https://localhost:1/octocat/repo.git'

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args])
  return stdout.trim()
}

describe('GIT_ASKPASS helper', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-askpass-'))
    resetAskpassHelperCache()
  })

  afterEach(async () => {
    resetAskpassHelperCache()
    await rm(tmpDir, { recursive: true, force: true })
  })

  // The Windows .cmd helper is exercised only on Windows; CI runs Unix.
  it.skipIf(process.platform === 'win32')(
    'echoes the password for a Password prompt and the username for a Username prompt',
    async () => {
      const helper = ensureAskpassHelper(tmpDir)
      const env = {
        ...process.env,
        [ASKPASS_USERNAME_ENV]: USERNAME,
        [ASKPASS_PASSWORD_ENV]: TOKEN,
      }

      const pw = await execFileAsync(helper, ["Password for 'https://github.com':"], { env })
      expect(pw.stdout).toBe(TOKEN)

      const user = await execFileAsync(helper, ["Username for 'https://github.com':"], { env })
      expect(user.stdout).toBe(USERNAME)
    }
  )

  it('buildAskpassEnv carries the token in env only, under the documented keys', () => {
    const env = buildAskpassEnv('/tmp/askpass.sh', USERNAME, TOKEN)
    expect(env.GIT_ASKPASS).toBe('/tmp/askpass.sh')
    expect(env[ASKPASS_USERNAME_ENV]).toBe(USERNAME)
    expect(env[ASKPASS_PASSWORD_ENV]).toBe(TOKEN)
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
  })
})

describe('GitService.push token wiring — no token leaks', () => {
  let gitPath: string
  let tmpDir: string
  let repoPath: string
  let calls: GitInvocation[]
  let service: GitService

  beforeAll(async () => {
    gitPath = await GitLocator.locate()
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-push-'))
    repoPath = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', '-b', 'main', repoPath])
    await git(repoPath, 'config', 'user.name', 'Test User')
    await git(repoPath, 'config', 'user.email', 'test@example.com')
    await git(repoPath, 'remote', 'add', 'origin', HTTPS_REMOTE)
    await execFileAsync('git', ['-C', repoPath, 'commit', '--allow-empty', '-m', 'init'])

    const runner = new GitRunner(gitPath)
    calls = []
    const origRun = runner.run.bind(runner)
    runner.run = (inv: GitInvocation) => {
      calls.push(inv)
      return origRun(inv)
    }
    service = new GitService(runner)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('passes the token via extraEnv (never argv); URL and .git/config stay clean', async () => {
    // The push to a non-routable host fails — we only assert the wiring + cleanliness.
    await expect(
      service.push(repoPath, 'origin', 'main', { username: USERNAME, token: TOKEN })
    ).rejects.toBeTruthy()

    const pushCall = calls.find((c) => c.args[0] === 'push')
    expect(pushCall).toBeTruthy()

    // 1) The token is NOT in argv.
    expect(pushCall!.args).toEqual(['push', 'origin', 'main'])
    expect(JSON.stringify(pushCall!.args)).not.toContain(TOKEN)

    // 2) The token IS carried in the per-invocation env (the only allowed channel).
    expect(pushCall!.extraEnv?.[ASKPASS_PASSWORD_ENV]).toBe(TOKEN)
    expect(pushCall!.extraEnv?.GIT_ASKPASS).toBeTruthy()

    // 3) The token is NOT in the stored remote URL.
    const url = await git(repoPath, 'config', '--get', 'remote.origin.url')
    expect(url).toBe(HTTPS_REMOTE)
    expect(url).not.toContain(TOKEN)

    // 4) The token is NOT anywhere in .git/config.
    const config = await readFile(path.join(repoPath, '.git', 'config'), 'utf8')
    expect(config).not.toContain(TOKEN)
  })

  it('an SSH/no-auth push carries no credential env at all', async () => {
    // No auth → no GIT_ASKPASS, no token env. (Fails on the unreachable URL; that's fine.)
    await expect(service.push(repoPath, 'origin', 'main')).rejects.toBeTruthy()
    const pushCall = calls.find((c) => c.args[0] === 'push')
    expect(pushCall?.extraEnv).toBeUndefined()
  })
})
