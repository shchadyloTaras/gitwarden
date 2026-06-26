import { ipcMain, dialog } from 'electron'
import { z } from 'zod'
import type { IProfileService } from '../services/ProfileService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { ISettingsService } from '../services/SettingsService.js'
import type { GitService } from '../services/GitService.js'
import type { IGitHubAuthCoordinator } from './GitHubAuthCoordinator.js'
import type { IAiConnectionService } from '../services/AiConnectionService.js'
import type { IAiCredentialStore } from '../storage/AiCredentialStore.js'
import type { AiAdapter } from '../ai/types.js'
import type { AiContextBuilder } from '../ai/AiContextBuilder.js'
import type { AiCommitAssistant } from '../ai/AiCommitAssistant.js'
import type { AiChangeReviewAssistant } from '../ai/AiChangeReviewAssistant.js'
import type { AiSafetyCopilotAssistant } from '../ai/AiSafetyCopilotAssistant.js'
import type { AiPushBriefAssistant } from '../ai/AiPushBriefAssistant.js'
import type { AiHistorySummaryAssistant } from '../ai/AiHistorySummaryAssistant.js'
import type { AiRepoBriefAssistant } from '../ai/AiRepoBriefAssistant.js'
import type { AiFailureExplainerAssistant } from '../ai/AiFailureExplainerAssistant.js'
import type { AiAgenticAssistant } from '../ai/AiAgenticAssistant.js'
import type { AiChatAssistant } from '../ai/AiChatAssistant.js'
import type { AgenticActionExecutor } from '../ai/AgenticActionExecutor.js'
import type { StagedChangeReviewService } from '../ai/StagedChangeReviewService.js'
import { detectProvider } from '../../core/ai/detection.js'
import { maskSecret } from '../../core/ai/credentials.js'
import {
  AiConnectionTestResultSchema,
  AiModelInfoSchema,
  AiUsageEstimateSchema,
} from '../../core/ai/schemas.js'
import {
  ProfileGetPayload,
  ProfileCreatePayload,
  ProfileUpdatePayload,
  ProfileDeletePayload,
  RepositoryGetPayload,
  RepositoryCreatePayload,
  RepositoryUpdatePayload,
  RepositoryDeletePayload,
  SettingsUpdatePayload,
  GitRepoPathPayload,
  GitFilePathPayload,
  GitDiffPayload,
  GitCommitPayload,
  GitSetIdentityPayload,
  GitRemoteOpPayload,
  GitRemoteBranchOpPayload,
  GitBranchOpPayload,
  GitCreateBranchPayload,
  GitHistoryPayload,
  GitValidatePathPayload,
  GitHubStartDeviceAuthPayload,
  GitHubCancelDeviceAuthPayload,
  GitHubDisconnectPayload,
  GitHubGetLinkedAccountPayload,
  GitHubGetPushContextPayload,
  ShellOpenExternalPayload,
  AiConnectionCreatePayload,
  AiConnectionUpdatePayload,
  AiConnectionIdPayload,
  AiSetActiveConnectionPayload,
  AiSaveCredentialPayload,
  AiCredentialConnectionPayload,
  AiDetectProviderPayload,
  AiTestConnectionPayload,
  AiListModelsPayload,
  AiEstimateUsagePayload,
  AiCancelPayload,
  AiPreviewContextPayload,
  AiCommitAssistantPayload,
  ChangeReviewScanPayload,
  AiSafetyCopilotPayload,
  PushBriefPayload,
  HistorySummaryPayload,
  RepoBriefPayload,
  GitFailureExplainPayload,
  ToolFailureExplainPayload,
  AiConnectionTemplateImportPayload,
  AiAgenticProposePayload,
  AiAgenticExecutePayload,
  AiChatPayload,
  AiChatStreamEventSchema,
} from './ipc-schemas.js'
import {
  AiChangeReviewSchema,
  AiChangeSummarySchema,
  AiCommitDraftSchema,
  AiHistorySummarySchema,
  AiPushBriefSchema,
  AiReviewFindingSchema,
  AiSafetyExplanationResultSchema,
  AiRepoBriefSchema,
  AiAllowlistedFileSchema,
  AiFailureExplanationSchema,
  AiConnectionTemplateExportSchema,
  AiConnectionSchema,
  AiAgenticProposalSchema,
  AiChatResponseSchema,
} from '../../core/ai/schemas.js'
import type { PushAuth } from '../services/GitService.js'

export interface Services {
  profiles: IProfileService
  repositories: IRepositoryService
  settings: ISettingsService
  git: GitService
  github: IGitHubAuthCoordinator
  aiConnections: IAiConnectionService
  aiCredentials: IAiCredentialStore
  aiAdapters: AiAdapter
  aiContextBuilder: AiContextBuilder
  aiCommitAssistant: AiCommitAssistant
  aiChangeReviewAssistant: AiChangeReviewAssistant
  aiSafetyCopilotAssistant: AiSafetyCopilotAssistant
  aiPushBriefAssistant: AiPushBriefAssistant
  aiHistorySummaryAssistant: AiHistorySummaryAssistant
  aiRepoBriefAssistant: AiRepoBriefAssistant
  aiFailureExplainerAssistant: AiFailureExplainerAssistant
  aiAgenticAssistant: AiAgenticAssistant
  aiChatAssistant: AiChatAssistant
  agenticActionExecutor: AgenticActionExecutor
  stagedChangeReview: StagedChangeReviewService
  /** Browser-open seam — real `shell.openExternal` in production, no-op under e2e. */
  openExternal: (url: string) => void | Promise<void>
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const AI_CHAT_STREAM_EVENT_CHANNEL = 'ai:chatStreamEvent'

export function registerIpcHandlers(services: Services): void {
  // Profiles
  ipcMain.handle('profiles:list', () => wrap(() => services.profiles.list()))

  ipcMain.handle('profiles:get', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = ProfileGetPayload.parse(raw)
      return services.profiles.get(id)
    })
  )

  ipcMain.handle('profiles:create', (_e, raw: unknown) =>
    wrap(async () => {
      const input = ProfileCreatePayload.parse(raw)
      return services.profiles.create(input)
    })
  )

  ipcMain.handle('profiles:update', (_e, raw: unknown) =>
    wrap(async () => {
      const { id, patch } = ProfileUpdatePayload.parse(raw)
      return services.profiles.update(id, patch)
    })
  )

  ipcMain.handle('profiles:delete', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = ProfileDeletePayload.parse(raw)
      await services.profiles.delete(id)
      // Cascade: clear this profile from any repo it was assigned to, so the repo isn't
      // left pointing at a ghost id (which would block it with a phantom mismatch).
      const remaining = await services.profiles.list()
      await services.repositories.pruneAssignments(remaining.map((p) => p.id))
    })
  )

  // Repositories
  ipcMain.handle('repositories:list', () => wrap(() => services.repositories.list()))

  ipcMain.handle('repositories:get', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = RepositoryGetPayload.parse(raw)
      return services.repositories.get(id)
    })
  )

  ipcMain.handle('repositories:create', (_e, raw: unknown) =>
    wrap(async () => {
      const input = RepositoryCreatePayload.parse(raw)
      return services.repositories.create(input)
    })
  )

  ipcMain.handle('repositories:update', (_e, raw: unknown) =>
    wrap(async () => {
      const { id, patch } = RepositoryUpdatePayload.parse(raw)
      return services.repositories.update(id, patch)
    })
  )

  ipcMain.handle('repositories:delete', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = RepositoryDeletePayload.parse(raw)
      return services.repositories.delete(id)
    })
  )

  // Settings
  ipcMain.handle('settings:get', () => wrap(() => services.settings.get()))

  ipcMain.handle('settings:update', (_e, raw: unknown) =>
    wrap(async () => {
      const patch = SettingsUpdatePayload.parse(raw)
      return services.settings.update(patch)
    })
  )

  // Shell — open an external (http/https) URL in the user's default browser.
  ipcMain.handle('shell:openExternal', (_e, raw: unknown) =>
    wrap(async () => {
      const { url } = ShellOpenExternalPayload.parse(raw)
      await services.openExternal(url)
      return null
    })
  )

  // Dialog
  ipcMain.handle('dialog:openDirectory', () =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
  )

  // Git
  ipcMain.handle('git:getStatus', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getStatus(repoPath)
    })
  )

  ipcMain.handle('git:getEffectiveIdentity', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getEffectiveIdentity(repoPath)
    })
  )

  ipcMain.handle('git:validateRepository', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.validateRepository(repoPath)
    })
  )

  ipcMain.handle('git:stageFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.stageFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:unstageFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.unstageFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:stageAll', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.stageAll(repoPath)
    })
  )

  ipcMain.handle('git:unstageAll', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.unstageAll(repoPath)
    })
  )

  ipcMain.handle('git:getDiff', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath, staged } = GitDiffPayload.parse(raw)
      return services.git.getDiff(repoPath, filePath, staged)
    })
  )

  ipcMain.handle('git:commit', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, message } = GitCommitPayload.parse(raw)
      return services.git.commit(repoPath, message)
    })
  )

  ipcMain.handle('git:setLocalIdentity', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, name, email } = GitSetIdentityPayload.parse(raw)
      return services.git.setLocalIdentity(repoPath, name, email)
    })
  )

  ipcMain.handle('git:getRemotes', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getRemotes(repoPath)
    })
  )

  ipcMain.handle('git:fetch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, remote } = GitRemoteOpPayload.parse(raw)
      return services.git.fetch(repoPath, remote)
    })
  )

  ipcMain.handle('git:pull', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, remote, branch } = GitRemoteBranchOpPayload.parse(raw)
      return services.git.pull(repoPath, remote, branch)
    })
  )

  ipcMain.handle('git:push', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, remote, branch } = GitRemoteBranchOpPayload.parse(raw)
      const auth = await resolvePushAuth(services, repoPath, remote)
      return services.git.push(repoPath, remote, branch, auth)
    })
  )

  ipcMain.handle('git:getBranches', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getBranches(repoPath)
    })
  )

  ipcMain.handle('git:switchBranch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, branch } = GitBranchOpPayload.parse(raw)
      return services.git.switchBranch(repoPath, branch)
    })
  )

  ipcMain.handle('git:createBranch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, name } = GitCreateBranchPayload.parse(raw)
      return services.git.createBranch(repoPath, name)
    })
  )

  ipcMain.handle('git:deleteBranch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, branch } = GitBranchOpPayload.parse(raw)
      return services.git.deleteBranch(repoPath, branch)
    })
  )

  ipcMain.handle('git:getCommitHistory', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, limit, skip } = GitHistoryPayload.parse(raw)
      return services.git.getCommitHistory(repoPath, limit, skip)
    })
  )

  ipcMain.handle('git:discardFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.discardFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:cleanFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.cleanFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:validateGitPath', (_e, raw: unknown) =>
    wrap(async () => {
      const { gitPath } = GitValidatePathPayload.parse(raw)
      return services.git.validateGitPath(gitPath)
    })
  )

  // GitHub OAuth (Device Flow). startDeviceAuth returns the device code and begins
  // polling in main; progress is pushed back over the github:authEvent channel using
  // the initiating webContents (event.sender), so no IPC call blocks on the flow.
  ipcMain.handle('github:startDeviceAuth', (event, raw: unknown) =>
    wrap(async () => {
      const { profileId } = GitHubStartDeviceAuthPayload.parse(raw)
      return services.github.startDeviceAuth(profileId, event.sender)
    })
  )

  ipcMain.handle('github:cancelDeviceAuth', (event, raw: unknown) =>
    wrap(async () => {
      const { profileId } = GitHubCancelDeviceAuthPayload.parse(raw)
      services.github.cancelDeviceAuth(profileId, event.sender)
      return null
    })
  )

  ipcMain.handle('github:disconnect', (_e, raw: unknown) =>
    wrap(async () => {
      const { profileId } = GitHubDisconnectPayload.parse(raw)
      await services.github.disconnect(profileId)
      return null
    })
  )

  ipcMain.handle('github:getLinkedAccount', (_e, raw: unknown) =>
    wrap(async () => {
      const { profileId } = GitHubGetLinkedAccountPayload.parse(raw)
      return (await services.github.getLinkedAccount(profileId)) ?? null
    })
  )

  ipcMain.handle('github:getPushContext', (_e, raw: unknown) =>
    wrap(async () => {
      const { profileId } = GitHubGetPushContextPayload.parse(raw)
      return services.github.getPushContext(profileId)
    })
  )

  // AI Connections (Phase 29). Connection records are non-secret; credentials go
  // through the dedicated AiCredentialStore and only AiCredentialMetadata ever
  // crosses back to the renderer — the raw secret never returns after save.
  ipcMain.handle('ai:listConnections', () => wrap(() => services.aiConnections.list()))

  ipcMain.handle('ai:createConnection', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiConnectionCreatePayload.parse(raw)
      return services.aiConnections.create(input)
    })
  )

  ipcMain.handle('ai:updateConnection', (_e, raw: unknown) =>
    wrap(async () => {
      const { id, patch } = AiConnectionUpdatePayload.parse(raw)
      return services.aiConnections.update(id, patch)
    })
  )

  ipcMain.handle('ai:deleteConnection', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = AiConnectionIdPayload.parse(raw)
      await services.aiConnections.delete(id)
      // Drop any orphaned credential for the removed connection.
      await services.aiCredentials.delete(id)
      return null
    })
  )

  ipcMain.handle('ai:setActiveConnection', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = AiSetActiveConnectionPayload.parse(raw)
      await services.aiConnections.setActive(id)
      return null
    })
  )

  ipcMain.handle('ai:saveCredential', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiSaveCredentialPayload.parse(raw)
      // Returns ONLY metadata (label, maskedPreview, secretFields, updatedAt).
      return services.aiCredentials.save(input)
    })
  )

  ipcMain.handle('ai:deleteCredential', (_e, raw: unknown) =>
    wrap(async () => {
      const { connectionId } = AiCredentialConnectionPayload.parse(raw)
      await services.aiCredentials.delete(connectionId)
      return null
    })
  )

  ipcMain.handle('ai:getCredentialMetadata', (_e, raw: unknown) =>
    wrap(async () => {
      const { connectionId } = AiCredentialConnectionPayload.parse(raw)
      return (await services.aiCredentials.getMetadata(connectionId)) ?? null
    })
  )

  ipcMain.handle('ai:detectProvider', (_e, raw: unknown) =>
    wrap(async () => {
      const { apiKey } = AiDetectProviderPayload.parse(raw)
      // The raw key is detected in main and immediately discarded; only the
      // detection result and a masked label cross back to the renderer.
      return { detection: detectProvider(apiKey), maskedKeyLabel: maskSecret(apiKey.trim()) }
    })
  )

  ipcMain.handle('ai:testConnection', (_e, raw: unknown) =>
    wrap(async () => {
      const { connectionId } = AiTestConnectionPayload.parse(raw)
      return AiConnectionTestResultSchema.parse(
        await services.aiAdapters.testConnection(connectionId)
      )
    })
  )

  ipcMain.handle('ai:listModels', (_e, raw: unknown) =>
    wrap(async () => {
      const { connectionId } = AiListModelsPayload.parse(raw)
      return zodModelList(await services.aiAdapters.listModels(connectionId))
    })
  )

  ipcMain.handle('ai:estimateUsage', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiEstimateUsagePayload.parse(raw)
      return AiUsageEstimateSchema.parse(await services.aiAdapters.estimateUsage(input))
    })
  )

  ipcMain.handle('ai:cancel', (_e, raw: unknown) =>
    wrap(async () => {
      const { requestId } = AiCancelPayload.parse(raw)
      await services.aiAdapters.cancel(requestId)
      return null
    })
  )

  ipcMain.handle('ai:previewContext', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiPreviewContextPayload.parse(raw)
      return services.aiContextBuilder.buildPreview(input)
    })
  )

  ipcMain.handle('ai:draftCommitMessage', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiCommitAssistantPayload.parse(raw)
      const draft = await services.aiCommitAssistant.draftCommitMessage(input)
      return AiCommitDraftSchema.parse(draft)
    })
  )

  ipcMain.handle('ai:summarizeStagedChanges', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiCommitAssistantPayload.parse(raw)
      const summary = await services.aiCommitAssistant.summarizeStagedChanges(input)
      return AiChangeSummarySchema.parse(summary)
    })
  )

  ipcMain.handle('changeReview:scanStaged', (_e, raw: unknown) =>
    wrap(async () => {
      const input = ChangeReviewScanPayload.parse(raw)
      const findings = await services.stagedChangeReview.scanDeterministic(input)
      return AiReviewFindingSchema.array().parse(findings)
    })
  )

  ipcMain.handle('ai:reviewStagedChanges', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiCommitAssistantPayload.parse(raw)
      const review = await services.aiChangeReviewAssistant.reviewStagedChanges(input)
      return AiChangeReviewSchema.parse(review)
    })
  )

  ipcMain.handle('ai:explainSafetyIssue', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiSafetyCopilotPayload.parse(raw)
      const explanation = await services.aiSafetyCopilotAssistant.explainSafetyIssue(input)
      return AiSafetyExplanationResultSchema.parse(explanation)
    })
  )

  ipcMain.handle('pushBrief:buildDeterministic', (_e, raw: unknown) =>
    wrap(async () => {
      const input = PushBriefPayload.parse(raw)
      const brief = await services.aiPushBriefAssistant.buildDeterministic(input)
      return AiPushBriefSchema.parse(brief)
    })
  )

  ipcMain.handle('ai:generatePushBrief', (_e, raw: unknown) =>
    wrap(async () => {
      const input = PushBriefPayload.parse(raw)
      const brief = await services.aiPushBriefAssistant.generatePushBrief(input)
      return AiPushBriefSchema.parse(brief)
    })
  )

  ipcMain.handle('historySummary:buildDeterministic', (_e, raw: unknown) =>
    wrap(async () => {
      const input = HistorySummaryPayload.parse(raw)
      const summary = await services.aiHistorySummaryAssistant.buildDeterministic(
        input.repositoryId
      )
      return AiHistorySummarySchema.parse(summary)
    })
  )

  ipcMain.handle('ai:generateHistorySummary', (_e, raw: unknown) =>
    wrap(async () => {
      const input = HistorySummaryPayload.parse(raw)
      const summary = await services.aiHistorySummaryAssistant.generateHistorySummary(input)
      return AiHistorySummarySchema.parse(summary)
    })
  )

  ipcMain.handle('repoBrief:buildDeterministic', (_e, raw: unknown) =>
    wrap(async () => {
      const input = RepoBriefPayload.parse(raw)
      const brief = await services.aiRepoBriefAssistant.buildDeterministic(input.repositoryId)
      return AiRepoBriefSchema.parse(brief)
    })
  )

  ipcMain.handle('repoBrief:listAllowlistedFiles', (_e, raw: unknown) =>
    wrap(async () => {
      const input = RepoBriefPayload.parse(raw)
      const files = await services.aiRepoBriefAssistant.listAllowlistedFiles(input.repositoryId)
      return AiAllowlistedFileSchema.array().parse(files)
    })
  )

  ipcMain.handle('ai:generateRepoBrief', (_e, raw: unknown) =>
    wrap(async () => {
      const input = RepoBriefPayload.parse(raw)
      const brief = await services.aiRepoBriefAssistant.generateRepoBrief(input)
      return AiRepoBriefSchema.parse(brief)
    })
  )

  ipcMain.handle('failureExplain:gitFailure', (_e, raw: unknown) =>
    wrap(async () => {
      const input = GitFailureExplainPayload.parse(raw)
      const explanation = services.aiFailureExplainerAssistant.buildDeterministicGitFailure(input)
      return AiFailureExplanationSchema.parse(explanation)
    })
  )

  ipcMain.handle('ai:explainGitFailure', (_e, raw: unknown) =>
    wrap(async () => {
      const input = GitFailureExplainPayload.parse(raw)
      const explanation = await services.aiFailureExplainerAssistant.explainGitFailure(input)
      return AiFailureExplanationSchema.parse(explanation)
    })
  )

  ipcMain.handle('failureExplain:toolOutput', (_e, raw: unknown) =>
    wrap(async () => {
      const input = ToolFailureExplainPayload.parse(raw)
      const explanation = services.aiFailureExplainerAssistant.buildDeterministicToolFailure(input)
      return AiFailureExplanationSchema.parse(explanation)
    })
  )

  ipcMain.handle('ai:explainToolOutput', (_e, raw: unknown) =>
    wrap(async () => {
      const input = ToolFailureExplainPayload.parse(raw)
      const explanation = await services.aiFailureExplainerAssistant.explainToolOutput(input)
      return AiFailureExplanationSchema.parse(explanation)
    })
  )

  ipcMain.handle('ai:listBuiltInTemplates', () =>
    wrap(() => services.aiConnections.listBuiltInTemplates())
  )

  ipcMain.handle('ai:exportConnectionTemplate', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = AiConnectionIdPayload.parse(raw)
      const template = await services.aiConnections.exportTemplate(id)
      return AiConnectionTemplateExportSchema.parse(template)
    })
  )

  ipcMain.handle('ai:importConnectionTemplate', (_e, raw: unknown) =>
    wrap(async () => {
      const template = AiConnectionTemplateImportPayload.parse(raw)
      const connection = await services.aiConnections.importTemplate(template)
      return AiConnectionSchema.parse(connection)
    })
  )

  ipcMain.handle('ai:duplicateConnection', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = AiConnectionIdPayload.parse(raw)
      const connection = await services.aiConnections.duplicate(id)
      return AiConnectionSchema.parse(connection)
    })
  )

  ipcMain.handle('ai:proposeAgenticActions', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiAgenticProposePayload.parse(raw)
      const proposal = await services.aiAgenticAssistant.propose(input)
      return AiAgenticProposalSchema.parse(proposal)
    })
  )

  ipcMain.handle('ai:executeAgenticProposal', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiAgenticExecutePayload.parse(raw)
      return services.agenticActionExecutor.executeFileEdits(input.repositoryId, input.fileEdits)
    })
  )

  ipcMain.handle('ai:chat', (_e, raw: unknown) =>
    wrap(async () => {
      const input = AiChatPayload.parse(raw)
      const response = await services.aiChatAssistant.chat(input)
      return AiChatResponseSchema.parse(response)
    })
  )

  ipcMain.handle('ai:chatStream', (event, raw: unknown) =>
    wrap(async () => {
      const input = AiChatPayload.parse(raw)
      const requestId = input.requestId ?? crypto.randomUUID()
      const sender = event.sender
      const emit = (payload: Omit<z.infer<typeof AiChatStreamEventSchema>, 'requestId'>): void => {
        sender.send(
          AI_CHAT_STREAM_EVENT_CHANNEL,
          AiChatStreamEventSchema.parse({ requestId, ...payload })
        )
      }
      try {
        const response = await services.aiChatAssistant.chatStream(
          { ...input, requestId },
          {
            onDelta: (delta) => emit({ type: 'delta', delta }),
          }
        )
        const parsed = AiChatResponseSchema.parse(response)
        emit({ type: 'done', suggestedCommands: parsed.suggestedCommands })
        return parsed
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        emit({ type: 'error', error })
        throw err
      }
    })
  )
}

function zodModelList(models: unknown): unknown {
  return AiModelInfoSchema.array().parse(models)
}

/**
 * Resolve HTTPS-token push credentials from the repo's assigned profile, if any. Returns
 * undefined for unassigned repos, non-GitHub/SSH remotes, or profiles without a stored
 * token — in which case the push proceeds exactly as before (SSH / ambient credentials).
 */
async function resolvePushAuth(
  services: Services,
  repoPath: string,
  remoteName: string
): Promise<PushAuth | undefined> {
  const repos = await services.repositories.list()
  const repo = repos.find((r) => r.localPath === repoPath)
  if (!repo?.assignedProfileId) return undefined

  const remotes = await services.git.getRemotes(repoPath)
  const url = remotes.find((r) => r.name === remoteName)?.url
  if (!url) return undefined

  return services.github.resolveHttpsAuth(repo.assignedProfileId, url)
}
