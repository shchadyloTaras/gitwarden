import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { IAiCredentialStore } from '../storage/AiCredentialStore.js'
import type { HttpClient } from '../services/HttpClient.js'
import { AiAdapterRegistry } from './AiAdapterRegistry.js'
import {
  AnthropicAdapter,
  OllamaAdapter,
  OpenAICompatibleAdapter,
  OpenRouterAdapter,
} from './builtInAdapters.js'
import { CustomHttpAdapter } from './CustomHttpAdapter.js'
import { AiSpendGuard } from './spendGuard.js'

export { AiAdapterRegistry } from './AiAdapterRegistry.js'
export type { AiAdapter, AiStructuredRequest } from './types.js'
export { AiSpendGuard } from './spendGuard.js'
export {
  AnthropicAdapter,
  OllamaAdapter,
  OpenAICompatibleAdapter,
  OpenRouterAdapter,
} from './builtInAdapters.js'
export { CustomHttpAdapter } from './CustomHttpAdapter.js'

export function createAiAdapterRegistry(deps: {
  connections: IAiConnectionService
  credentials: IAiCredentialStore
  http: HttpClient
  guard?: AiSpendGuard
}): AiAdapterRegistry {
  const guard = deps.guard ?? new AiSpendGuard()
  const adapterDeps = {
    connections: deps.connections,
    credentials: deps.credentials,
    http: deps.http,
  }
  return new AiAdapterRegistry(deps.connections, {
    openrouter: new OpenRouterAdapter(adapterDeps, guard),
    'openai-compatible': new OpenAICompatibleAdapter(adapterDeps, guard),
    anthropic: new AnthropicAdapter(adapterDeps, guard),
    ollama: new OllamaAdapter(adapterDeps, guard),
    'custom-http': new CustomHttpAdapter(adapterDeps, guard),
  })
}
