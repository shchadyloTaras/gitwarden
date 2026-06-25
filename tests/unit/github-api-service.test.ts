import { describe, expect, it } from 'vitest'
import {
  GITHUB_USER_EMAILS_URL,
  GITHUB_USER_URL,
  GitHubApiService,
} from '../../src/main/services/GitHubApiService.js'
import { GitHubAuthError } from '../../src/main/services/GitHubAuthError.js'
import type { HttpClient, HttpResponse } from '../../src/main/services/HttpClient.js'
import type { Logger } from '../../src/main/services/Logger.js'

const TOKEN = 'gho_test_token_value'

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const USER_RESPONSE = {
  id: 583231,
  login: 'octocat',
  name: 'The Octocat',
  email: 'octocat@github.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
}

const EMAILS_RESPONSE = [
  { email: 'unverified@example.com', primary: false, verified: false, visibility: null },
  { email: 'secondary@example.com', primary: false, verified: true, visibility: null },
  { email: 'primary@github.com', primary: true, verified: true, visibility: 'private' },
  { email: 'primary-unverified@example.com', primary: false, verified: false, visibility: null },
]

interface RecordedGet {
  url: string
  headers?: Record<string, string>
}

/** A scripted HttpClient: maps each GET URL to a canned status + JSON body. */
class FakeHttp implements HttpClient {
  readonly gets: RecordedGet[] = []

  constructor(private readonly routes: Record<string, HttpResponse>) {}

  async request(): Promise<HttpResponse> {
    throw new Error('request() not used by GitHubApiService')
  }

  async get(url: string, headers?: Record<string, string>): Promise<HttpResponse> {
    this.gets.push({ url, headers })
    const reply = this.routes[url]
    if (reply instanceof Error) throw reply
    if (!reply) throw new Error(`unexpected GET url: ${url}`)
    return reply
  }

  async postForm(): Promise<HttpResponse> {
    throw new Error('postForm() not used by GitHubApiService')
  }
}

function makeService(routes: Record<string, HttpResponse>): {
  service: GitHubApiService
  http: FakeHttp
} {
  const http = new FakeHttp(routes)
  return { service: new GitHubApiService(http, silentLogger), http }
}

describe('GitHubApiService.getAuthenticatedUser', () => {
  it('maps login/id/name/avatar_url (and email) from GET /user', async () => {
    const { service } = makeService({
      [GITHUB_USER_URL]: { status: 200, json: USER_RESPONSE },
    })

    const account = await service.getAuthenticatedUser(TOKEN)

    expect(account).toEqual({
      id: 583231,
      login: 'octocat',
      name: 'The Octocat',
      email: 'octocat@github.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
    })
  })

  it('sends Accept: application/json and the Bearer token to /user', async () => {
    const { service, http } = makeService({
      [GITHUB_USER_URL]: { status: 200, json: USER_RESPONSE },
    })

    await service.getAuthenticatedUser(TOKEN)

    expect(http.gets).toHaveLength(1)
    expect(http.gets[0].url).toBe(GITHUB_USER_URL)
    expect(http.gets[0].headers).toMatchObject({
      Accept: 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    })
  })

  it('omits name/email (null) and avatar (absent) from the mapped account', async () => {
    const { service } = makeService({
      // GitHub sends null for an unset name/email; avatar_url is simply absent here.
      [GITHUB_USER_URL]: {
        status: 200,
        json: { id: 7, login: 'ghost', name: null, email: null },
      },
    })

    const account = await service.getAuthenticatedUser(TOKEN)

    expect(account).toEqual({ id: 7, login: 'ghost' })
    expect(account).not.toHaveProperty('name')
    expect(account).not.toHaveProperty('email')
    expect(account).not.toHaveProperty('avatarUrl')
  })

  it('maps a 401 to a typed tokenInvalid error', async () => {
    const { service } = makeService({
      [GITHUB_USER_URL]: { status: 401, json: { message: 'Bad credentials' } },
    })

    await expect(service.getAuthenticatedUser(TOKEN)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'tokenInvalid',
    })
    await expect(service.getAuthenticatedUser(TOKEN)).rejects.toBeInstanceOf(GitHubAuthError)
  })

  it('maps a non-401 error status to a typed network error', async () => {
    const { service } = makeService({
      [GITHUB_USER_URL]: { status: 503, json: {} },
    })

    await expect(service.getAuthenticatedUser(TOKEN)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'network',
    })
  })

  it('maps a thrown HTTP-client failure to a typed network error', async () => {
    const { service } = makeService({
      [GITHUB_USER_URL]: new Error('socket hang up') as unknown as HttpResponse,
    })

    await expect(service.getAuthenticatedUser(TOKEN)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'network',
    })
  })

  it('maps a malformed body to a typed unknown error', async () => {
    const { service } = makeService({
      [GITHUB_USER_URL]: { status: 200, json: { login: 'no-id' } }, // missing required id
    })

    await expect(service.getAuthenticatedUser(TOKEN)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'unknown',
    })
  })
})

describe('GitHubApiService.getPrimaryVerifiedEmail', () => {
  it('selects the primary && verified entry over non-primary / unverified ones', async () => {
    const { service } = makeService({
      [GITHUB_USER_EMAILS_URL]: { status: 200, json: EMAILS_RESPONSE },
    })

    const email = await service.getPrimaryVerifiedEmail(TOKEN)

    expect(email).toBe('primary@github.com')
  })

  it('returns undefined when no entry is both primary and verified', async () => {
    const { service } = makeService({
      [GITHUB_USER_EMAILS_URL]: {
        status: 200,
        json: [
          { email: 'verified-not-primary@example.com', primary: false, verified: true },
          { email: 'primary-not-verified@example.com', primary: true, verified: false },
        ],
      },
    })

    await expect(service.getPrimaryVerifiedEmail(TOKEN)).resolves.toBeUndefined()
  })

  it('returns undefined for an empty email list', async () => {
    const { service } = makeService({
      [GITHUB_USER_EMAILS_URL]: { status: 200, json: [] },
    })

    await expect(service.getPrimaryVerifiedEmail(TOKEN)).resolves.toBeUndefined()
  })

  it('sends the Bearer token to /user/emails', async () => {
    const { service, http } = makeService({
      [GITHUB_USER_EMAILS_URL]: { status: 200, json: EMAILS_RESPONSE },
    })

    await service.getPrimaryVerifiedEmail(TOKEN)

    expect(http.gets[0].url).toBe(GITHUB_USER_EMAILS_URL)
    expect(http.gets[0].headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` })
  })

  it('maps a 401 to a typed tokenInvalid error', async () => {
    const { service } = makeService({
      [GITHUB_USER_EMAILS_URL]: { status: 401, json: { message: 'Bad credentials' } },
    })

    await expect(service.getPrimaryVerifiedEmail(TOKEN)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'tokenInvalid',
    })
  })
})
