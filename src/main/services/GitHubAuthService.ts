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
import type { GitHubDeviceCode } from '../../core/types.js'
import { GITHUB_CLIENT_ID } from '../../core/config/github.js'
import { GitHubAuthError } from './GitHubAuthError.js'
import { createLogger, type Logger } from './Logger.js'
import type { HttpClient, HttpResponse } from './HttpClient.js'

// Re-exported so existing importers (and the Phase 23 test) keep their import path.
export { GitHubAuthError } from './GitHubAuthError.js'

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

/** Injectable wait seam — defaults to a real timer; honors the AbortSignal. */
export type Sleeper = (ms: number, signal: AbortSignal) => Promise<void>

/** Injectable monotonic-ish clock (ms) for the device-code expiry deadline. */
export type Clock = () => number

/** Outcome of interpreting one poll of the access-token endpoint. */
type PollOutcome =
  | { kind: 'token'; result: DeviceTokenResult }
  | { kind: 'pending' }
  | { kind: 'slowDown'; intervalSec: number | undefined }
  /** A transient hiccup (network blip, non-2xx, unparseable body) — keep polling. */
  | { kind: 'transient' }

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
  expiresInSec: number
}

export class GitHubAuthService implements IGitHubAuthService {
  /** The in-flight device code; held in main, never exposed to the renderer. */
  private pending: PendingDeviceFlow | undefined

  constructor(
    private readonly http: HttpClient,
    private readonly clientId: string = GITHUB_CLIENT_ID,
    private readonly sleep: Sleeper = abortableDelay,
    private readonly logger: Logger = createLogger('GitHubAuthService'),
    private readonly now: Clock = () => Date.now()
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
    this.pending = {
      deviceCode: parsed.device_code,
      intervalSec: parsed.interval,
      expiresInSec: parsed.expires_in,
    }
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
    // The device code is only valid for `expires_in`. Bound the loop by that deadline so
    // a sustained outage — where GitHub never gets a chance to return `expired_token` —
    // can't poll forever.
    const deadline = this.now() + pending.expiresInSec * 1000

    for (;;) {
      this.throwIfAborted(signal)

      const outcome = await this.pollOnce(pending.deviceCode)

      if (outcome.kind === 'token') {
        this.pending = undefined
        this.logger.info('GitHub authorization succeeded')
        return outcome.result
      }
      if (outcome.kind === 'slowDown') {
        // GitHub returns the new minimum interval; fall back to +5s per RFC 8628.
        intervalSec = outcome.intervalSec ?? intervalSec + SLOW_DOWN_INCREMENT_SEC
        this.logger.debug('GitHub asked to slow down', { intervalSec })
      }
      // 'pending', 'slowDown', and 'transient' all just keep polling — a transient hiccup
      // (network blip, non-2xx, unparseable body) must NOT abandon the flow and force the
      // user to restart sign-in.

      if (this.now() >= deadline) {
        this.pending = undefined
        throw new GitHubAuthError(
          'expiredToken',
          'The device code expired before authorization completed.'
        )
      }

      await this.sleep(intervalSec * 1000, signal)
    }
  }

  /**
   * Poll the access-token endpoint once and classify the result. Genuine terminal
   * states (`access_denied`, `expired_token`, an unrecognized error) throw a typed
   * GitHubAuthError; everything transient is reported so the caller keeps polling.
   */
  private async pollOnce(deviceCode: string): Promise<PollOutcome> {
    let res: HttpResponse
    try {
      res = await this.http.postForm(
        GITHUB_ACCESS_TOKEN_URL,
        {
          client_id: this.clientId,
          device_code: deviceCode,
          grant_type: GITHUB_DEVICE_GRANT_TYPE,
        },
        JSON_HEADERS
      )
    } catch (error) {
      this.logger.debug('Token poll request failed; will retry', { error: errorMessage(error) })
      return { kind: 'transient' }
    }

    // GitHub answers the poll with HTTP 200 even for pending/slow_down. A non-2xx
    // (rate limit, 5xx) or an unparseable body is a transient hiccup, not a reason to
    // abandon the flow.
    if (!isOk(res)) {
      this.logger.debug('Token poll returned a non-2xx status; will retry', { status: res.status })
      return { kind: 'transient' }
    }
    const parsed = GitHubAccessTokenResponseSchema.safeParse(res.json)
    if (!parsed.success) {
      this.logger.debug('Token poll returned an unparseable body; will retry')
      return { kind: 'transient' }
    }
    const data = parsed.data

    if ('access_token' in data) {
      return {
        kind: 'token',
        result: { accessToken: data.access_token, scopes: parseScopes(data.scope) },
      }
    }

    switch (data.error) {
      case 'authorization_pending':
        return { kind: 'pending' }
      case 'slow_down':
        return { kind: 'slowDown', intervalSec: data.interval }
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
        throw new GitHubAuthError('unknown', `Unexpected authorization error: ${data.error}`)
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
