import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  abortableDelay,
  GITHUB_ACCESS_TOKEN_URL,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_DEVICE_GRANT_TYPE,
  GitHubAuthError,
  GitHubAuthService,
  type DeviceTokenResult,
  type Sleeper,
} from '../../src/main/services/GitHubAuthService.js'
import type { HttpClient, HttpResponse } from '../../src/main/services/HttpClient.js'
import type { Logger } from '../../src/main/services/Logger.js'

const CLIENT_ID = 'Ov_test_client'

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const DEVICE_CODE_RESPONSE = {
  device_code: 'DEVICE-CODE-SECRET',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
}

interface RecordedCall {
  url: string
  body: Record<string, string>
  headers?: Record<string, string>
}

/** A scripted HttpClient: one device-code reply, a queue of token-endpoint replies. */
class FakeHttp implements HttpClient {
  readonly calls: RecordedCall[] = []
  private readonly tokenReplies: unknown[]

  constructor(
    private readonly deviceReply: unknown,
    tokenReplies: unknown[] = []
  ) {
    this.tokenReplies = [...tokenReplies]
  }

  async postForm(
    url: string,
    body: Record<string, string>,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    this.calls.push({ url, body, headers })

    if (url === GITHUB_DEVICE_CODE_URL) {
      return { status: 200, json: this.deviceReply }
    }
    if (url === GITHUB_ACCESS_TOKEN_URL) {
      const next = this.tokenReplies.shift()
      if (next instanceof Error) throw next // simulate a network failure
      // GitHub returns HTTP 200 even for authorization_pending / slow_down.
      return { status: 200, json: next }
    }
    throw new Error(`unexpected POST url: ${url}`)
  }

  async request(): Promise<HttpResponse> {
    throw new Error('request() not used by GitHubAuthService')
  }

  async get(): Promise<HttpResponse> {
    throw new Error('get() not used by GitHubAuthService')
  }

  tokenCalls(): RecordedCall[] {
    return this.calls.filter((c) => c.url === GITHUB_ACCESS_TOKEN_URL)
  }

  deviceCalls(): RecordedCall[] {
    return this.calls.filter((c) => c.url === GITHUB_DEVICE_CODE_URL)
  }
}

/**
 * Like FakeHttp, but token replies are full HttpResponse objects (so a test can drive
 * non-2xx statuses and unparseable bodies) or Errors (to simulate a thrown request).
 */
class ResponseHttp implements HttpClient {
  readonly calls: RecordedCall[] = []
  private readonly tokenReplies: Array<HttpResponse | Error>

  constructor(
    private readonly deviceReply: unknown,
    tokenReplies: Array<HttpResponse | Error> = []
  ) {
    this.tokenReplies = [...tokenReplies]
  }

  async postForm(
    url: string,
    body: Record<string, string>,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    this.calls.push({ url, body, headers })
    if (url === GITHUB_DEVICE_CODE_URL) {
      return { status: 200, json: this.deviceReply }
    }
    if (url === GITHUB_ACCESS_TOKEN_URL) {
      const next = this.tokenReplies.shift()
      if (next === undefined) throw new Error('ResponseHttp: token replies exhausted')
      if (next instanceof Error) throw next
      return next
    }
    throw new Error(`unexpected POST url: ${url}`)
  }

  async request(): Promise<HttpResponse> {
    throw new Error('request() not used by GitHubAuthService')
  }

  async get(): Promise<HttpResponse> {
    throw new Error('get() not used by GitHubAuthService')
  }

  tokenCalls(): RecordedCall[] {
    return this.calls.filter((c) => c.url === GITHUB_ACCESS_TOKEN_URL)
  }
}

/** A Sleeper that records the ms it was asked to wait and resolves instantly. */
function recordingSleeper(): { calls: number[]; sleep: Sleeper } {
  const calls: number[] = []
  const sleep: Sleeper = async (ms) => {
    calls.push(ms)
  }
  return { calls, sleep }
}

/** A clock that returns each scripted value in turn, then sticks on the last one. */
function scriptedClock(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[Math.min(i, values.length - 1)]
    i += 1
    return v
  }
}

function makeService(
  http: HttpClient,
  sleep: Sleeper = recordingSleeper().sleep
): GitHubAuthService {
  return new GitHubAuthService(http, CLIENT_ID, sleep, silentLogger)
}

async function startedService(http: FakeHttp, sleep?: Sleeper): Promise<GitHubAuthService> {
  const service = makeService(http, sleep)
  await service.requestDeviceCode(['read:user', 'user:email'])
  return service
}

afterEach(() => {
  vi.useRealTimers()
})

describe('GitHubAuthService.requestDeviceCode', () => {
  it('returns the user-facing device code and omits the raw device_code', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE)
    const service = makeService(http)

    const deviceCode = await service.requestDeviceCode(['read:user', 'user:email'])

    expect(deviceCode).toEqual({
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresInSec: 900,
      intervalSec: 5,
    })
    // The renderer payload must NOT carry the secret device_code (Appendix B).
    expect(deviceCode).not.toHaveProperty('deviceCode')
    expect(deviceCode).not.toHaveProperty('device_code')
    expect(JSON.stringify(deviceCode)).not.toContain(DEVICE_CODE_RESPONSE.device_code)
  })

  it('POSTs client_id + space-joined scope with Accept: application/json', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE)
    const service = makeService(http)

    await service.requestDeviceCode(['read:user', 'user:email'])

    const call = http.deviceCalls()[0]
    expect(call.url).toBe(GITHUB_DEVICE_CODE_URL)
    expect(call.body).toEqual({ client_id: CLIENT_ID, scope: 'read:user user:email' })
    expect(call.headers).toMatchObject({ Accept: 'application/json' })
  })

  it('rejects with a typed network error on a non-2xx response', async () => {
    const http: HttpClient = {
      request: async () => ({ status: 503, json: {} }),
      postForm: async () => ({ status: 503, json: {} }),
      get: async () => ({ status: 503, json: {} }),
    }
    const service = makeService(http)

    await expect(service.requestDeviceCode(['read:user'])).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'network',
    })
  })
})

describe('GitHubAuthService.pollForToken', () => {
  it('keeps polling on authorization_pending, then resolves the token + scopes', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { access_token: 'gho_success', scope: 'read:user user:email', token_type: 'bearer' },
    ])
    const { calls, sleep } = recordingSleeper()
    const service = await startedService(http, sleep)

    const result: DeviceTokenResult = await service.pollForToken(new AbortController().signal)

    expect(result).toEqual({
      accessToken: 'gho_success',
      scopes: ['read:user', 'user:email'],
    })
    expect(http.tokenCalls()).toHaveLength(2)
    expect(calls).toEqual([5000]) // one wait, at the device-code interval
  })

  it('sends the retained device_code + grant_type on each poll', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { access_token: 'gho_x', scope: 'read:user', token_type: 'bearer' },
    ])
    const service = await startedService(http)

    await service.pollForToken(new AbortController().signal)

    expect(http.tokenCalls()[0].body).toEqual({
      client_id: CLIENT_ID,
      device_code: DEVICE_CODE_RESPONSE.device_code,
      grant_type: GITHUB_DEVICE_GRANT_TYPE,
    })
    expect(http.tokenCalls()[0].headers).toMatchObject({ Accept: 'application/json' })
  })

  it('raises the interval on slow_down (using the value GitHub returns)', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { error: 'slow_down', interval: 10 },
      { access_token: 'gho_slow', scope: 'read:user', token_type: 'bearer' },
    ])
    const { calls, sleep } = recordingSleeper()
    const service = await startedService(http, sleep)

    const result = await service.pollForToken(new AbortController().signal)

    expect(result.accessToken).toBe('gho_slow')
    // 5s before slow_down, then the raised 10s after it.
    expect(calls).toEqual([5000, 10000])
  })

  it('raises the interval by +5s when slow_down omits a new interval', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'slow_down' }, // no interval field
      { access_token: 'gho_inc', scope: 'read:user', token_type: 'bearer' },
    ])
    const { calls, sleep } = recordingSleeper()
    const service = await startedService(http, sleep)

    await service.pollForToken(new AbortController().signal)

    expect(calls).toEqual([10000]) // 5s base + 5s increment
  })

  it('rejects with expiredToken on expired_token', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { error: 'expired_token' },
    ])
    const service = await startedService(http)

    await expect(service.pollForToken(new AbortController().signal)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'expiredToken',
    })
  })

  it('rejects with accessDenied on access_denied', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [{ error: 'access_denied' }])
    const service = await startedService(http)

    await expect(service.pollForToken(new AbortController().signal)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'accessDenied',
    })
  })

  it('keeps polling through a transient network failure instead of aborting the flow', async () => {
    // A dropped request mid-flow (Wi-Fi flap, sleep/wake, momentary GitHub outage) must
    // NOT end the flow and force the user to restart sign-in — it should retry.
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      new Error('socket hang up'),
      { access_token: 'gho_after_blip', scope: 'read:user', token_type: 'bearer' },
    ])
    const { calls, sleep } = recordingSleeper()
    const service = await startedService(http, sleep)

    const result = await service.pollForToken(new AbortController().signal)

    expect(result.accessToken).toBe('gho_after_blip')
    expect(http.tokenCalls()).toHaveLength(2) // the failed poll, then the success
    expect(calls).toEqual([5000]) // backed off one interval rather than aborting
  })

  it('keeps polling through a transient non-2xx response', async () => {
    // GitHub answers the poll with HTTP 200 even for pending; a 5xx / rate-limit page is
    // a transient hiccup, not a terminal failure.
    const http = new ResponseHttp(DEVICE_CODE_RESPONSE, [
      { status: 502, json: undefined, bodyText: 'Bad Gateway' },
      {
        status: 200,
        json: { access_token: 'gho_after_502', scope: 'read:user', token_type: 'bearer' },
      },
    ])
    const { calls, sleep } = recordingSleeper()
    const service = await startedService(http, sleep)

    const result = await service.pollForToken(new AbortController().signal)

    expect(result.accessToken).toBe('gho_after_502')
    expect(http.tokenCalls()).toHaveLength(2)
    expect(calls).toEqual([5000])
  })

  it('keeps polling through a transient unparseable body', async () => {
    const http = new ResponseHttp(DEVICE_CODE_RESPONSE, [
      { status: 200, json: undefined, bodyText: '<html>rate limited</html>' },
      {
        status: 200,
        json: { access_token: 'gho_after_garbage', scope: 'read:user', token_type: 'bearer' },
      },
    ])
    const { calls, sleep } = recordingSleeper()
    const service = await startedService(http, sleep)

    const result = await service.pollForToken(new AbortController().signal)

    expect(result.accessToken).toBe('gho_after_garbage')
    expect(http.tokenCalls()).toHaveLength(2)
    expect(calls).toEqual([5000])
  })

  it('gives up with expiredToken once the device-code lifetime elapses during an outage', async () => {
    // A sustained outage means GitHub never gets to return expired_token; the deadline
    // derived from `expires_in` bounds the loop so it cannot poll forever.
    const http = new ResponseHttp(DEVICE_CODE_RESPONSE, [
      new Error('offline'),
      new Error('offline'),
    ])
    // t=0 when the deadline is computed; the next check is already past the 900s lifetime.
    const clock = scriptedClock([0, 900_000])
    const { sleep } = recordingSleeper()
    const service = new GitHubAuthService(http, CLIENT_ID, sleep, silentLogger, clock)
    await service.requestDeviceCode(['read:user'])

    await expect(service.pollForToken(new AbortController().signal)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'expiredToken',
    })
    expect(http.tokenCalls()).toHaveLength(1) // one failed poll, then the deadline tripped
  })

  it('rejects with unknown for an unrecognized error code', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [{ error: 'something_unexpected' }])
    const service = await startedService(http)

    await expect(service.pollForToken(new AbortController().signal)).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'unknown',
    })
  })

  it('throws if called before requestDeviceCode', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE)
    const service = makeService(http)

    await expect(service.pollForToken(new AbortController().signal)).rejects.toBeInstanceOf(
      GitHubAuthError
    )
    expect(http.tokenCalls()).toHaveLength(0)
  })

  it('rejects immediately and never polls when the signal is already aborted', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { access_token: 'gho_never', scope: 'read:user', token_type: 'bearer' },
    ])
    const service = await startedService(http)
    const controller = new AbortController()
    controller.abort()

    await expect(service.pollForToken(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(http.tokenCalls()).toHaveLength(0)
  })

  it('stops promptly when aborted during the inter-poll wait', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { access_token: 'gho_should_not_reach', scope: 'read:user', token_type: 'bearer' },
    ])
    const controller = new AbortController()
    // Abort as soon as the first wait begins, then reject like the real delay would.
    const abortingSleep: Sleeper = async (_ms, signal) => {
      controller.abort()
      const error = new Error('aborted')
      error.name = 'AbortError'
      void signal // signal is the same one we just aborted
      throw error
    }
    const service = await startedService(http, abortingSleep)

    await expect(service.pollForToken(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    // Exactly one poll: the loop did not run again after the abort.
    expect(http.tokenCalls()).toHaveLength(1)
  })
})

describe('abortableDelay', () => {
  it('resolves after the requested time', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const settled = vi.fn()
    const promise = abortableDelay(1000, controller.signal).then(settled)

    await vi.advanceTimersByTimeAsync(999)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await promise
    expect(settled).toHaveBeenCalledOnce()
  })

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(abortableDelay(1000, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('rejects promptly — without waiting out the timer — when aborted mid-wait', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const promise = abortableDelay(60_000, controller.signal)
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' })

    controller.abort() // fires synchronously; no timer advance needed

    await assertion
  })
})
