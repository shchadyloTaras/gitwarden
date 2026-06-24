// GitHub REST identity client — turns an access token into a verified GitHubAccount.
//
// Logic only (docs/plans/github-oauth-plan.md §3, Appendix A, §6 Phase 24):
//   1. getAuthenticatedUser(token)    → GET /user        → GitHubAccount
//   2. getPrimaryVerifiedEmail(token) → GET /user/emails → the primary && verified entry
//
// All network I/O goes through the injected HttpClient (the same seam as Phase 23) so
// this is fully unit-tested with a fake client — no real GitHub call in CI. A 401 maps
// to the typed `tokenInvalid` GitHubAuthError, the re-auth trigger that later surfaces
// as GITHUB_TOKEN_INVALID (plan §5). Tokens are passed in and never logged.

import { GitHubEmailsResponseSchema, GitHubUserResponseSchema } from '../../core/schemas.js'
import type { GitHubAccount } from '../../core/types.js'
import { GitHubAuthError } from './GitHubAuthError.js'
import { createLogger, type Logger } from './Logger.js'
import type { HttpClient, HttpResponse } from './HttpClient.js'

export const GITHUB_USER_URL = 'https://api.github.com/user'
export const GITHUB_USER_EMAILS_URL = 'https://api.github.com/user/emails'

const JSON_HEADERS: Record<string, string> = { Accept: 'application/json' }

export interface IGitHubApiService {
  getAuthenticatedUser(token: string): Promise<GitHubAccount>
  getPrimaryVerifiedEmail(token: string): Promise<string | undefined>
}

export class GitHubApiService implements IGitHubApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger = createLogger('GitHubApiService')
  ) {}

  /** GET /user → resolved identity. `name`/`email`/`avatar_url` come back null when unset. */
  async getAuthenticatedUser(token: string): Promise<GitHubAccount> {
    const res = await this.request(GITHUB_USER_URL, token)
    const user = this.parse(GitHubUserResponseSchema, res.json, 'user response')

    // GitHub sends null for unset fields; map null → absent so optional stays optional.
    const account: GitHubAccount = { id: user.id, login: user.login }
    if (user.name != null) account.name = user.name
    if (user.email != null) account.email = user.email
    if (user.avatar_url != null) account.avatarUrl = user.avatar_url

    this.logger.info('Fetched authenticated GitHub user', { login: account.login, id: account.id })
    return account
  }

  /** GET /user/emails → the email marked both `primary` and `verified`, or undefined. */
  async getPrimaryVerifiedEmail(token: string): Promise<string | undefined> {
    const res = await this.request(GITHUB_USER_EMAILS_URL, token)
    const emails = this.parse(GitHubEmailsResponseSchema, res.json, 'emails response')
    return emails.find((entry) => entry.primary && entry.verified)?.email
  }

  /** Authenticated GET; maps a 401 to the typed `tokenInvalid` error (the re-auth trigger). */
  private async request(url: string, token: string): Promise<HttpResponse> {
    let res: HttpResponse
    try {
      res = await this.http.get(url, { ...JSON_HEADERS, Authorization: `Bearer ${token}` })
    } catch (error) {
      throw new GitHubAuthError('network', `GitHub API request failed: ${errorMessage(error)}`)
    }

    if (res.status === 401) {
      throw new GitHubAuthError('tokenInvalid', `GitHub rejected the token (HTTP 401) for ${url}.`)
    }
    if (!isOk(res)) {
      throw new GitHubAuthError(
        'network',
        `GitHub API request to ${url} failed with HTTP ${res.status}.`
      )
    }
    return res
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
