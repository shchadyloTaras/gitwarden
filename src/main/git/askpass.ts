// GIT_ASKPASS credential seam for HTTPS-token push (Phase 27).
//
// git, when it needs HTTPS credentials, runs the program named by GIT_ASKPASS once per
// prompt and reads the answer from stdout. We point it at a tiny helper that echoes the
// username/token from per-invocation environment variables. This is the ONLY path the
// token reaches git: it never appears in argv, in the remote URL on disk, or in
// .git/config (docs/plans/github-oauth-plan.md Appendix B/C, §6 Phase 27).
//
// The helper script itself contains NO secret — only the env-var reads. The token lives
// solely in the GitRunner-supplied process env for the single push invocation.

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const ASKPASS_USERNAME_ENV = 'GITWARDEN_ASKPASS_USERNAME'
export const ASKPASS_PASSWORD_ENV = 'GITWARDEN_ASKPASS_PASSWORD'

const isWindows = process.platform === 'win32'

// POSIX helper: git passes the prompt (e.g. "Username for 'https://github.com':") as $1.
const POSIX_HELPER = `#!/bin/sh
# GitWarden GIT_ASKPASS helper — echoes credentials from the environment only.
case "$1" in
  *[Uu]sername*) printf '%s' "$${ASKPASS_USERNAME_ENV}" ;;
  *) printf '%s' "$${ASKPASS_PASSWORD_ENV}" ;;
esac
`

// Windows helper: same logic via cmd.exe.
const WINDOWS_HELPER = `@echo off\r
echo %~1 | findstr /I "username" >nul\r
if %errorlevel%==0 (\r
  <nul set /p=%${ASKPASS_USERNAME_ENV}%\r
) else (\r
  <nul set /p=%${ASKPASS_PASSWORD_ENV}%\r
)\r
`

let cachedHelperPath: string | undefined

/**
 * Writes the askpass helper to a stable per-user location (once) and returns its path.
 * The file is executable and secret-free; callers supply the actual token via the env
 * built by {@link buildAskpassEnv}.
 */
export function ensureAskpassHelper(baseDir: string = os.tmpdir()): string {
  if (cachedHelperPath) return cachedHelperPath

  const dir = path.join(baseDir, 'gitwarden')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, isWindows ? 'askpass.cmd' : 'askpass.sh')
  writeFileSync(file, isWindows ? WINDOWS_HELPER : POSIX_HELPER, { mode: 0o700 })
  if (!isWindows) chmodSync(file, 0o700)

  cachedHelperPath = file
  return file
}

/** Per-invocation env that points git at the helper and supplies the credentials. */
export function buildAskpassEnv(
  askpassPath: string,
  username: string,
  token: string
): Record<string, string> {
  return {
    GIT_ASKPASS: askpassPath,
    [ASKPASS_USERNAME_ENV]: username,
    [ASKPASS_PASSWORD_ENV]: token,
    // Belt-and-braces: never fall back to an interactive terminal prompt.
    GIT_TERMINAL_PROMPT: '0',
  }
}

/** Test seam — drop the memoized path so a fresh baseDir is honored. */
export function resetAskpassHelperCache(): void {
  cachedHelperPath = undefined
}
