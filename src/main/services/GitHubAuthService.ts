// GitHub OAuth Device Authorization Flow — the cancellable state machine.
//
// Logic only (docs/plans/github-oauth-plan.md §3, §4, Appendix A, §6 Phase 23):
//   1. requestDeviceCode() → POST /login/device/code, returns the user-facing code.
//   2. pollForToken()      → POST /login/oauth/access_token until a terminal state,
//                            honoring `interval`, backing off on `slow_down`, and
//                            cancelling promptly on an AbortSignal.
//
// All network I/O goes through the injected HttpClient so this is fully unit-tested
// with a fake client (no real GitHub call in CI). shell.openExternal is deliberately
// NOT here — opening the browser belongs in the IPC glue (Phase 25). The raw
// `device_code` stays in the main process and is NEVER part of the renderer payload
// (Appendix B).

import {
  GitHubAccessTokenResponseSchema,
  GitHubDeviceCodeResponseSchema,
} from '../../core/schemas.js'
import type { GitHubAuthErrorCode, GitHubDeviceCode } from '../../core/types.js'
import { GITHUB_CLIENT_ID } from '../../core/config/github.js'
import { createLogger, type Logger } from './Logger.js'
import type { HttpClient, HttpResponse } from './HttpClient.js'

export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
export const GITHUB_DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

/** RFC 8628 §3.5: on `slow_down` with no new interval, raise it by 5 seconds. */
const SLOW_DOWN_INCREMENT_SEC = 5

const JSON_HEADERS: Record<string, string> = { Accept: 'application/json' }

/** Raw access token plus the scopes GitHub actually granted. */
export interface DeviceTokenResult {
  accessToken: string
  scopes: string[]
}

export interface IGitHubAuthService {
  requestDeviceCode(scopes: string[]): Promise<GitHubDeviceCode>
  pollForToken(signal: AbortSignal): Promise<DeviceTokenResult>
}

/** Typed terminal error from the device flow; `code` mirrors GitHubAuthErrorCode. */
export class GitHubAuthError extends Error {
  constructor(
    readonly code: GitHubAuthErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'GitHubAuthError'
  }
}

/** Injectable wait seam — defaults to a real timer; honors the AbortSignal. */
export type Sleeper = (ms: number, signal: AbortSignal) => Promise<void>

/** Resolves after `ms`, or rejects promptly with an AbortError if `signal` fires. */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(toAbortError(signal))
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(toAbortError(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

interface PendingDeviceFlow {
  deviceCode: string
  intervalSec: number
}

export class GitHubAuthService implements IGitHubAuthService {
  /** The in-flight device code; held in main, never exposed to the renderer. */
  private pending: PendingDeviceFlow | undefined

  constructor(
    private readonly http: HttpClient,
    private readonly clientId: string = GITHUB_CLIENT_ID,
    private readonly sleep: Sleeper = abortableDelay,
    private readonly logger: Logger = createLogger('GitHubAuthService')
  ) {}

  async requestDeviceCode(scopes: string[]): Promise<GitHubDeviceCode> {
    const res = await this.http.postForm(
      GITHUB_DEVICE_CODE_URL,
      { client_id: this.clientId, scope: scopes.join(' ') },
      JSON_HEADERS
    )
    if (!isOk(res)) {
      throw new GitHubAuthError('network', `Device code request failed with HTTP ${res.status}.`)
    }

    const parsed = this.parse(GitHubDeviceCodeResponseSchema, res.json, 'device code response')
    // device_code is retained in main for polling; only the user-facing fields cross to the renderer.
    this.pending = { deviceCode: parsed.device_code, intervalSec: parsed.interval }
    this.logger.info('Requested GitHub device code', {
      userCode: parsed.user_code,
      verificationUri: parsed.verification_uri,
    })

    return {
      userCode: parsed.user_code,
      verificationUri: parsed.verification_uri,
      expiresInSec: parsed.expires_in,
      intervalSec: parsed.interval,
    }
  }

  async pollForToken(signal: AbortSignal): Promise<DeviceTokenResult> {
    const pending = this.pending
    if (!pending) {
      throw new GitHubAuthError('unknown', 'pollForToken called before requestDeviceCode.')
    }
    let intervalSec = pending.intervalSec

    for (;;) {
      this.throwIfAborted(signal)

      let res: HttpResponse
      try {
        res = await this.http.postForm(
          GITHUB_ACCESS_TOKEN_URL,
          {
            client_id: this.clientId,
            device_code: pending.deviceCode,
            grant_type: GITHUB_DEVICE_GRANT_TYPE,
          },
          JSON_HEADERS
        )
      } catch (error) {
        // A transient connection failure is surfaced as a terminal `network` error;
        // the caller can restart the flow. The device_code is left intact for retry.
        throw new GitHubAuthError('network', `Token poll request failed: ${errorMessage(error)}`)
      }

      const parsed = this.parse(GitHubAccessTokenResponseSchema, res.json, 'token response')

      if ('access_token' in parsed) {
        this.pending = undefined
        this.logger.info('GitHub authorization succeeded')
        return { accessToken: parsed.access_token, scopes: parseScopes(parsed.scope) }
      }

      switch (parsed.error) {
        case 'authorization_pending':
          break // keep polling at the current interval
        case 'slow_down':
          // GitHub returns the new minimum interval; fall back to +5s per RFC 8628.
          intervalSec = parsed.interval ?? intervalSec + SLOW_DOWN_INCREMENT_SEC
          this.logger.debug('GitHub asked to slow down', { intervalSec })
          break
        case 'access_denied':
          this.pending = undefined
          throw new GitHubAuthError('accessDenied', 'The user denied the authorization request.')
        case 'expired_token':
          this.pending = undefined
          throw new GitHubAuthError(
            'expiredToken',
            'The device code expired before the user authorized.'
          )
        default:
          this.pending = undefined
          throw new GitHubAuthError('unknown', `Unexpected authorization error: ${parsed.error}`)
      }

      await this.sleep(intervalSec * 1000, signal)
    }
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw toAbortError(signal)
  }

  private parse<T>(schema: { parse(input: unknown): T }, json: unknown, label: string): T {
    try {
      return schema.parse(json)
    } catch (error) {
      throw new GitHubAuthError('unknown', `Malformed GitHub ${label}: ${errorMessage(error)}`)
    }
  }
}

function isOk(res: HttpResponse): boolean {
  return res.status >= 200 && res.status < 300
}

function parseScopes(scope: string): string[] {
  // GitHub returns space- or comma-separated scopes.
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Normalizes an aborted signal into an Error whose `name` is stably 'AbortError'. */
function toAbortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  const error = new Error(
    typeof reason === 'string' && reason ? reason : 'The GitHub authorization poll was aborted.'
  )
  error.name = 'AbortError'
  return error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
