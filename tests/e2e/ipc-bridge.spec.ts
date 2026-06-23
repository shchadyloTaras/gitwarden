import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'

test.describe('IPC bridge & security', () => {
  test('window.api is exposed; window.require and window.process are absent', async () => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../../out/main/index.js')],
    })

    try {
      const win = await app.firstWindow()
      await win.waitForLoadState('domcontentloaded')

      const hasApi = await win.evaluate(() => typeof (window as Window & typeof globalThis).api)
      const hasRequire = await win.evaluate(
        () => typeof (window as Window & typeof globalThis & { require?: unknown }).require
      )
      const hasProcess = await win.evaluate(
        () => typeof (window as Window & typeof globalThis & { process?: unknown }).process
      )

      expect(hasApi).toBe('object')
      expect(hasRequire).toBe('undefined')
      expect(hasProcess).toBe('undefined')
    } finally {
      await app.close()
    }
  })

  test('profiles:list round-trips through IPC', async () => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../../out/main/index.js')],
    })

    try {
      const win = await app.firstWindow()
      await win.waitForLoadState('domcontentloaded')

      const result = await win.evaluate(async () => {
        return (window as Window & typeof globalThis).api.profiles.list()
      })

      expect(result).toMatchObject({ ok: true, data: expect.any(Array) })
    } finally {
      await app.close()
    }
  })

  test('profiles:create with invalid payload returns Zod error', async () => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../../out/main/index.js')],
    })

    try {
      const win = await app.firstWindow()
      await win.waitForLoadState('domcontentloaded')

      // Send garbage — should be rejected by Zod on the main side and come back as ok:false
      const result = await win.evaluate(async () => {
        return (window as Window & typeof globalThis).api.profiles.create(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { not_a_real_field: true } as any
        )
      })

      expect(result).toMatchObject({ ok: false, error: expect.any(String) })
    } finally {
      await app.close()
    }
  })
})
