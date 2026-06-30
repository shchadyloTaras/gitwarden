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

class FakeGitHubAuthService implements IGitHubAuthService {
  async requestDeviceCode(_scopes: string[]): Promise<GitHubDeviceCode> {
    return FAKE_DEVICE_CODE
  }

  /** Simulates the user authorizing after one interval; aborts promptly on cancel. */
  async pollForToken(signal: AbortSignal): Promise<DeviceTokenResult> {
    await abortableDelay(FAKE_DEVICE_CODE.intervalSec * 1000, signal)
    return { accessToken: FAKE_ACCESS_TOKEN, scopes: [...FAKE_GRANTED_SCOPES] }
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

export function createGitHubAuthTestServices(): GitHubAuthTestServices {
  return {
    auth: new FakeGitHubAuthService(),
    api: new FakeGitHubApiService(),
    tokens: new FakeTokenStore(),
  }
}
