// Update notifier (main process). Asks GitHub for the latest published release and classifies it
// against the running version via the pure core evaluator. Network/parse failures resolve to a
// soft `error` result rather than throwing, so a flaky connection leaves the button hidden
// instead of nagging (docs/plans/distribution-release-plan.md Phase 44: "no nag loop").
//
// All I/O goes through the injected HttpClient seam (the same one the GitHub OAuth client uses),
// so this is unit-tested with a fake client — no real network in CI. The decision logic lives in
// src/core/updates so it stays pure and headlessly verifiable.

import { evaluateUpdate } from '../../core/updates/evaluate.js'
import { GitHubLatestReleaseSchema } from '../../core/updates/schemas.js'
import type { ReleaseInfo, UpdateCheckResult } from '../../core/updates/types.js'
import { createLogger, type Logger } from './Logger.js'
import type { HttpClient } from './HttpClient.js'

export interface IUpdateService {
  /** Check the update source and classify the result. Never throws — see file header. */
  checkForUpdates(): Promise<UpdateCheckResult>
}

export interface UpdateServiceOptions {
  http: HttpClient
  /** The running app version, e.g. from `app.getVersion()`. Injected to keep this testable. */
  currentVersion: string
  /** GitHub repository coordinates that own the releases. */
  owner: string
  repo: string
  logger?: Logger
}

// GitHub requires a User-Agent on every REST call; `vnd.github+json` pins the v3 media type.
const GITHUB_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'GitWarden',
}

export class GitHubUpdateService implements IUpdateService {
  private readonly http: HttpClient
  private readonly currentVersion: string
  private readonly latestReleaseUrl: string
  private readonly logger: Logger

  constructor(options: UpdateServiceOptions) {
    this.http = options.http
    this.currentVersion = options.currentVersion
    this.latestReleaseUrl = `https://api.github.com/repos/${options.owner}/${options.repo}/releases/latest`
    this.logger = options.logger ?? createLogger('UpdateService')
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      const res = await this.http.get(this.latestReleaseUrl, GITHUB_HEADERS)

      // No published (non-draft, non-prerelease) release yet → nothing to offer.
      if (res.status === 404) {
        return evaluateUpdate(this.currentVersion, null)
      }
      if (res.status < 200 || res.status >= 300) {
        return this.errorResult(`GitHub returned HTTP ${res.status}.`)
      }

      const parsed = GitHubLatestReleaseSchema.safeParse(res.json)
      if (!parsed.success) {
        return this.errorResult('Could not parse the latest-release response.')
      }

      const release = toReleaseInfo(parsed.data)
      const result = evaluateUpdate(this.currentVersion, release)
      if (result.status === 'update-available') {
        this.logger.info('Update available', {
          current: this.currentVersion,
          latest: release.version,
        })
      }
      return result
    } catch (error) {
      return this.errorResult(error instanceof Error ? error.message : String(error))
    }
  }

  private errorResult(message: string): UpdateCheckResult {
    // Info, not error: a missed update check is expected (offline) and must never look alarming.
    this.logger.info('Update check failed', { reason: message })
    return { status: 'error', currentVersion: this.currentVersion, error: message }
  }
}

/** Map the validated GitHub payload to our ReleaseInfo (tag without the leading "v"). */
function toReleaseInfo(data: {
  tag_name: string
  name?: string | null
  html_url: string
  published_at?: string | null
}): ReleaseInfo {
  const version = data.tag_name.replace(/^v/i, '')
  const info: ReleaseInfo = {
    tag: data.tag_name,
    version,
    name: data.name && data.name.trim() !== '' ? data.name : data.tag_name,
    url: data.html_url,
  }
  if (data.published_at) info.publishedAt = data.published_at
  return info
}
