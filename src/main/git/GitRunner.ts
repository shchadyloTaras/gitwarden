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
  /**
   * Extra environment for this single invocation only (e.g. the GIT_ASKPASS helper +
   * credentials for an HTTPS-token push). Merged over the controlled base env; never
   * persisted and never placed in argv.
   */
  extraEnv?: Record<string, string>
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
      const child = spawn(this.gitPath, this.buildArgs(inv.args), {
        cwd: inv.cwd,
        env: { ...this.buildEnv(inv.readOnly), ...inv.extraEnv },
        shell: false,
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: string[] = []
      let aborted = false
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined

      const cleanup = () => {
        if (timer != null) clearTimeout(timer)
        inv.signal?.removeEventListener('abort', settleCancelled)
      }

      // Cancellation (AbortSignal or timeout) settles the promise promptly instead of waiting
      // for 'close'. A SIGTERM'd child can leave an orphaned grandchild (e.g. a shell's `sleep`)
      // that inherited and still holds the stdout pipe open; that delays the 'close' event —
      // indefinitely on some platforms — so waiting for it would make cancellation hang. We
      // reject on the abort itself and destroy our ends of the pipes to release those handles.
      const settleCancelled = () => {
        if (settled) return
        settled = true
        aborted = true
        child.kill('SIGTERM')
        child.stdout?.destroy()
        child.stderr?.destroy()
        cleanup()
        reject(new Error('Git operation was cancelled.'))
      }

      if (inv.signal) {
        inv.signal.addEventListener('abort', settleCancelled, { once: true })
      }

      if (inv.timeoutMs != null) {
        timer = setTimeout(settleCancelled, inv.timeoutMs)
      }

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk.toString()))

      child.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return
        settled = true
        cleanup()
        // Raw Node spawn errors (e.g. "spawn /usr/bin/git ENOENT") are not user-facing —
        // map to the same typed GitError every other git failure produces.
        reject(ErrorMapper.mapSpawnFailure(err, this.gitPath))
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
          // Surface the RAW git failure so every error is diagnosable in the logs,
          // not just the ones that fall through to `unknown`. Secret-safe: the token
          // lives only in GIT_ASKPASS env (never argv), and the askpass path keeps it
          // out of the remote URL, so neither the args nor stderr can leak it.
          console.error(
            `[GitRunner] git ${inv.args.join(' ')} failed (exit ${exitCode}):\n${stderr.trim()}`
          )
          // Some failures (e.g. a real `git merge` conflict's "CONFLICT (…)") are
          // written to stdout, not stderr — classify against both streams so they
          // aren't misclassified as `unknown`. Still secret-safe: same guarantee as
          // above applies to stdout.
          const stdoutText = stdout.toString('utf8')
          reject(ErrorMapper.map([stderr, stdoutText].filter(Boolean).join('\n'), exitCode))
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

  /**
   * Public compound-job API (Phase 91): holds this cwd's queue slot for the entire
   * duration of `fn`, so a read → decide → write sequence executes atomically against
   * every other write for the same repo — the TOCTOU gap a separate readOnly-read then
   * a separately-enqueued write otherwise leaves open.
   *
   * `fn` receives `runWrite`, which executes a write invocation by calling `execute()`
   * DIRECTLY — never `run()`/`enqueue()` again. This is deliberate, not an oversight:
   * `fn` is already running as the queue's current job, so a write issued through the
   * normal `run({readOnly:false})` path would call `enqueue()` a second time for the
   * SAME cwd, chaining onto a tail that can only advance once this very job (which is
   * awaiting that write) finishes — a guaranteed self-deadlock. Reads inside `fn` are
   * unaffected: `readOnly: true` invocations never enqueue in the first place, so they
   * can keep going through the normal `run()` path unchanged.
   */
  enqueueJob<T>(
    cwd: string,
    fn: (
      runWrite: (inv: Omit<GitInvocation, 'cwd' | 'readOnly'>) => Promise<GitResult>
    ) => Promise<T>
  ): Promise<T> {
    const runWrite = (inv: Omit<GitInvocation, 'cwd' | 'readOnly'>): Promise<GitResult> =>
      this.execute({ ...inv, cwd, readOnly: false })
    return this.enqueue(cwd, () => fn(runWrite))
  }

  /**
   * `GIT_CONFIG_NOSYSTEM=1` (SECURITY.md #3) ignores the system-level gitconfig on every
   * invocation — but on Windows, a stock Git for Windows install puts `core.autocrlf=true`
   * in that SAME system file, so ignoring it silently flips autocrlf off from GitRunner's
   * point of view while the user's own terminal (and anything else that reads system
   * config) still has it on. A working tree checked out by one view and read by the other
   * disagrees on which files are "clean" — confirmed to genuinely stash-and-conflict a
   * truly-untouched file in `stashSwitchPop` on Windows CI. Restore just this one value,
   * explicitly, via `-c` (the highest-precedence, per-invocation override) rather than
   * re-enabling the untrusted system file wholesale.
   */
  private buildArgs(args: string[]): string[] {
    return process.platform === 'win32' ? ['-c', 'core.autocrlf=true', ...args] : args
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

    if (process.env.GIT_CONFIG_GLOBAL !== undefined) {
      env.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_GLOBAL
    }

    if (readOnly) {
      env.GIT_OPTIONAL_LOCKS = '0'
    }

    return env
  }
}
