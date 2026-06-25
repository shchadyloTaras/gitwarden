// Test-only fakes for the AI Connections feature — wired in ONLY when the env
// flag `GITWARDEN_E2E_FAKE_AI=1` is set (see electron/index.ts). Production never
// constructs these. They let Playwright exercise credential + adapter IPC without
// depending on Electron safeStorage or real AI network calls, while still proving
// the key invariant: the raw secret NEVER crosses back to the renderer — only
// AiCredentialMetadata does.

import type { AiCredentialMetadata } from '../../core/ai/types.js'
import type {
  AiConnectionTestResult,
  AiModelInfo,
  AiUsageEstimate,
  AiUsageEstimateRequest,
} from '../../core/ai/types.js'
import { maskSecret } from '../../core/ai/credentials.js'
import { deriveLocalOnly } from '../../core/ai/transport.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { AiCredentialInput, IAiCredentialStore } from '../storage/AiCredentialStore.js'
import { AiAdapterRegistry } from '../ai/AiAdapterRegistry.js'
import { AiSpendGuard } from '../ai/spendGuard.js'
import type { AiAdapter, AiStructuredRequest } from '../ai/types.js'

const PRIMARY_FIELD = 'apiKey'

interface FakeRecord {
  label: string
  /** fieldName → RAW secret, held in-memory only (never serialized, never sent to renderer). */
  secrets: Record<string, string>
  maskedPreview: string
  secretFields: string[]
  updatedAt: string
}

/** In-memory credential store — same contract as AiCredentialStore, no safeStorage. */
class FakeAiCredentialStore implements IAiCredentialStore {
  private readonly records = new Map<string, FakeRecord>()

  async save(input: AiCredentialInput): Promise<AiCredentialMetadata> {
    const entries = Object.entries(input.secrets)
    if (entries.length === 0) throw new Error('At least one secret field is required')

    const primary = input.secrets[PRIMARY_FIELD] ?? entries[0][1]
    const updatedAt = new Date().toISOString()
    const secretFields = entries.map(([field]) => field)

    this.records.set(input.connectionId, {
      label: input.label,
      secrets: { ...input.secrets },
      maskedPreview: maskSecret(primary),
      secretFields,
      updatedAt,
    })

    return {
      connectionId: input.connectionId,
      label: input.label,
      maskedPreview: maskSecret(primary),
      secretFields,
      updatedAt,
    }
  }

  async getMetadata(connectionId: string): Promise<AiCredentialMetadata | undefined> {
    const record = this.records.get(connectionId)
    if (!record) return undefined
    return {
      connectionId,
      label: record.label,
      maskedPreview: record.maskedPreview,
      secretFields: record.secretFields,
      updatedAt: record.updatedAt,
    }
  }

  async getSecret(connectionId: string, field: string): Promise<string | undefined> {
    return this.records.get(connectionId)?.secrets[field]
  }

  async delete(connectionId: string): Promise<void> {
    this.records.delete(connectionId)
  }
}

export function createAiTestCredentialStore(): IAiCredentialStore {
  return new FakeAiCredentialStore()
}

class FakeAiAdapter implements AiAdapter {
  private readonly guard = new AiSpendGuard()

  constructor(private readonly connections: IAiConnectionService) {}

  async testConnection(connectionId: string): Promise<AiConnectionTestResult> {
    const connection = await this.requireConnection(connectionId)
    const models = await this.listModels(connectionId)
    return {
      connectionId,
      ok: true,
      localOnly: connection.capabilities.localOnly || deriveLocalOnly(connection.baseUrl),
      models,
      message: `Fake adapter returned ${models.length} model(s)`,
    }
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    const connection = await this.requireConnection(connectionId)
    const localOnly = connection.capabilities.localOnly || deriveLocalOnly(connection.baseUrl)
    const ids = fakeModelIds(connection.kind, localOnly)
    return ids.map((id, index) => ({
      id,
      label: index === 0 ? 'Recommended fake model' : undefined,
      structuredOutput: true,
      recommended: index === 0,
      localOnly,
    }))
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    const estimate = this.guard.assertAllowed(request)
    const candidates: unknown[] = [
      {
        summary: 'Fake push brief for e2e.',
        highlights: ['abc1234 — feat: first commit (Alice Dev)'],
      },
      {
        releaseNotesDraft: '## Fake release\n- Initial commit',
        branchActivity: 'One recent commit on main.',
        changelogDraft: '* abc1234 — feat: initial — Alice Dev',
      },
      {
        summary: 'Fake agentic proposal for e2e.',
        actions: [{ kind: 'suggest-navigation', target: 'commit' }],
        fileEdits: [{ path: 'agentic-note.txt', after: 'fake proposal content\n' }],
      },
      {
        projectSummary: 'Fake repo onboarding brief for e2e.',
        buildHint: 'npm run build',
        testHint: 'npm run test',
        likelyBuildCommands: ['npm run build'],
        likelyTestCommands: ['npm run test'],
      },
      { explanation: 'Fake failure explanation for e2e.' },
      {
        explanation:
          'Fake AI safety explanation for e2e. Use the profile assigned to this repository before committing.',
      },
      {
        conventional: 'feat(ai): add fake structured output',
        plain: 'Add fake structured output',
        summary: 'Fake adapter response for e2e.',
      },
      { summary: 'Fake change summary.', highlights: ['No network used.'] },
      {
        findings: [
          {
            category: 'risky-file',
            source: 'ai',
            confidence: 'medium',
            file: 'feature.txt',
            why: 'Fake AI advisory finding for e2e.',
          },
        ],
        overall: 'All clear from the model.',
      },
      { findings: [], overall: 'All clear from the model.' },
      { text: 'ok' },
    ]
    for (const candidate of candidates) {
      const parsed = request.responseSchema.safeParse(candidate)
      if (parsed.success) {
        this.guard.record(estimate)
        return parsed.data
      }
    }
    throw new Error('Fake adapter has no matching structured response fixture')
  }

  estimateUsage(request: AiUsageEstimateRequest): Promise<AiUsageEstimate> {
    return Promise.resolve(this.guard.estimate(request))
  }

  cancel(): Promise<void> {
    return Promise.resolve()
  }

  private async requireConnection(connectionId: string) {
    const connection = await this.connections.get(connectionId)
    if (!connection) throw new Error(`AI connection not found: ${connectionId}`)
    return connection
  }
}

export function createAiTestAdapterRegistry(connections: IAiConnectionService): AiAdapterRegistry {
  const adapter = new FakeAiAdapter(connections)
  return new AiAdapterRegistry(connections, {
    openrouter: adapter,
    'openai-compatible': adapter,
    anthropic: adapter,
    ollama: adapter,
    'custom-http': adapter,
  })
}

function fakeModelIds(kind: string, localOnly: boolean): string[] {
  if (localOnly) return ['local/fake-llama-3.2', 'local/fake-qwen-coder']
  switch (kind) {
    case 'anthropic':
      return ['anthropic/claude-3.5-sonnet', 'anthropic/claude-3-haiku']
    case 'openrouter':
      return ['openrouter/fake-recommended', 'openrouter/fake-fast']
    case 'ollama':
      return ['ollama/fake-local']
    case 'custom-http':
      return ['custom-http/fake-model']
    default:
      return ['openai-compatible/fake-structured']
  }
}
