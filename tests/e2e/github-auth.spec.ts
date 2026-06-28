import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
import path from 'node:path'
import { profileFixture } from '../fixtures/profiles'

// Phase 25 — IPC Bridge for GitHub Auth.
//
// Launches the built app with GITWARDEN_E2E_FAKE_GITHUB=1, which swaps the real
// device-flow / REST / token services for in-memory fakes in the main process
// (electron/index.ts → githubAuthFakes.ts). No real GitHub network call happens.
// We exercise the full bridge through window.api.github: start the flow, receive
// the device code, observe the pushed authEvent, confirm Zod rejects bad input,
// and re-assert the renderer security flags.

function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [path.resolve(__dirname, '../../out/main/index.js')],
    env: { ...process.env, GITWARDEN_E2E_FAKE_GITHUB: '1' },
  })
}

const PROFILE_INPUT = profileFixture('githubTest')

/** Create a fresh profile via IPC and return its id. */
async function createProfile(win: Page): Promise<string> {
  const res = await win.evaluate(async (input) => {
    return (window as Window & typeof globalThis).api.profiles.create(input)
  }, PROFILE_INPUT)
  if (!res.ok) throw new Error(`profile create failed: ${res.error}`)
  return res.data.id
}

async function deleteProfile(win: Page, id: string): Promise<void> {
  await win.evaluate(
    async (pid: string) => (window as Window & typeof globalThis).api.profiles.delete(pid),
    id
  )
}

test.describe('GitHub auth IPC bridge (injected fake service)', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeEach(async () => {
    app = await launchApp()
    win = await app.firstWindow()
    await win.waitForSelector('[data-ready="true"]', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await app.close()
  })

  test('startDeviceAuth round-trips and returns a device code', async () => {
    const profileId = await createProfile(win)
    try {
      const result = await win.evaluate(
        async (pid: string) =>
          (window as Window & typeof globalThis).api.github.startDeviceAuth(pid),
        profileId
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toMatchObject({
          userCode: expect.any(String),
          verificationUri: expect.stringContaining('github.com'),
          expiresInSec: expect.any(Number),
          intervalSec: expect.any(Number),
        })
        // The raw device_code must NEVER cross to the renderer.
        expect(result.data).not.toHaveProperty('deviceCode')
        expect(result.data).not.toHaveProperty('device_code')
      }
    } finally {
      await deleteProfile(win, profileId)
    }
  })

  test("a simulated authEvent 'authorized' reaches the renderer and persists the link", async () => {
    const profileId = await createProfile(win)
    try {
      // Subscribe BEFORE starting the flow so no event is missed.
      await win.evaluate(() => {
        const w = window as Window & typeof globalThis & { __ghEvents?: unknown[] }
        w.__ghEvents = []
        w.api.github.onAuthEvent((event) => w.__ghEvents!.push(event))
      })

      const startRes = await win.evaluate(
        async (pid: string) =>
          (window as Window & typeof globalThis).api.github.startDeviceAuth(pid),
        profileId
      )
      expect(startRes.ok).toBe(true)

      // The fake poller authorizes after one interval; wait for the pushed event.
      await win.waitForFunction(
        () => {
          const w = window as Window & typeof globalThis & { __ghEvents?: { status: string }[] }
          return (w.__ghEvents ?? []).some((e) => e.status === 'authorized')
        },
        undefined,
        { timeout: 10000 }
      )

      const events = await win.evaluate(() => {
        const w = window as Window & typeof globalThis & { __ghEvents?: unknown[] }
        return w.__ghEvents as Array<{
          profileId: string
          status: string
          account?: { login: string; accountId: number }
          identity?: { login: string; email?: string }
        }>
      })

      // Progression: awaitingUser → authorized, all tagged with our profileId.
      expect(events.some((e) => e.status === 'awaitingUser')).toBe(true)
      const authorized = events.find((e) => e.status === 'authorized')
      expect(authorized).toBeTruthy()
      expect(authorized?.profileId).toBe(profileId)
      expect(authorized?.account?.login).toBe('octocat')
      expect(authorized?.identity?.login).toBe('octocat')
      expect(authorized?.identity?.email).toBeTruthy()

      // The link was persisted on the profile and is readable back over IPC.
      const linkedRes = await win.evaluate(
        async (pid: string) =>
          (window as Window & typeof globalThis).api.github.getLinkedAccount(pid),
        profileId
      )
      expect(linkedRes.ok).toBe(true)
      if (linkedRes.ok) {
        expect(linkedRes.data?.login).toBe('octocat')
        expect(linkedRes.data?.accountId).toBe(583231)
      }

      // disconnect clears the persisted link.
      const disconnectRes = await win.evaluate(
        async (pid: string) => (window as Window & typeof globalThis).api.github.disconnect(pid),
        profileId
      )
      expect(disconnectRes.ok).toBe(true)
      const afterRes = await win.evaluate(
        async (pid: string) =>
          (window as Window & typeof globalThis).api.github.getLinkedAccount(pid),
        profileId
      )
      expect(afterRes.ok).toBe(true)
      if (afterRes.ok) expect(afterRes.data).toBeNull()
    } finally {
      await deleteProfile(win, profileId)
    }
  })

  test('an invalid payload is rejected by Zod (ok:false)', async () => {
    // Empty profileId violates z.string().min(1) on the main side.
    const result = await win.evaluate(async () =>
      (window as Window & typeof globalThis).api.github.startDeviceAuth('')
    )
    expect(result).toMatchObject({ ok: false, error: expect.any(String) })
  })

  test('renderer security flags still hold', async () => {
    const hasApi = await win.evaluate(() => typeof (window as Window & typeof globalThis).api)
    const hasGithub = await win.evaluate(
      () => typeof (window as Window & typeof globalThis).api.github
    )
    const hasRequire = await win.evaluate(
      () => typeof (window as Window & typeof globalThis & { require?: unknown }).require
    )
    const hasProcess = await win.evaluate(
      () => typeof (window as Window & typeof globalThis & { process?: unknown }).process
    )

    expect(hasApi).toBe('object')
    expect(hasGithub).toBe('object')
    expect(hasRequire).toBe('undefined')
    expect(hasProcess).toBe('undefined')
  })
})
