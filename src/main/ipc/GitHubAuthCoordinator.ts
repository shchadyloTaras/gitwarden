// GitHub Device-Flow lifecycle coordinator (main process glue, Phase 25).
//
// Sits between the IPC handlers and the pure-logic services (Phases 23/24). It owns
// the cancellable connect lifecycle so the renderer never makes one long blocking IPC
// call: `startDeviceAuth` returns the user-facing device code immediately and kicks
// off background polling, then progress is pushed to the renderer over the
// `github:authEvent` channel (docs/plans/github-oauth-plan.md §4, §6 Phase 25).
//
// On success it fetches the verified identity, stores the token via TokenStore, and
// persists `linkedGitHub` on the profile. `shell.openExternal` is injected here (not
// in the services) per the Phase 23 boundary. The access token is set on the store
// and never returned to the renderer — only the persisted link and the public
// identity fields cross the authEvent channel.

import type { GitHubAccount, GitHubDeviceCode, LinkedGitHubAccount } from '../../core/types.js'
import type { IGitHubAuthService } from '../services/GitHubAuthService.js'
import type { IGitHubApiService } from '../services/GitHubApiService.js'
import type { ITokenStore } from '../storage/TokenStore.js'
import type { IProfileService } from '../services/ProfileService.js'
import { GitHubAuthError } from '../services/GitHubAuthError.js'
import { createLogger, type Logger } from '../services/Logger.js'
import { GITHUB_OAUTH_SCOPES } from '../../core/config/github.js'
import { GitHubAuthEventPayload } from './ipc-schemas.js'
import type { GitHubAuthStatus, GitHubAuthErrorCode } from '../../core/types.js'

export const GITHUB_AUTH_EVENT_CHANNEL = 'github:authEvent'

/** The minimal surface of an Electron WebContents we use to push progress events. */
export interface AuthEventSender {
  send(channel: string, payload: unknown): void
  isDestroyed?(): boolean
}

export interface IGitHubAuthCoordinator {
  startDeviceAuth(profileId: string, sender: AuthEventSender): Promise<GitHubDeviceCode>
  cancelDeviceAuth(profileId: string, sender: AuthEventSender): void
  disconnect(profileId: string): Promise<void>
  getLinkedAccount(profileId: string): Promise<LinkedGitHubAccount | undefined>
}

export interface GitHubAuthCoordinatorDeps {
  auth: IGitHubAuthService
  api: IGitHubApiService
  tokens: ITokenStore
  profiles: IProfileService
  /** Opens the verification URI in the user's browser (real: shell.openExternal). */
  openExternal: (url: string) => void | Promise<void>
  scopes?: readonly string[]
  /** ISO timestamp seam for `connectedAt`; injectable for deterministic tests. */
  now?: () => string
  logger?: Logger
}

export class GitHubAuthCoordinator implements IGitHubAuthCoordinator {
  private readonly auth: IGitHubAuthService
  private readonly api: IGitHubApiService
  private readonly tokens: ITokenStore
  private readonly profiles: IProfileService
  private readonly openExternal: (url: string) => void | Promise<void>
  private readonly scopes: string[]
  private readonly now: () => string
  private readonly logger: Logger

  /** In-flight poll per profile, so a flow can be cancelled or superseded cleanly. */
  private readonly controllers = new Map<string, AbortController>()

  constructor(deps: GitHubAuthCoordinatorDeps) {
    this.auth = deps.auth
    this.api = deps.api
    this.tokens = deps.tokens
    this.profiles = deps.profiles
    this.openExternal = deps.openExternal
    this.scopes = [...(deps.scopes ?? GITHUB_OAUTH_SCOPES)]
    this.now = deps.now ?? (() => new Date().toISOString())
    this.logger = deps.logger ?? createLogger('GitHubAuthCoordinator')
  }

  async startDeviceAuth(profileId: string, sender: AuthEventSender): Promise<GitHubDeviceCode> {
    // Supersede any prior in-flight flow for this profile before starting a new one.
    this.abort(profileId)

    const deviceCode = await this.auth.requestDeviceCode(this.scopes)

    // Opening the browser is best-effort: a failure here must not fail the connect —
    // the user can still navigate to the verification URI by hand.
    try {
      await this.openExternal(deviceCode.verificationUri)
    } catch (error) {
      this.logger.warn('Failed to open the GitHub verification URI', {
        error: errorMessage(error),
      })
    }

    this.emit(sender, { profileId, status: 'awaitingUser' })

    const controller = new AbortController()
    this.controllers.set(profileId, controller)
    // Fire-and-forget: progress is surfaced via authEvent, not this return value.
    void this.poll(profileId, sender, controller)

    return deviceCode
  }

  cancelDeviceAuth(profileId: string, sender: AuthEventSender): void {
    if (this.abort(profileId)) {
      this.emit(sender, { profileId, status: 'idle' })
    }
  }

  async disconnect(profileId: string): Promise<void> {
    this.abort(profileId)
    await this.tokens.delete(profileId)
    const profile = await this.profiles.get(profileId)
    if (profile?.linkedGitHub) {
      await this.profiles.update(profileId, { linkedGitHub: undefined })
    }
    this.logger.info('Disconnected GitHub account from profile', { profileId })
  }

  async getLinkedAccount(profileId: string): Promise<LinkedGitHubAccount | undefined> {
    return (await this.profiles.get(profileId))?.linkedGitHub
  }

  /** Background poll → on success persist identity+token and emit `authorized`. */
  private async poll(
    profileId: string,
    sender: AuthEventSender,
    controller: AbortController
  ): Promise<void> {
    const { signal } = controller
    try {
      const { accessToken, scopes } = await this.auth.pollForToken(signal)
      if (signal.aborted) return

      const account = await this.api.getAuthenticatedUser(accessToken)
      const email = account.email ?? (await this.resolveEmail(accessToken))
      if (signal.aborted) return

      await this.tokens.set(profileId, accessToken)
      const linked: LinkedGitHubAccount = {
        login: account.login,
        accountId: account.id,
        scopes,
        connectedAt: this.now(),
      }
      await this.profiles.update(profileId, { linkedGitHub: linked })

      const identity: GitHubAccount = { ...account, ...(email ? { email } : {}) }
      this.logger.info('Linked GitHub account to profile', {
        profileId,
        login: account.login,
      })
      this.emit(sender, { profileId, status: 'authorized', account: linked, identity })
    } catch (error) {
      if (signal.aborted) return // cancellation is not an error
      const { status, errorCode } = classify(error)
      this.logger.warn('GitHub authorization failed', { profileId, errorCode })
      this.emit(sender, { profileId, status, errorCode })
    } finally {
      // Only clear the map entry if it is still this controller (not a superseding one).
      if (this.controllers.get(profileId) === controller) {
        this.controllers.delete(profileId)
      }
    }
  }

  /** A missing primary-verified email is non-fatal — identity still resolves. */
  private async resolveEmail(accessToken: string): Promise<string | undefined> {
    try {
      return await this.api.getPrimaryVerifiedEmail(accessToken)
    } catch (error) {
      this.logger.debug('Could not resolve a primary verified email', {
        error: errorMessage(error),
      })
      return undefined
    }
  }

  /** Abort and forget any in-flight flow for a profile. Returns whether one existed. */
  private abort(profileId: string): boolean {
    const controller = this.controllers.get(profileId)
    if (!controller) return false
    controller.abort()
    this.controllers.delete(profileId)
    return true
  }

  /** Validate the outbound event with Zod, then push it to a live renderer. */
  private emit(
    sender: AuthEventSender,
    payload: {
      profileId: string
      status: GitHubAuthStatus
      errorCode?: GitHubAuthErrorCode
      account?: LinkedGitHubAccount
      identity?: GitHubAccount
    }
  ): void {
    const validated = GitHubAuthEventPayload.parse(payload)
    if (sender.isDestroyed?.()) return
    sender.send(GITHUB_AUTH_EVENT_CHANNEL, validated)
  }
}

/** Map a thrown error to the renderer-facing status + code. */
function classify(error: unknown): { status: GitHubAuthStatus; errorCode: GitHubAuthErrorCode } {
  if (error instanceof GitHubAuthError) {
    switch (error.code) {
      case 'accessDenied':
        return { status: 'denied', errorCode: 'accessDenied' }
      case 'expiredToken':
        return { status: 'expired', errorCode: 'expiredToken' }
      default:
        return { status: 'error', errorCode: error.code }
    }
  }
  return { status: 'error', errorCode: 'unknown' }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
