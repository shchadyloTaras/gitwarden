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
  AiCommitDraft,
  AiChangeSummary,
  AiChangeReview,
  AiReviewFinding,
  AiSafetyExplanation,
  AiPushBrief,
  AiHistorySummary,
  AiRepoBrief,
  AiAllowlistedFile,
  AiFailureExplanation,
  AiConnectionTemplateExport,
  AiAgenticProposal,
  AiChatTurn,
  AiChatResponse,
  AiChatStreamEvent,
  CustomHttpMapping,
} from '../../core/ai/types.js'
import type { AiPreparedContext } from '../../core/ai/context.js'
import type { ChatBlockSuggestion } from '../../core/ai/chatBlocks.js'

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
      remoteName?: string
      branch?: string
      pushGithub?: {
        assignedLogin?: string
        effectiveLogin?: string
        hasToken: boolean
        tokenInvalid: boolean
      }
    }): Promise<IpcResult<AiPreparedContext>>
    draftCommitMessage(input: {
      repositoryId: string
      commitMessage?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiCommitDraft>>
    summarizeStagedChanges(input: {
      repositoryId: string
      commitMessage?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChangeSummary>>
    reviewStagedChanges(input: {
      repositoryId: string
      commitMessage?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChangeReview>>
    explainSafetyIssue(input: {
      repositoryId: string
      safetyCode: string
    }): Promise<IpcResult<AiSafetyExplanation>>
    generatePushBrief(input: {
      repositoryId: string
      remoteName: string
      branch: string
      github?: {
        assignedLogin?: string
        effectiveLogin?: string
        hasToken: boolean
        tokenInvalid: boolean
      }
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiPushBrief>>
    generateHistorySummary(input: {
      repositoryId: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiHistorySummary>>
    listBuiltInTemplates(): Promise<IpcResult<AiConnectionTemplateExport[]>>
    exportConnectionTemplate(id: string): Promise<IpcResult<AiConnectionTemplateExport>>
    importConnectionTemplate(template: AiConnectionTemplateExport): Promise<IpcResult<AiConnection>>
    duplicateConnection(id: string): Promise<IpcResult<AiConnection>>
    generateRepoBrief(input: {
      repositoryId: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiRepoBrief>>
    explainGitFailure(input: {
      repositoryId: string
      code: string
      userMessage: string
      technicalDetails?: string
    }): Promise<IpcResult<AiFailureExplanation>>
    explainToolOutput(input: {
      repositoryId: string
      output: string
    }): Promise<IpcResult<AiFailureExplanation>>
    proposeAgenticActions(input: {
      repositoryId: string
      prompt: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiAgenticProposal>>
    executeAgenticProposal(input: {
      repositoryId: string
      fileEdits: Array<{ path: string; before?: string; after: string }>
    }): Promise<IpcResult<{ writtenFiles: string[] }>>
    chat(input: {
      repositoryId: string
      message: string
      history?: AiChatTurn[]
      selectedUnstagedPaths?: string[]
      requestId?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChatResponse>>
    chatStream(input: {
      repositoryId: string
      message: string
      history?: AiChatTurn[]
      selectedUnstagedPaths?: string[]
      requestId: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChatResponse>>
    onChatStreamEvent(callback: (event: AiChatStreamEvent) => void): () => void
    chatSuggestBlock(input: {
      repositoryId: string
      message: string
      assistantReply: string
      history?: AiChatTurn[]
      selectedUnstagedPaths?: string[]
      requestId?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<ChatBlockSuggestion>>
  }
  pushBrief: {
    buildDeterministic(input: {
      repositoryId: string
      remoteName: string
      branch: string
      github?: {
        assignedLogin?: string
        effectiveLogin?: string
        hasToken: boolean
        tokenInvalid: boolean
      }
    }): Promise<IpcResult<AiPushBrief>>
  }
  historySummary: {
    buildDeterministic(input: { repositoryId: string }): Promise<IpcResult<AiHistorySummary>>
  }
  repoBrief: {
    buildDeterministic(input: { repositoryId: string }): Promise<IpcResult<AiRepoBrief>>
    listAllowlistedFiles(input: { repositoryId: string }): Promise<IpcResult<AiAllowlistedFile[]>>
  }
  failureExplain: {
    gitFailure(input: {
      repositoryId: string
      code: string
      userMessage: string
      technicalDetails?: string
    }): Promise<IpcResult<AiFailureExplanation>>
    toolOutput(input: {
      repositoryId: string
      output: string
    }): Promise<IpcResult<AiFailureExplanation>>
  }
  changeReview: {
    scanStaged(input: { repositoryId: string }): Promise<IpcResult<AiReviewFinding[]>>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
