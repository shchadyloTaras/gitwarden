import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { JsonStore } from '../../src/main/storage/JsonStore.js'

const ItemSchema = z.object({ value: z.number() })
type Item = z.infer<typeof ItemSchema>

let tmpDir: string
let storePath: string
let store: JsonStore<Item>

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-json-store-'))
  storePath = path.join(tmpDir, 'test.json')
  store = new JsonStore(storePath, ItemSchema, { value: 0 })
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

describe('JsonStore', () => {
  it('returns defaults when the file does not exist', async () => {
    const data = await store.read()
    expect(data).toEqual({ value: 0 })
  })

  it('writes and reads back correctly', async () => {
    await store.write({ value: 42 })
    const data = await store.read()
    expect(data).toEqual({ value: 42 })
  })

  it('creates the directory if it does not exist', async () => {
    const nested = new JsonStore(path.join(tmpDir, 'nested', 'deep', 'data.json'), ItemSchema, {
      value: 0,
    })
    await nested.write({ value: 7 })
    expect(await nested.read()).toEqual({ value: 7 })
  })

  it('throws ZodError when stored JSON is malformed', async () => {
    await fsPromises.writeFile(storePath, JSON.stringify({ value: 'not-a-number' }), 'utf8')
    await expect(store.read()).rejects.toThrow()
  })

  it('throws ZodError when stored JSON has unexpected structure', async () => {
    await fsPromises.writeFile(storePath, JSON.stringify({ wrong: true }), 'utf8')
    await expect(store.read()).rejects.toThrow()
  })

  describe('atomic write', () => {
    it('leaves the original file intact when process crashes after .tmp is written', async () => {
      // Simulate: normal write succeeded (original = {value:1})
      await store.write({ value: 1 })

      // Simulate: process crashed after writing .tmp but before rename
      await fsPromises.writeFile(`${storePath}.tmp`, JSON.stringify({ value: 99 }, null, 2), 'utf8')

      // On next startup, read must return the original — not the orphaned .tmp
      const data = await store.read()
      expect(data).toEqual({ value: 1 })
    })

    it('does not leave a .tmp file after a successful write', async () => {
      await store.write({ value: 5 })
      await expect(fsPromises.access(`${storePath}.tmp`)).rejects.toThrow()
    })

    it('overwrites previous content on successive writes', async () => {
      await store.write({ value: 10 })
      await store.write({ value: 20 })
      expect(await store.read()).toEqual({ value: 20 })
    })
  })

  describe('update() — atomic read-modify-write (Phase 90, W19)', () => {
    it('applies a single transaction correctly', async () => {
      await store.write({ value: 1 })
      const result = await store.update((current) => ({ value: current.value + 1 }))
      expect(result).toEqual({ value: 2 })
      expect(await store.read()).toEqual({ value: 2 })
    })

    it('serializes two concurrent transactions instead of losing one (the actual race)', async () => {
      await store.write({ value: 0 })
      // Both transactions start from the SAME on-disk snapshot ({value: 0}) if run as
      // plain read()+write() — a naive read-modify-write would let whichever WRITES
      // LAST win, silently discarding the other's +1. update() must serialize them so
      // both increments land.
      const [a, b] = await Promise.all([
        store.update((current) => ({ value: current.value + 1 })),
        store.update((current) => ({ value: current.value + 1 })),
      ])
      expect([a.value, b.value].sort()).toEqual([1, 2])
      expect(await store.read()).toEqual({ value: 2 })
    })

    it('runs many concurrent increments without losing any', async () => {
      await store.write({ value: 0 })
      await Promise.all(
        Array.from({ length: 20 }, () => store.update((current) => ({ value: current.value + 1 })))
      )
      expect(await store.read()).toEqual({ value: 20 })
    })

    it('a rejected transaction does not wedge the queue for the next caller', async () => {
      await store.write({ value: 1 })
      await expect(
        store.update(() => {
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')

      const result = await store.update((current) => ({ value: current.value + 1 }))
      expect(result).toEqual({ value: 2 })
    })
  })
})
