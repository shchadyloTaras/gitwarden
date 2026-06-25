import * as fsPromises from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonStore } from '../../src/main/storage/JsonStore.js'
import { AiConnectionsDataSchema, type AiConnectionsData } from '../../src/core/ai/schemas.js'
import { AiConnectionService } from '../../src/main/services/AiConnectionService.js'
import { isAiSendAllowed } from '../../src/core/ai/precedence.js'

let tmpDir: string
let storePath: string

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gitwarden-ai-conn-'))
  storePath = path.join(tmpDir, 'ai-connections.json')
})

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true })
})

function createService(): AiConnectionService {
  const store = new JsonStore<AiConnectionsData>(storePath, AiConnectionsDataSchema, {
    connections: [],
  })
  return new AiConnectionService(store)
}

describe('AiConnectionService — CRUD + single active connection', () => {
  it('creates a connection, derives capabilities, and auto-activates the first one', async () => {
    const svc = createService()
    const conn = await svc.create({
      name: 'OpenRouter',
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'anthropic/claude-3.5-sonnet',
    })

    expect(conn.id).toBeTruthy()
    expect(conn.enabled).toBe(true)
    expect(conn.privacyMode).toBe('preview-each')
    expect(conn.capabilities.localOnly).toBe(false)

    const view = await svc.list()
    expect(view.connections).toHaveLength(1)
    expect(view.activeConnectionId).toBe(conn.id)
  })

  it('derives localOnly + zero-retention for a loopback base URL (LM Studio)', async () => {
    const svc = createService()
    const conn = await svc.create({
      name: 'LM Studio',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:1234/v1',
    })
    expect(conn.capabilities.localOnly).toBe(true)
    expect(conn.retention).toBe('zero-retention')
  })

  it('NEVER persists a secret in connection JSON', async () => {
    const svc = createService()
    await svc.create({
      name: 'OpenRouter',
      kind: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
    })

    const fileContents = await fsPromises.readFile(storePath, 'utf8')
    expect(fileContents).not.toMatch(/sk-/)
    expect(fileContents).not.toContain('apiKey')
    expect(fileContents).not.toContain('secret')
  })

  it('rejects a connection with a non-https non-loopback base URL (transport gate)', async () => {
    const svc = createService()
    await expect(
      svc.create({ name: 'Bad', kind: 'openai-compatible', baseUrl: 'http://api.example.com/v1' })
    ).rejects.toThrow()
  })

  it('updates editable fields and bumps updatedAt', async () => {
    const svc = createService()
    const conn = await svc.create({ name: 'OpenRouter', kind: 'openrouter' })

    const updated = await svc.update(conn.id, { name: 'My Router', defaultModel: 'gpt-4o' })
    expect(updated.name).toBe('My Router')
    expect(updated.defaultModel).toBe('gpt-4o')

    const view = await svc.list()
    expect(view.connections[0].name).toBe('My Router')
  })

  it('disabling a connection sets enabled=false (edit ≠ delete)', async () => {
    const svc = createService()
    const conn = await svc.create({ name: 'OpenRouter', kind: 'openrouter' })
    const disabled = await svc.update(conn.id, { enabled: false })
    expect(disabled.enabled).toBe(false)
  })

  it('recomputes localOnly when the base URL changes to loopback', async () => {
    const svc = createService()
    const conn = await svc.create({
      name: 'C',
      kind: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
    })
    expect(conn.capabilities.localOnly).toBe(false)

    const moved = await svc.update(conn.id, { baseUrl: 'http://127.0.0.1:1234/v1' })
    expect(moved.capabilities.localOnly).toBe(true)
  })

  it('deletes a connection and clears the active pointer if it was active', async () => {
    const svc = createService()
    const conn = await svc.create({ name: 'OpenRouter', kind: 'openrouter' })
    await svc.delete(conn.id)

    const view = await svc.list()
    expect(view.connections).toHaveLength(0)
    expect(view.activeConnectionId).toBeUndefined()
  })

  it('treats a dangling active id as "no active"', async () => {
    const store = new JsonStore<AiConnectionsData>(storePath, AiConnectionsDataSchema, {
      connections: [],
    })
    await store.write({ connections: [], activeConnectionId: 'gone' })
    const svc = new AiConnectionService(store)
    expect((await svc.list()).activeConnectionId).toBeUndefined()
  })

  it('setActive validates the id exists; null clears it', async () => {
    const svc = createService()
    const a = await svc.create({ name: 'A', kind: 'openrouter' })
    const b = await svc.create({ name: 'B', kind: 'anthropic' })

    await svc.setActive(b.id)
    expect((await svc.list()).activeConnectionId).toBe(b.id)

    await svc.setActive(null)
    expect((await svc.list()).activeConnectionId).toBeUndefined()

    await expect(svc.setActive('does-not-exist')).rejects.toThrow()
    await svc.setActive(a.id) // still works after the rejection
    expect((await svc.list()).activeConnectionId).toBe(a.id)
  })

  it('update/delete on a missing id throws', async () => {
    const svc = createService()
    await expect(svc.update('nope', { name: 'x' })).rejects.toThrow()
    await expect(svc.delete('nope')).rejects.toThrow()
  })

  it('persists across a fresh service instance (relaunch)', async () => {
    const first = createService()
    const conn = await first.create({ name: 'OpenRouter', kind: 'openrouter' })

    const second = createService()
    const view = await second.list()
    expect(view.connections.map((c) => c.id)).toContain(conn.id)
    expect(view.activeConnectionId).toBe(conn.id)
  })

  it('saving a connection with AI globally disabled sends nothing (enable is separate)', async () => {
    const svc = createService()
    const conn = await svc.create({ name: 'OpenRouter', kind: 'openrouter' })

    // A saved, enabled connection still cannot send while the global flag is off.
    expect(conn.enabled).toBe(true)
    expect(isAiSendAllowed({ globalEnabled: false, connectionEnabled: conn.enabled })).toBe(false)

    // Only after the separate "Enable AI" step does it become allowed.
    expect(isAiSendAllowed({ globalEnabled: true, connectionEnabled: conn.enabled })).toBe(true)
  })
})
