import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
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
} from '../src/core/types.js'
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
} from '../src/core/ai/types.js'
import type { AiPreparedContext } from '../src/core/ai/context.js'
import type { ChatBlockSuggestion } from '../src/core/ai/chatBlocks.js'
import type { UpdateCheckResult } from '../src/core/updates/types.js'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Renderer view of the single-active-connection state. */
export interface AiConnectionsView {
  connections: AiConnection[]
  activeConnectionId?: string
}

/** Fields the renderer may set when creating a connection; the rest is derived in main. */
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

/** Detection result + a masked key label; the raw key never crosses back. */
export interface AiProviderDetectionResult {
  detection: AiProviderDetection
  maskedKeyLabel: string
}

/** Auth progress pushed from main over `github:authEvent`. Mirrors GitHubAuthEventPayload. */
export interface GitHubAuthEvent {
  profileId: string
  status: GitHubAuthStatus
  errorCode?: GitHubAuthErrorCode
  account?: LinkedGitHubAccount
  identity?: GitHubAccount
}

/** Token-side facts for the push safety check — never includes the token itself. */
export interface GitHubPushStatus {
  hasToken: boolean
  tokenInvalid: boolean
  effectiveLogin?: string
}

const GITHUB_AUTH_EVENT_CHANNEL = 'github:authEvent'
const AI_CHAT_STREAM_EVENT_CHANNEL = 'ai:chatStreamEvent'

function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
}

export const api = {
  dialog: {
    openDirectory: (): Promise<IpcResult<string | null>> => invoke('dialog:openDirectory'),
  },
  shell: {
    openExternal: (url: string): Promise<IpcResult<null>> => invoke('shell:openExternal', { url }),
  },
  profiles: {
    list: (): Promise<IpcResult<Profile[]>> => invoke('profiles:list'),
    get: (id: string): Promise<IpcResult<Profile | undefined>> => invoke('profiles:get', { id }),
    create: (input: Omit<Profile, 'id'>): Promise<IpcResult<Profile>> =>
      invoke('profiles:create', input),
    update: (id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<IpcResult<Profile>> =>
      invoke('profiles:update', { id, patch }),
    delete: (id: string): Promise<IpcResult<void>> => invoke('profiles:delete', { id }),
  },
  repositories: {
    list: (): Promise<IpcResult<RepositoryRecord[]>> => invoke('repositories:list'),
    get: (id: string): Promise<IpcResult<RepositoryRecord | undefined>> =>
      invoke('repositories:get', { id }),
    create: (input: Omit<RepositoryRecord, 'id'>): Promise<IpcResult<RepositoryRecord>> =>
      invoke('repositories:create', input),
    update: (
      id: string,
      patch: Partial<Omit<RepositoryRecord, 'id'>>
    ): Promise<IpcResult<RepositoryRecord>> => invoke('repositories:update', { id, patch }),
    delete: (id: string): Promise<IpcResult<void>> => invoke('repositories:delete', { id }),
  },
  settings: {
    get: (): Promise<IpcResult<AppSettings>> => invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>> =>
      invoke('settings:update', patch),
  },
  git: {
    getStatus: (repoPath: string): Promise<IpcResult<GitStatus>> =>
      invoke('git:getStatus', { repoPath }),
    getEffectiveIdentity: (repoPath: string): Promise<IpcResult<EffectiveGitIdentity>> =>
      invoke('git:getEffectiveIdentity', { repoPath }),
    validateRepository: (
      repoPath: string
    ): Promise<IpcResult<{ name: string; remoteUrl?: string }>> =>
      invoke('git:validateRepository', { repoPath }),
    stageFile: (repoPath: string, filePath: string): Promise<IpcResult<void>> =>
      invoke('git:stageFile', { repoPath, filePath }),
    unstageFile: (repoPath: string, filePath: string): Promise<IpcResult<void>> =>
      invoke('git:unstageFile', { repoPath, filePath }),
    stageAll: (repoPath: string): Promise<IpcResult<void>> => invoke('git:stageAll', { repoPath }),
    unstageAll: (repoPath: string): Promise<IpcResult<void>> =>
      invoke('git:unstageAll', { repoPath }),
    getDiff: (repoPath: string, filePath: string, staged: boolean): Promise<IpcResult<string>> =>
      invoke('git:getDiff', { repoPath, filePath, staged }),
    commit: (repoPath: string, message: string): Promise<IpcResult<{ hash: string }>> =>
      invoke('git:commit', { repoPath, message }),
    setLocalIdentity: (repoPath: string, name: string, email: string): Promise<IpcResult<void>> =>
      invoke('git:setLocalIdentity', { repoPath, name, email }),
    getRemotes: (repoPath: string): Promise<IpcResult<GitRemote[]>> =>
      invoke('git:getRemotes', { repoPath }),
    fetch: (repoPath: string, remote: string): Promise<IpcResult<void>> =>
      invoke('git:fetch', { repoPath, remote }),
    pull: (repoPath: string, remote: string, branch: string): Promise<IpcResult<void>> =>
      invoke('git:pull', { repoPath, remote, branch }),
    push: (repoPath: string, remote: string, branch: string): Promise<IpcResult<void>> =>
      invoke('git:push', { repoPath, remote, branch }),
    getBranches: (repoPath: string): Promise<IpcResult<GitBranch[]>> =>
      invoke('git:getBranches', { repoPath }),
    switchBranch: (repoPath: string, branch: string): Promise<IpcResult<void>> =>
      invoke('git:switchBranch', { repoPath, branch }),
    createBranch: (repoPath: string, name: string): Promise<IpcResult<void>> =>
      invoke('git:createBranch', { repoPath, name }),
    deleteBranch: (repoPath: string, branch: string): Promise<IpcResult<void>> =>
      invoke('git:deleteBranch', { repoPath, branch }),
    getCommitHistory: (
      repoPath: string,
      limit: number,
      skip: number
    ): Promise<IpcResult<GitCommit[]>> => invoke('git:getCommitHistory', { repoPath, limit, skip }),
    discardFile: (repoPath: string, filePath: string): Promise<IpcResult<void>> =>
      invoke('git:discardFile', { repoPath, filePath }),
    cleanFile: (repoPath: string, filePath: string): Promise<IpcResult<void>> =>
      invoke('git:cleanFile', { repoPath, filePath }),
    validateGitPath: (gitPath: string): Promise<IpcResult<{ version: string }>> =>
      invoke('git:validateGitPath', { gitPath }),
  },
  github: {
    startDeviceAuth: (profileId: string): Promise<IpcResult<GitHubDeviceCode>> =>
      invoke('github:startDeviceAuth', { profileId }),
    cancelDeviceAuth: (profileId: string): Promise<IpcResult<null>> =>
      invoke('github:cancelDeviceAuth', { profileId }),
    disconnect: (profileId: string): Promise<IpcResult<null>> =>
      invoke('github:disconnect', { profileId }),
    getLinkedAccount: (profileId: string): Promise<IpcResult<LinkedGitHubAccount | null>> =>
      invoke('github:getLinkedAccount', { profileId }),
    getPushContext: (profileId: string): Promise<IpcResult<GitHubPushStatus>> =>
      invoke('github:getPushContext', { profileId }),
    /** Subscribe to auth progress events; returns an unsubscribe function. */
    onAuthEvent: (callback: (event: GitHubAuthEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: GitHubAuthEvent): void => callback(payload)
      ipcRenderer.on(GITHUB_AUTH_EVENT_CHANNEL, listener)
      return () => ipcRenderer.removeListener(GITHUB_AUTH_EVENT_CHANNEL, listener)
    },
  },
  ai: {
    listConnections: (): Promise<IpcResult<AiConnectionsView>> => invoke('ai:listConnections'),
    createConnection: (input: AiConnectionCreateInput): Promise<IpcResult<AiConnection>> =>
      invoke('ai:createConnection', input),
    updateConnection: (id: string, patch: AiConnectionPatch): Promise<IpcResult<AiConnection>> =>
      invoke('ai:updateConnection', { id, patch }),
    deleteConnection: (id: string): Promise<IpcResult<null>> =>
      invoke('ai:deleteConnection', { id }),
    setActiveConnection: (id: string | null): Promise<IpcResult<null>> =>
      invoke('ai:setActiveConnection', { id }),
    saveCredential: (
      connectionId: string,
      label: string,
      secrets: Record<string, string>
    ): Promise<IpcResult<AiCredentialMetadata>> =>
      invoke('ai:saveCredential', { connectionId, label, secrets }),
    deleteCredential: (connectionId: string): Promise<IpcResult<null>> =>
      invoke('ai:deleteCredential', { connectionId }),
    getCredentialMetadata: (
      connectionId: string
    ): Promise<IpcResult<AiCredentialMetadata | null>> =>
      invoke('ai:getCredentialMetadata', { connectionId }),
    detectProvider: (apiKey: string): Promise<IpcResult<AiProviderDetectionResult>> =>
      invoke('ai:detectProvider', { apiKey }),
    testConnection: (connectionId: string): Promise<IpcResult<AiConnectionTestResult>> =>
      invoke('ai:testConnection', { connectionId }),
    listModels: (connectionId: string): Promise<IpcResult<AiModelInfo[]>> =>
      invoke('ai:listModels', { connectionId }),
    estimateUsage: (request: AiUsageEstimateRequest): Promise<IpcResult<AiUsageEstimate>> =>
      invoke('ai:estimateUsage', request),
    cancel: (requestId: string): Promise<IpcResult<null>> => invoke('ai:cancel', { requestId }),
    previewContext: (input: {
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
    }): Promise<IpcResult<AiPreparedContext>> => invoke('ai:previewContext', input),
    draftCommitMessage: (input: {
      repositoryId: string
      commitMessage?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiCommitDraft>> => invoke('ai:draftCommitMessage', input),
    summarizeStagedChanges: (input: {
      repositoryId: string
      commitMessage?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChangeSummary>> => invoke('ai:summarizeStagedChanges', input),
    reviewStagedChanges: (input: {
      repositoryId: string
      commitMessage?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChangeReview>> => invoke('ai:reviewStagedChanges', input),
    explainSafetyIssue: (input: {
      repositoryId: string
      safetyCode: string
    }): Promise<IpcResult<AiSafetyExplanation>> => invoke('ai:explainSafetyIssue', input),
    generatePushBrief: (input: {
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
    }): Promise<IpcResult<AiPushBrief>> => invoke('ai:generatePushBrief', input),
    generateHistorySummary: (input: {
      repositoryId: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiHistorySummary>> => invoke('ai:generateHistorySummary', input),
    listBuiltInTemplates: (): Promise<IpcResult<AiConnectionTemplateExport[]>> =>
      invoke('ai:listBuiltInTemplates'),
    exportConnectionTemplate: (id: string): Promise<IpcResult<AiConnectionTemplateExport>> =>
      invoke('ai:exportConnectionTemplate', { id }),
    importConnectionTemplate: (
      template: AiConnectionTemplateExport
    ): Promise<IpcResult<AiConnection>> => invoke('ai:importConnectionTemplate', template),
    duplicateConnection: (id: string): Promise<IpcResult<AiConnection>> =>
      invoke('ai:duplicateConnection', { id }),
    generateRepoBrief: (input: {
      repositoryId: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiRepoBrief>> => invoke('ai:generateRepoBrief', input),
    explainGitFailure: (input: {
      repositoryId: string
      code: string
      userMessage: string
      technicalDetails?: string
    }): Promise<IpcResult<AiFailureExplanation>> => invoke('ai:explainGitFailure', input),
    explainToolOutput: (input: {
      repositoryId: string
      output: string
    }): Promise<IpcResult<AiFailureExplanation>> => invoke('ai:explainToolOutput', input),
    proposeAgenticActions: (input: {
      repositoryId: string
      prompt: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiAgenticProposal>> => invoke('ai:proposeAgenticActions', input),
    executeAgenticProposal: (input: {
      repositoryId: string
      fileEdits: Array<{ path: string; before?: string; after: string }>
    }): Promise<IpcResult<{ writtenFiles: string[] }>> =>
      invoke('ai:executeAgenticProposal', input),
    chat: (input: {
      repositoryId: string
      message: string
      history?: AiChatTurn[]
      selectedUnstagedPaths?: string[]
      requestId?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChatResponse>> => invoke('ai:chat', input),
    chatStream: (input: {
      repositoryId: string
      message: string
      history?: AiChatTurn[]
      selectedUnstagedPaths?: string[]
      requestId: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<AiChatResponse>> => invoke('ai:chatStream', input),
    chatSuggestBlock: (input: {
      repositoryId: string
      message: string
      assistantReply: string
      history?: AiChatTurn[]
      selectedUnstagedPaths?: string[]
      requestId?: string
      expensiveSendAcknowledged?: boolean
    }): Promise<IpcResult<ChatBlockSuggestion>> => invoke('ai:chatSuggestBlock', input),
    onChatStreamEvent: (callback: (event: AiChatStreamEvent) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: AiChatStreamEvent): void => callback(payload)
      ipcRenderer.on(AI_CHAT_STREAM_EVENT_CHANNEL, listener)
      return () => ipcRenderer.removeListener(AI_CHAT_STREAM_EVENT_CHANNEL, listener)
    },
  },
  pushBrief: {
    buildDeterministic: (input: {
      repositoryId: string
      remoteName: string
      branch: string
      github?: {
        assignedLogin?: string
        effectiveLogin?: string
        hasToken: boolean
        tokenInvalid: boolean
      }
    }): Promise<IpcResult<AiPushBrief>> => invoke('pushBrief:buildDeterministic', input),
  },
  historySummary: {
    buildDeterministic: (input: { repositoryId: string }): Promise<IpcResult<AiHistorySummary>> =>
      invoke('historySummary:buildDeterministic', input),
  },
  repoBrief: {
    buildDeterministic: (input: { repositoryId: string }): Promise<IpcResult<AiRepoBrief>> =>
      invoke('repoBrief:buildDeterministic', input),
    listAllowlistedFiles: (input: {
      repositoryId: string
    }): Promise<IpcResult<AiAllowlistedFile[]>> => invoke('repoBrief:listAllowlistedFiles', input),
  },
  failureExplain: {
    gitFailure: (input: {
      repositoryId: string
      code: string
      userMessage: string
      technicalDetails?: string
    }): Promise<IpcResult<AiFailureExplanation>> => invoke('failureExplain:gitFailure', input),
    toolOutput: (input: {
      repositoryId: string
      output: string
    }): Promise<IpcResult<AiFailureExplanation>> => invoke('failureExplain:toolOutput', input),
  },
  changeReview: {
    scanStaged: (input: { repositoryId: string }): Promise<IpcResult<AiReviewFinding[]>> =>
      invoke('changeReview:scanStaged', input),
  },
  updates: {
    /** Check GitHub for a newer published release. Resolves to a soft result, never rejects. */
    check: (): Promise<IpcResult<UpdateCheckResult>> => invoke('updates:check'),
  },
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
