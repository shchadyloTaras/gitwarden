import { spawn } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import { ErrorMapper } from './ErrorMapper'

export interface GitInvocation {
  args: string[]
  cwd: string
  readOnly: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

export interface GitResult {
  stdout: Buffer
  stderr: string
  code: number
}

const noop = () => {}

export class GitRunner {
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(private readonly gitPath: string) {}

  run(inv: GitInvocation): Promise<GitResult> {
    if (inv.signal?.aborted) {
      return Promise.reject(new Error('Git operation was cancelled before it started.'))
    }

    const execute = () => this.execute(inv)
    return inv.readOnly ? execute() : this.enqueue(inv.cwd, execute)
  }

  private execute(inv: GitInvocation): Promise<GitResult> {
    return new Promise<GitResult>((resolve, reject) => {
      const child = spawn(this.gitPath, inv.args, {
        cwd: inv.cwd,
        env: this.buildEnv(inv.readOnly),
        shell: false,
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: string[] = []
      let aborted = false
      let settled = false

      const doAbort = () => {
        if (settled) return
        aborted = true
        child.kill('SIGTERM')
      }

      if (inv.signal) {
        inv.signal.addEventListener('abort', doAbort, { once: true })
      }

      let timer: ReturnType<typeof setTimeout> | undefined
      if (inv.timeoutMs != null) {
        timer = setTimeout(() => {
          aborted = true
          child.kill('SIGTERM')
        }, inv.timeoutMs)
      }

      const cleanup = () => {
        if (timer != null) clearTimeout(timer)
        inv.signal?.removeEventListener('abort', doAbort)
      }

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString()))

      child.on('error', (err) => {
        if (settled) return
        settled = true
        cleanup()
        reject(err)
      })

      child.on('close', (code) => {
        if (settled) return
        settled = true
        cleanup()

        if (aborted) {
          reject(new Error('Git operation was cancelled.'))
          return
        }

        const stdout = Buffer.concat(stdoutChunks)
        const stderr = stderrChunks.join('')
        const exitCode = code ?? 1

        if (exitCode !== 0) {
          reject(ErrorMapper.map(stderr, exitCode))
          return
        }

        resolve({ stdout, stderr, code: exitCode })
      })
    })
  }

  private enqueue<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
    const tail = this.queues.get(cwd) ?? Promise.resolve()
    // Always proceed to fn regardless of whether tail succeeded or failed.
    const next = tail.then(fn, fn)
    // Store a silenced tail so queue errors don't leak into future ops.
    this.queues.set(cwd, next.then(noop, noop))
    return next
  }

  private buildEnv(readOnly: boolean): NodeJS.ProcessEnv {
    const gitDir = path.dirname(this.gitPath)
    const systemPath = process.env.PATH ?? ''
    const pathParts = systemPath.split(path.delimiter)
    const pathValue = pathParts.includes(gitDir)
      ? systemPath
      : [gitDir, ...pathParts].join(path.delimiter)

    const env: NodeJS.ProcessEnv = {
      [process.platform === 'win32' ? 'USERPROFILE' : 'HOME']: os.homedir(),
      PATH: pathValue,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C',
    }

    if (process.env.SSH_AUTH_SOCK) {
      env.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK
    }

    if (readOnly) {
      env.GIT_OPTIONAL_LOCKS = '0'
    }

    return env
  }
}
