import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import * as path from 'path'
import {
  parseGitLog,
  filterAppCommits,
  FIELD_SEP,
  RECORD_SEP,
} from '../../src/core/changelog/commits'

const execFileAsync = promisify(execFile)

describe('release-changelog git integration', () => {
  let tmpDir: string
  let repo: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gitwarden-cl-'))
    repo = path.join(tmpDir, 'repo')
    await execFileAsync('git', ['init', repo])
    await execFileAsync('git', ['-C', repo, 'config', 'user.name', 'Test User'])
    await execFileAsync('git', ['-C', repo, 'config', 'user.email', 'test@example.com'])
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  async function commit(file: string, message: string): Promise<void> {
    const full = path.join(repo, file)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, 'x')
    await execFileAsync('git', ['-C', repo, 'add', '-A'])
    await execFileAsync('git', ['-C', repo, 'commit', '-m', message])
  }

  it('parses real git log output and filters landing-only commits', async () => {
    await commit('src/app.ts', 'feat: app feature')
    await commit('landing/page.astro', 'feat(landing): landing-only change')

    const { stdout } = await execFileAsync('git', [
      '-C',
      repo,
      'log',
      `--format=${RECORD_SEP}%H${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}`,
      '--name-only',
    ])

    const all = parseGitLog(stdout)
    expect(all).toHaveLength(2)

    const app = filterAppCommits(all)
    expect(app).toHaveLength(1)
    expect(app[0].subject).toBe('feat: app feature')
  })
})
