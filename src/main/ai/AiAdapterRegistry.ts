import type {
  AiConnectionKind,
  AiConnectionTestResult,
  AiModelInfo,
  AiUsageEstimate,
  AiUsageEstimateRequest,
} from '../../core/ai/types.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { AiAdapter, AiStructuredRequest } from './types.js'

export type AiAdapterMap = Record<AiConnectionKind, AiAdapter>

/** Routes a saved connection to the adapter for its kind. */
export class AiAdapterRegistry implements AiAdapter {
  constructor(
    private readonly connections: IAiConnectionService,
    private readonly adapters: AiAdapterMap
  ) {}

  async testConnection(connectionId: string): Promise<AiConnectionTestResult> {
    return (await this.resolve(connectionId)).testConnection(connectionId)
  }

  async listModels(connectionId: string): Promise<AiModelInfo[]> {
    return (await this.resolve(connectionId)).listModels(connectionId)
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    return (await this.resolve(request.connectionId)).generateStructured(request)
  }

  async estimateUsage(request: AiUsageEstimateRequest): Promise<AiUsageEstimate> {
    return (await this.resolve(request.connectionId)).estimateUsage(request)
  }

  async cancel(requestId: string): Promise<void> {
    await Promise.all(Object.values(this.adapters).map((adapter) => adapter.cancel(requestId)))
  }

  private async resolve(connectionId: string): Promise<AiAdapter> {
    const connection = await this.connections.get(connectionId)
    if (!connection) throw new Error(`AI connection not found: ${connectionId}`)
    return this.adapters[connection.kind]
  }
}
