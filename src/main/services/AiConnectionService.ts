import type {
  AiConnection,
  AiConnectionKind,
  AiConnectionCapabilities,
  AiConnectionTemplateExport,
  AiPrivacyMode,
  AiRetentionState,
  CustomHttpMapping,
} from '../../core/ai/types.js'
import {
  AiConnectionSchema,
  AiConnectionTemplateExportSchema,
  type AiConnectionsData,
} from '../../core/ai/schemas.js'
import {
  assertTemplateHasNoSecrets,
  BUILTIN_CONNECTION_TEMPLATES,
  connectionToTemplateExport,
} from '../../core/ai/connectionTemplates.js'
import { deriveLocalOnly } from '../../core/ai/transport.js'
import type { JsonStore } from '../storage/JsonStore.js'

// CRUD over the NON-SECRET connection records (AiConnection[]) plus the single
// "active connection" pointer for the MVP UI (§1). Secrets live in
// AiCredentialStore, keyed by connectionId — never here. Each record is validated
// through AiConnectionSchema (which enforces the transport gate on baseUrl) before
// it is written, so a malformed connection is rejected at the service boundary,
// not on the next read.

/** What the renderer needs to render the single-active-connection UI. */
export interface AiConnectionsView {
  connections: AiConnection[]
  activeConnectionId?: string
}

/** Fields the renderer may set when creating a connection; the rest is derived. */
export interface AiConnectionCreateInput {
  name: string
  kind: AiConnectionKind
  baseUrl?: string
  defaultModel?: string
  privacyMode?: AiPrivacyMode
  retention?: AiRetentionState
  enabled?: boolean
  customHttpMapping?: CustomHttpMapping
}

/** Editable fields on an existing connection. */
export type AiConnectionPatch = Partial<{
  name: string
  kind: AiConnectionKind
  baseUrl: string
  defaultModel: string
  privacyMode: AiPrivacyMode
  retention: AiRetentionState
  enabled: boolean
  customHttpMapping: CustomHttpMapping
}>

export interface IAiConnectionService {
  list(): Promise<AiConnectionsView>
  get(id: string): Promise<AiConnection | undefined>
  create(input: AiConnectionCreateInput): Promise<AiConnection>
  update(id: string, patch: AiConnectionPatch): Promise<AiConnection>
  delete(id: string): Promise<void>
  setActive(id: string | null): Promise<void>
  duplicate(id: string): Promise<AiConnection>
  exportTemplate(id: string): Promise<AiConnectionTemplateExport>
  importTemplate(template: AiConnectionTemplateExport): Promise<AiConnection>
  listBuiltInTemplates(): Promise<AiConnectionTemplateExport[]>
}

export class AiConnectionService implements IAiConnectionService {
  constructor(
    private readonly store: JsonStore<AiConnectionsData>,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  async list(): Promise<AiConnectionsView> {
    const data = await this.store.read()
    return {
      connections: data.connections,
      // Treat a dangling active id (deleted connection) as "no active".
      activeConnectionId: data.connections.some((c) => c.id === data.activeConnectionId)
        ? data.activeConnectionId
        : undefined,
    }
  }

  async get(id: string): Promise<AiConnection | undefined> {
    return (await this.store.read()).connections.find((c) => c.id === id)
  }

  async create(input: AiConnectionCreateInput): Promise<AiConnection> {
    const data = await this.store.read()
    const timestamp = this.now()
    const connection: AiConnection = AiConnectionSchema.parse({
      id: this.newId(),
      name: input.name,
      kind: input.kind,
      enabled: input.enabled ?? true,
      baseUrl: input.baseUrl,
      defaultModel: input.defaultModel,
      privacyMode: input.privacyMode ?? 'preview-each',
      retention:
        input.retention ?? defaultRetention(input.kind, input.baseUrl, input.customHttpMapping),
      capabilities: defaultCapabilities(input.kind, input.baseUrl, input.customHttpMapping),
      customHttpMapping: input.customHttpMapping,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    data.connections.push(connection)
    // First connection becomes active automatically (single-active-connection UX).
    if (data.activeConnectionId === undefined) data.activeConnectionId = connection.id
    await this.store.write(data)
    return connection
  }

  async update(id: string, patch: AiConnectionPatch): Promise<AiConnection> {
    const data = await this.store.read()
    const idx = data.connections.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error(`AI connection not found: ${id}`)

    const current = data.connections[idx]
    const baseUrl = 'baseUrl' in patch ? patch.baseUrl : current.baseUrl
    const kind = patch.kind ?? current.kind
    const customHttpMapping =
      'customHttpMapping' in patch ? patch.customHttpMapping : current.customHttpMapping
    const merged: AiConnection = AiConnectionSchema.parse({
      ...current,
      ...patch,
      baseUrl,
      kind,
      customHttpMapping,
      // Recompute the host-derived localOnly whenever the base URL/kind changes.
      capabilities: {
        ...defaultCapabilities(kind, baseUrl, customHttpMapping),
        localOnly: deriveConnectionLocalOnly(kind, baseUrl, customHttpMapping),
      },
      updatedAt: this.now(),
    })

    data.connections[idx] = merged
    await this.store.write(data)
    return merged
  }

  async delete(id: string): Promise<void> {
    const data = await this.store.read()
    const remaining = data.connections.filter((c) => c.id !== id)
    if (remaining.length === data.connections.length) {
      throw new Error(`AI connection not found: ${id}`)
    }
    data.connections = remaining
    if (data.activeConnectionId === id) data.activeConnectionId = undefined
    await this.store.write(data)
  }

  async setActive(id: string | null): Promise<void> {
    const data = await this.store.read()
    if (id !== null && !data.connections.some((c) => c.id === id)) {
      throw new Error(`AI connection not found: ${id}`)
    }
    data.activeConnectionId = id ?? undefined
    await this.store.write(data)
  }

  async duplicate(id: string): Promise<AiConnection> {
    const source = await this.get(id)
    if (!source) throw new Error(`AI connection not found: ${id}`)
    return this.create({
      name: `${source.name} (copy)`,
      kind: source.kind,
      baseUrl: source.baseUrl,
      defaultModel: source.defaultModel,
      privacyMode: source.privacyMode,
      retention: source.retention,
      customHttpMapping: source.customHttpMapping,
      enabled: false,
    })
  }

  async exportTemplate(id: string): Promise<AiConnectionTemplateExport> {
    const source = await this.get(id)
    if (!source) throw new Error(`AI connection not found: ${id}`)
    const template = connectionToTemplateExport(source)
    assertTemplateHasNoSecrets(template)
    return AiConnectionTemplateExportSchema.parse(template)
  }

  async importTemplate(template: AiConnectionTemplateExport): Promise<AiConnection> {
    const parsed = AiConnectionTemplateExportSchema.parse(template)
    assertTemplateHasNoSecrets(parsed)
    return this.create({
      name: parsed.name,
      kind: parsed.kind,
      baseUrl: parsed.baseUrl,
      defaultModel: parsed.defaultModel,
      privacyMode: parsed.privacyMode,
      retention: parsed.retention,
      customHttpMapping: parsed.customHttpMapping,
      enabled: false,
    })
  }

  listBuiltInTemplates(): Promise<AiConnectionTemplateExport[]> {
    return Promise.resolve(BUILTIN_CONNECTION_TEMPLATES)
  }
}

/** Local (loopback) endpoints are the safest; remote endpoints need explicit acceptance. */
function defaultRetention(
  kind: AiConnectionKind,
  baseUrl: string | undefined,
  customHttpMapping: CustomHttpMapping | undefined
): AiRetentionState {
  return deriveConnectionLocalOnly(kind, baseUrl, customHttpMapping) ? 'zero-retention' : 'unknown'
}

/**
 * Sensible default capabilities per kind. Phase 30 adapters confirm these against
 * the live endpoint; `localOnly` is always derived from the host, never the kind (§4).
 */
function defaultCapabilities(
  kind: AiConnectionKind,
  baseUrl: string | undefined,
  customHttpMapping: CustomHttpMapping | undefined
): AiConnectionCapabilities {
  const localOnly = deriveConnectionLocalOnly(kind, baseUrl, customHttpMapping)
  if (kind === 'custom-http') {
    return { structuredOutput: true, streaming: false, modelList: false, usage: false, localOnly }
  }
  return {
    structuredOutput: true,
    streaming: true,
    modelList: true,
    usage: kind !== 'ollama',
    localOnly,
  }
}

function deriveConnectionLocalOnly(
  kind: AiConnectionKind,
  baseUrl: string | undefined,
  customHttpMapping: CustomHttpMapping | undefined
): boolean {
  if (kind === 'custom-http') return deriveLocalOnly(customHttpMapping?.url ?? baseUrl)
  if (kind === 'ollama') return deriveLocalOnly(baseUrl ?? 'http://localhost:11434')
  return deriveLocalOnly(baseUrl)
}
