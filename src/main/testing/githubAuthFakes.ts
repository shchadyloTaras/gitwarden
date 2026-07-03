// Test-only fakes for the GitHub auth flow — wired in ONLY when the env flag
// `GITWARDEN_E2E_FAKE_GITHUB=1` is set (see electron/index.ts). Production never
// constructs these. They let the Phase 25 Playwright e2e exercise the full IPC
// bridge — startDeviceAuth → poll → identity → token → linkedGitHub → authEvent —
// without a single real GitHub network call (plan §0 verifiability principle).
//
// The fake poller resolves after a short, abortable delay so the e2e can observe
// the 'awaitingUser' → 'authorized' transition and also exercise cancellation.

import type { GitHubAccount, GitHubDeviceCode } from '../../core/types.js'
import type { IGitHubAuthService, DeviceTokenResult } from '../services/GitHubAuthService.js'
import { abortableDelay } from '../services/GitHubAuthService.js'
import { GitHubAuthError } from '../services/GitHubAuthError.js'
import type { IGitHubApiService } from '../services/GitHubApiService.js'
import type { ITokenStore } from '../storage/TokenStore.js'

export const FAKE_DEVICE_CODE: GitHubDeviceCode = {
  userCode: 'WDJB-MJHT',
  verificationUri: 'https://github.com/login/device',
  expiresInSec: 900,
  intervalSec: 1,
}

export const FAKE_ACCOUNT: GitHubAccount = {
  id: 583231,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
}

export const FAKE_PRIMARY_EMAIL = 'octocat@users.noreply.github.com'
export const FAKE_ACCESS_TOKEN = 'gho_FAKEtoken000000000000000000000000'
export const FAKE_GRANTED_SCOPES = ['repo', 'read:user', 'user:email']

/**
 * A poke doesn't resolve in the same tick — it simulates the round-trip of the one real
 * bypass poll a `requestImmediatePoll()` triggers, so the renderer's "Checking…" state is
 * actually observable (e2e-relevant) instead of flashing for a single microtask.
 */
const POKE_ROUNDTRIP_MS = 400

export interface GitHubAuthFakeOptions {
  /** Overrides FAKE_DEVICE_CODE.intervalSec (seconds) for this flow. */
  intervalSec?: number
  /**
   * Whether `requestImmediatePoll()` actually resolves the wait early. Default true.
   * Set false to simulate "GitHub still says pending" — a poke finds nothing new, which is
   * what the Phase 81 e2e uses to exercise the renderer's checking→waiting fallback timeout.
   */
  pokeAuthorizes?: boolean
  /** 'expire' rejects the poll with `expiredToken` instead of waiting — for the Phase 81
   *  e2e's "expired code shows a prominent Try Again" scenario. Default 'authorize'. */
  outcome?: 'authorize' | 'expire'
}

class FakeGitHubAuthService implements IGitHubAuthService {
  /** Resolver for the current wait, armed only while `pollForToken` is waiting. */
  private wake: (() => void) | undefined
  private readonly intervalSec: number
  private readonly pokeAuthorizes: boolean
  private readonly outcome: 'authorize' | 'expire'

  constructor(options: GitHubAuthFakeOptions = {}) {
    this.intervalSec = options.intervalSec ?? FAKE_DEVICE_CODE.intervalSec
    this.pokeAuthorizes = options.pokeAuthorizes ?? true
    this.outcome = options.outcome ?? 'authorize'
  }

  async requestDeviceCode(_scopes: string[]): Promise<GitHubDeviceCode> {
    return { ...FAKE_DEVICE_CODE, intervalSec: this.intervalSec }
  }

  /**
   * Simulates the user authorizing after one interval; aborts promptly on cancel. A
   * `requestImmediatePoll()` poke resolves the wait immediately (when `pokeAuthorizes`),
   * mirroring the real service's bypass-poll behavior — this is what the Phase 81 e2e
   * exercises to prove "Checking with GitHub…" flips to Connected on return without
   * waiting out the interval.
   */
  async pollForToken(signal: AbortSignal): Promise<DeviceTokenResult> {
    if (this.outcome === 'expire') {
      throw new GitHubAuthError(
        'expiredToken',
        'The device code expired before authorization completed.'
      )
    }
    await this.waitForIntervalOrPoke(this.intervalSec * 1000, signal)
    return { accessToken: FAKE_ACCESS_TOKEN, scopes: [...FAKE_GRANTED_SCOPES] }
  }

  requestImmediatePoll(): void {
    if (!this.pokeAuthorizes) return
    this.wake?.()
  }

  private waitForIntervalOrPoke(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (run: () => void): void => {
        if (settled) return
        settled = true
        this.wake = undefined
        run()
      }
      this.wake = () => {
        abortableDelay(POKE_ROUNDTRIP_MS, signal).then(
          () => finish(resolve),
          (error: unknown) => finish(() => reject(error))
        )
      }
      abortableDelay(ms, signal).then(
        () => finish(resolve),
        (error: unknown) => finish(() => reject(error))
      )
    })
  }
}

class FakeGitHubApiService implements IGitHubApiService {
  async getAuthenticatedUser(_token: string): Promise<GitHubAccount> {
    return FAKE_ACCOUNT
  }

  async getPrimaryVerifiedEmail(_token: string): Promise<string | undefined> {
    return FAKE_PRIMARY_EMAIL
  }
}

/** In-memory token store — no Electron safeStorage dependency under e2e. */
class FakeTokenStore implements ITokenStore {
  private readonly tokens = new Map<string, string>()

  async set(profileId: string, token: string): Promise<void> {
    this.tokens.set(profileId, token)
  }

  async get(profileId: string): Promise<string | undefined> {
    return this.tokens.get(profileId)
  }

  async delete(profileId: string): Promise<void> {
    this.tokens.delete(profileId)
  }
}

export interface GitHubAuthTestServices {
  auth: IGitHubAuthService
  api: IGitHubApiService
  tokens: ITokenStore
}

export function createGitHubAuthTestServices(
  options: GitHubAuthFakeOptions = {}
): GitHubAuthTestServices {
  return {
    auth: new FakeGitHubAuthService(options),
    api: new FakeGitHubApiService(),
    tokens: new FakeTokenStore(),
  }
}
