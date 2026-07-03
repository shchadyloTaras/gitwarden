import { describe, expect, it } from 'vitest'
import { GitHubAuthService, type Sleeper } from '../../src/main/services/GitHubAuthService.js'
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
  interval: 5, // 5000ms
}

interface RecordedCall {
  url: string
  body: Record<string, string>
}

/** Scripted HttpClient: one device-code reply, a queue of token-endpoint replies. */
class FakeHttp implements HttpClient {
  readonly calls: RecordedCall[] = []
  private readonly tokenReplies: unknown[]

  constructor(
    private readonly deviceReply: unknown,
    tokenReplies: unknown[] = []
  ) {
    this.tokenReplies = [...tokenReplies]
  }

  async postForm(url: string, body: Record<string, string>): Promise<HttpResponse> {
    this.calls.push({ url, body })
    if (url === 'https://github.com/login/device/code') {
      return { status: 200, json: this.deviceReply }
    }
    const next = this.tokenReplies.shift()
    if (next instanceof Error) throw next
    return { status: 200, json: next }
  }

  async request(): Promise<HttpResponse> {
    throw new Error('request() not used by GitHubAuthService')
  }

  async get(): Promise<HttpResponse> {
    throw new Error('get() not used by GitHubAuthService')
  }

  tokenCalls(): RecordedCall[] {
    return this.calls.filter((c) => c.url !== 'https://github.com/login/device/code')
  }
}

/**
 * A Sleeper that never resolves on its own — the test resolves or aborts each wait
 * explicitly. Lets a test observe "a wait is in flight" and control exactly when (or
 * whether) it ends, so the race between the injected sleep and `requestImmediatePoll`'s
 * wake is fully deterministic (no real timers).
 */
function controllableSleeper(): {
  sleep: Sleeper
  msCalls: number[]
  isWaiting: () => boolean
  resolveWait: () => void
} {
  let current: (() => void) | undefined
  const msCalls: number[] = []
  const sleep: Sleeper = (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      msCalls.push(ms)
      current = () => {
        current = undefined
        resolve()
      }
      const onAbort = (): void => {
        current = undefined
        const reason = signal.reason
        const error = reason instanceof Error ? reason : new Error('aborted')
        if (!error.name || error.name === 'Error') error.name = 'AbortError'
        reject(error)
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  return {
    sleep,
    msCalls,
    isWaiting: () => current !== undefined,
    resolveWait: () => current?.(),
  }
}

/** A clock the test advances by hand — deterministic, no wall-clock dependency. */
function mutableClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

/** Flushes pending microtasks until `predicate` is true, or fails after `maxTicks`. */
async function waitUntil(predicate: () => boolean, maxTicks = 100): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
  throw new Error('waitUntil: condition was never met')
}

function makeService(http: HttpClient, sleep: Sleeper, now?: () => number): GitHubAuthService {
  return new GitHubAuthService(http, CLIENT_ID, sleep, silentLogger, now)
}

describe('GitHubAuthService.requestImmediatePoll', () => {
  it('is a no-op when no poll is in flight (before requestDeviceCode, and after it settles)', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { access_token: 'gho_x', scope: 'read:user', token_type: 'bearer' },
    ])
    const { sleep } = controllableSleeper()
    const service = makeService(http, sleep)

    // No flow started at all.
    expect(() => service.requestImmediatePoll()).not.toThrow()

    await service.requestDeviceCode(['read:user'])
    const result = await service.pollForToken(new AbortController().signal)
    expect(result.accessToken).toBe('gho_x')

    // Flow already settled — still a safe no-op.
    expect(() => service.requestImmediatePoll()).not.toThrow()
    expect(http.tokenCalls()).toHaveLength(1) // the poke never added an extra poll
  })

  it('a poke during a wait triggers exactly one early poll, without resolving the sleep', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { error: 'authorization_pending' },
      { access_token: 'gho_success', scope: 'read:user', token_type: 'bearer' },
    ])
    const { sleep, isWaiting, resolveWait } = controllableSleeper()
    const clock = mutableClock(0)
    const service = makeService(http, sleep, clock.now)
    await service.requestDeviceCode(['read:user'])

    const pollPromise = service.pollForToken(new AbortController().signal)

    await waitUntil(isWaiting)
    expect(http.tokenCalls()).toHaveLength(1)

    clock.advance(2000) // past the floor, no prior bypass
    service.requestImmediatePoll() // bypasses the wait — does NOT touch the sleeper

    await waitUntil(() => http.tokenCalls().length === 2)
    await waitUntil(isWaiting) // back to waiting for the 3rd poll
    resolveWait() // let the interval elapse normally this time

    const result = await pollPromise
    expect(result.accessToken).toBe('gho_success')
    expect(http.tokenCalls()).toHaveLength(3)
  })

  it('ignores a burst of pokes beyond one bypass per interval window', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { error: 'authorization_pending' },
      { access_token: 'gho_burst', scope: 'read:user', token_type: 'bearer' },
    ])
    const { sleep, isWaiting, resolveWait } = controllableSleeper()
    const clock = mutableClock(0)
    const service = makeService(http, sleep, clock.now)
    await service.requestDeviceCode(['read:user'])

    const pollPromise = service.pollForToken(new AbortController().signal)
    await waitUntil(isWaiting) // poll #1 done at t=0

    clock.advance(2000) // t=2000: past the floor, no prior bypass
    service.requestImmediatePoll()
    await waitUntil(() => http.tokenCalls().length === 2) // bypass granted
    await waitUntil(isWaiting) // poll #2 done at t=2000, waiting again

    clock.advance(1500) // t=3500: past the floor since poll #2, but only 1.5s since the bypass — under the 5s interval window
    service.requestImmediatePoll()

    // Rejected by the "one bypass per interval window" guard: still waiting, no 3rd poll yet.
    expect(isWaiting()).toBe(true)
    expect(http.tokenCalls()).toHaveLength(2)

    resolveWait() // let the interval elapse normally
    const result = await pollPromise
    expect(result.accessToken).toBe('gho_burst')
    expect(http.tokenCalls()).toHaveLength(3)
  })

  it('ignores a poke within the floor window right after a poll', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { access_token: 'gho_floor', scope: 'read:user', token_type: 'bearer' },
    ])
    const { sleep, isWaiting, resolveWait } = controllableSleeper()
    const clock = mutableClock(0)
    const service = makeService(http, sleep, clock.now)
    await service.requestDeviceCode(['read:user'])

    const pollPromise = service.pollForToken(new AbortController().signal)
    await waitUntil(isWaiting) // poll #1 done at t=0

    clock.advance(200) // t=200: under the 1000ms floor
    service.requestImmediatePoll()

    expect(isWaiting()).toBe(true) // no-op: still waiting, no bypass poll
    expect(http.tokenCalls()).toHaveLength(1)

    resolveWait()
    const result = await pollPromise
    expect(result.accessToken).toBe('gho_floor')
    expect(http.tokenCalls()).toHaveLength(2)
  })

  it('does not change deadline/expiry behavior — a valid earlier bypass still expires on schedule', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { error: 'authorization_pending' },
    ])
    const { sleep, isWaiting, resolveWait } = controllableSleeper()
    const clock = mutableClock(0)
    const service = makeService(http, sleep, clock.now)
    await service.requestDeviceCode(['read:user']) // expires_in: 900s → deadline at t=900000

    const pollPromise = service.pollForToken(new AbortController().signal)
    await waitUntil(isWaiting)

    clock.advance(2000) // valid bypass: past floor, no prior bypass
    service.requestImmediatePoll()
    await waitUntil(() => http.tokenCalls().length === 2)
    await waitUntil(isWaiting)

    clock.advance(900_000) // jump straight to (past) the device-code deadline
    resolveWait()

    await expect(pollPromise).rejects.toMatchObject({
      name: 'GitHubAuthError',
      code: 'expiredToken',
    })
  })

  it('does not interfere with AbortSignal cancellation while a wake is armed', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [{ error: 'authorization_pending' }])
    const { sleep, isWaiting } = controllableSleeper()
    const service = makeService(http, sleep, () => 0)
    await service.requestDeviceCode(['read:user'])
    const controller = new AbortController()

    const pollPromise = service.pollForToken(controller.signal)
    await waitUntil(isWaiting)

    controller.abort() // no poke ever arrives; cancellation must still work

    await expect(pollPromise).rejects.toMatchObject({ name: 'AbortError' })
    // The wake was cleared by the abort — a stray poke afterward is still a safe no-op.
    expect(() => service.requestImmediatePoll()).not.toThrow()
  })

  it('leaves the normal cadence unchanged when no poke ever arrives', async () => {
    const http = new FakeHttp(DEVICE_CODE_RESPONSE, [
      { error: 'authorization_pending' },
      { access_token: 'gho_normal', scope: 'read:user', token_type: 'bearer' },
    ])
    const { sleep, msCalls, isWaiting, resolveWait } = controllableSleeper()
    const service = makeService(http, sleep, () => 0)
    await service.requestDeviceCode(['read:user'])

    const pollPromise = service.pollForToken(new AbortController().signal)
    await waitUntil(isWaiting)
    resolveWait()

    const result = await pollPromise
    expect(result.accessToken).toBe('gho_normal')
    expect(msCalls).toEqual([5000]) // the plain device-code interval, unaffected
  })
})
