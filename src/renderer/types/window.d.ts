import type {
  Profile,
  RepositoryRecord,
  AppSettings,
  GitStatus,
  EffectiveGitIdentity,
  GitRemote,
  GitBranch,
  GitCommit,
  GitHubDeviceCode,
  LinkedGitHubAccount,
  GitHubAccount,
  GitHubAuthStatus,
  GitHubAuthErrorCode,
} from '../../core/types.js'
import type {
  AiConnection,
  AiConnectionKind,
  AiConnectionTestResult,
  AiCredentialMetadata,
  AiModelInfo,
  AiPrivacyMode,
  AiProviderDetection,
  AiRetentionState,
  AiUsageEstimate,
  AiUsageEstimateRequest,
  CustomHttpMapping,
} from '../../core/ai/types.js'
import type { AiPreparedContext } from '../../core/ai/context.js'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

interface AiConnectionsView {
  connections: AiConnection[]
  activeConnectionId?: string
}

interface AiConnectionCreateInput {
  name: string
  kind: AiConnectionKind
  baseUrl?: string
  defaultModel?: string
  privacyMode?: AiPrivacyMode
  retention?: AiRetentionState
  enabled?: boolean
  customHttpMapping?: CustomHttpMapping
}

type AiConnectionPatch = Partial<{
  name: string
  kind: AiConnectionKind
  baseUrl: string
  defaultModel: string
  privacyMode: AiPrivacyMode
  retention: AiRetentionState
  enabled: boolean
  customHttpMapping: CustomHttpMapping
}>

interface AiProviderDetectionResult {
  detection: AiProviderDetection
  maskedKeyLabel: string
}

/** Auth progress pushed from main over `github:authEvent`. Mirrors GitHubAuthEventPayload. */
interface GitHubAuthEvent {
  profileId: string
  status: GitHubAuthStatus
  errorCode?: GitHubAuthErrorCode
  account?: LinkedGitHubAccount
  identity?: GitHubAccount
}

/** Token-side facts for the push safety check — never includes the token itself. */
interface GitHubPushStatus {
  hasToken: boolean
  tokenInvalid: boolean
  effectiveLogin?: string
}

interface ElectronAPI {
  dialog: {
    openDirectory(): Promise<IpcResult<string | null>>
  }
  shell: {
    openExternal(url: string): Promise<IpcResult<null>>
  }
  profiles: {
    list(): Promise<IpcResult<Profile[]>>
    get(id: string): Promise<IpcResult<Profile | undefined>>
    create(input: Omit<Profile, 'id'>): Promise<IpcResult<Profile>>
    update(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<IpcResult<Profile>>
    delete(id: string): Promise<IpcResult<void>>
  }
  repositories: {
    list(): Promise<IpcResult<RepositoryRecord[]>>
    get(id: string): Promise<IpcResult<RepositoryRecord | undefined>>
    create(input: Omit<RepositoryRecord, 'id'>): Promise<IpcResult<RepositoryRecord>>
    update(
      id: string,
      patch: Partial<Omit<RepositoryRecord, 'id'>>
    ): Promise<IpcResult<RepositoryRecord>>
    delete(id: string): Promise<IpcResult<void>>
  }
  settings: {
    get(): Promise<IpcResult<AppSettings>>
    update(patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>>
  }
  git: {
    getStatus(repoPath: string): Promise<IpcResult<GitStatus>>
    getEffectiveIdentity(repoPath: string): Promise<IpcResult<EffectiveGitIdentity>>
    validateRepository(repoPath: string): Promise<IpcResult<{ name: string; remoteUrl?: string }>>
    stageFile(repoPath: string, filePath: string): Promise<IpcResult<void>>
    unstageFile(repoPath: string, filePath: string): Promise<IpcResult<void>>
    stageAll(repoPath: string): Promise<IpcResult<void>>
    unstageAll(repoPath: string): Promise<IpcResult<void>>
    getDiff(repoPath: string, filePath: string, staged: boolean): Promise<IpcResult<string>>
    commit(repoPath: string, message: string): Promise<IpcResult<{ hash: string }>>
    setLocalIdentity(repoPath: string, name: string, email: string): Promise<IpcResult<void>>
    getRemotes(repoPath: string): Promise<IpcResult<GitRemote[]>>
    fetch(repoPath: string, remote: string): Promise<IpcResult<void>>
    pull(repoPath: string, remote: string, branch: string): Promise<IpcResult<void>>
    push(repoPath: string, remote: string, branch: string): Promise<IpcResult<void>>
    getBranches(repoPath: string): Promise<IpcResult<GitBranch[]>>
    switchBranch(repoPath: string, branch: string): Promise<IpcResult<void>>
    createBranch(repoPath: string, name: string): Promise<IpcResult<void>>
    deleteBranch(repoPath: string, branch: string): Promise<IpcResult<void>>
    getCommitHistory(repoPath: string, limit: number, skip: number): Promise<IpcResult<GitCommit[]>>
    discardFile(repoPath: string, filePath: string): Promise<IpcResult<void>>
    cleanFile(repoPath: string, filePath: string): Promise<IpcResult<void>>
    validateGitPath(gitPath: string): Promise<IpcResult<{ version: string }>>
  }
  github: {
    startDeviceAuth(profileId: string): Promise<IpcResult<GitHubDeviceCode>>
    cancelDeviceAuth(profileId: string): Promise<IpcResult<null>>
    disconnect(profileId: string): Promise<IpcResult<null>>
    getLinkedAccount(profileId: string): Promise<IpcResult<LinkedGitHubAccount | null>>
    getPushContext(profileId: string): Promise<IpcResult<GitHubPushStatus>>
    onAuthEvent(callback: (event: GitHubAuthEvent) => void): () => void
  }
  ai: {
    listConnections(): Promise<IpcResult<AiConnectionsView>>
    createConnection(input: AiConnectionCreateInput): Promise<IpcResult<AiConnection>>
    updateConnection(id: string, patch: AiConnectionPatch): Promise<IpcResult<AiConnection>>
    deleteConnection(id: string): Promise<IpcResult<null>>
    setActiveConnection(id: string | null): Promise<IpcResult<null>>
    saveCredential(
      connectionId: string,
      label: string,
      secrets: Record<string, string>
    ): Promise<IpcResult<AiCredentialMetadata>>
    deleteCredential(connectionId: string): Promise<IpcResult<null>>
    getCredentialMetadata(connectionId: string): Promise<IpcResult<AiCredentialMetadata | null>>
    detectProvider(apiKey: string): Promise<IpcResult<AiProviderDetectionResult>>
    testConnection(connectionId: string): Promise<IpcResult<AiConnectionTestResult>>
    listModels(connectionId: string): Promise<IpcResult<AiModelInfo[]>>
    estimateUsage(request: AiUsageEstimateRequest): Promise<IpcResult<AiUsageEstimate>>
    cancel(requestId: string): Promise<IpcResult<null>>
    previewContext(input: {
      repositoryId: string
      kind: AiUsageEstimateRequest['kind']
      selectedUnstagedPaths?: string[]
      commitMessage?: string
    }): Promise<IpcResult<AiPreparedContext>>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
