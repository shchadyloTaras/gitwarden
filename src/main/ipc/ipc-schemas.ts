import { z } from 'zod'
import {
  ProfileSchema,
  RepositoryRecordSchema,
  AppSettingsSchema,
  GitHubAuthStatusSchema,
  GitHubAuthErrorCodeSchema,
  GitHubAccountSchema,
  LinkedGitHubAccountSchema,
} from '../../core/schemas.js'
import {
  AiConnectionKindSchema,
  AiPrivacyModeSchema,
  AiRetentionStateSchema,
  AiUsageEstimateRequestSchema,
  AiRequestKindSchema,
  AiConnectionTemplateExportSchema,
  CustomHttpMappingSchema,
  AiChatTurnSchema,
} from '../../core/ai/schemas.js'
import { ALL_SAFETY_CODES } from '../../core/ai/safetyCopilot.js'
import { isAllowedAiBaseUrl } from '../../core/ai/transport.js'

// Profile request payloads
export const ProfileGetPayload = z.object({ id: z.string() })
export const ProfileCreatePayload = ProfileSchema.omit({ id: true })
export const ProfileUpdatePayload = z.object({
  id: z.string(),
  patch: ProfileSchema.omit({ id: true }).partial(),
})
export const ProfileDeletePayload = z.object({ id: z.string() })

// Repository request payloads
export const RepositoryGetPayload = z.object({ id: z.string() })
export const RepositoryCreatePayload = RepositoryRecordSchema.omit({ id: true })
export const RepositoryUpdatePayload = z.object({
  id: z.string(),
  patch: RepositoryRecordSchema.omit({ id: true }).partial(),
})
export const RepositoryDeletePayload = z.object({ id: z.string() })

// Settings request payloads
export const SettingsUpdatePayload = AppSettingsSchema.partial()

// Shell — open an external URL in the user's browser. Restricted to http(s) so the
// renderer can never coax the main process into opening file:// or other schemes.
export const ShellOpenExternalPayload = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: 'Only http(s) URLs may be opened.' }),
})

// Git request payloads
export const GitRepoPathPayload = z.object({ repoPath: z.string() })
export const GitFilePathPayload = z.object({ repoPath: z.string(), filePath: z.string() })
export const GitDiffPayload = z.object({
  repoPath: z.string(),
  filePath: z.string(),
  staged: z.boolean(),
})

export const GitValidatePathPayload = z.object({ gitPath: z.string().min(1) })

export const GitCommitPayload = z.object({
  repoPath: z.string(),
  message: z.string().min(1),
})

export const GitSetIdentityPayload = z.object({
  repoPath: z.string(),
  name: z.string().min(1),
  email: z.string().min(1),
})

export const GitRemoteOpPayload = z.object({
  repoPath: z.string(),
  remote: z.string().min(1),
})

export const GitRemoteBranchOpPayload = z.object({
  repoPath: z.string(),
  remote: z.string().min(1),
  branch: z.string().min(1),
})

export const GitBranchOpPayload = z.object({
  repoPath: z.string(),
  branch: z.string().min(1),
})

export const GitCreateBranchPayload = z.object({
  repoPath: z.string(),
  name: z.string().min(1),
})

export const GitHistoryPayload = z.object({
  repoPath: z.string(),
  limit: z.number().int().positive(),
  skip: z.number().int().min(0),
})

// GitHub OAuth request payloads (Device Flow). All keyed by profileId.
// Channels wired in Phase 25; schemas defined here in Phase 21.
export const GitHubProfilePayload = z.object({ profileId: z.string().min(1) })
export const GitHubStartDeviceAuthPayload = GitHubProfilePayload
export const GitHubCancelDeviceAuthPayload = GitHubProfilePayload
export const GitHubDisconnectPayload = GitHubProfilePayload
export const GitHubGetLinkedAccountPayload = GitHubProfilePayload
export const GitHubGetPushContextPayload = GitHubProfilePayload

// Auth progress pushed main → renderer over the github:authEvent channel.
// `account` is the persisted link record; `identity` carries the richer name/
// email/avatar the renderer needs to auto-fill the profile and render the badge
// (Phase 26). The access token is the only piece that NEVER crosses this channel —
// it stays in main (TokenStore), so this event is the sole path identity can reach
// the renderer. Both `account` and `identity` are present only on `authorized`.
export const GitHubAuthEventPayload = z.object({
  profileId: z.string().min(1),
  status: GitHubAuthStatusSchema,
  errorCode: GitHubAuthErrorCodeSchema.optional(),
  account: LinkedGitHubAccountSchema.optional(),
  identity: GitHubAccountSchema.optional(),
})

export type GitHubAuthEventPayloadType = z.infer<typeof GitHubAuthEventPayload>

// ── AI Connections request payloads (Phase 29) ──────────────────────────────────
// All Zod-validated at the boundary. A baseUrl, when present, must satisfy the
// shared transport gate (https, or http to loopback) — the same rule the stored
// AiConnectionSchema enforces, so a bad endpoint is rejected before it is saved.

/** Shared optional-baseUrl refinement: reject non-https non-loopback endpoints. */
function refineBaseUrl(baseUrl: string | undefined, ctx: z.RefinementCtx): void {
  if (baseUrl !== undefined && !isAllowedAiBaseUrl(baseUrl)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['baseUrl'],
      message: 'baseUrl must be https:// (or http:// to a loopback host)',
    })
  }
}

export const AiConnectionCreatePayload = z
  .object({
    name: z.string().min(1),
    kind: AiConnectionKindSchema,
    baseUrl: z.string().optional(),
    defaultModel: z.string().optional(),
    privacyMode: AiPrivacyModeSchema.optional(),
    retention: AiRetentionStateSchema.optional(),
    enabled: z.boolean().optional(),
    customHttpMapping: CustomHttpMappingSchema.optional(),
  })
  .superRefine((v, ctx) => refineBaseUrl(v.baseUrl, ctx))

export const AiConnectionPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    kind: AiConnectionKindSchema.optional(),
    baseUrl: z.string().optional(),
    defaultModel: z.string().optional(),
    privacyMode: AiPrivacyModeSchema.optional(),
    retention: AiRetentionStateSchema.optional(),
    enabled: z.boolean().optional(),
    customHttpMapping: CustomHttpMappingSchema.optional(),
  })
  .superRefine((v, ctx) => refineBaseUrl(v.baseUrl, ctx))

export const AiConnectionUpdatePayload = z.object({
  id: z.string().min(1),
  patch: AiConnectionPatchSchema,
})

export const AiConnectionIdPayload = z.object({ id: z.string().min(1) })

/** Active connection may be a valid id, or null to clear the active pointer. */
export const AiSetActiveConnectionPayload = z.object({
  id: z.string().min(1).nullable(),
})

export const AiSaveCredentialPayload = z.object({
  connectionId: z.string().min(1),
  label: z.string().min(1),
  // fieldName → raw secret; at least one non-empty field required.
  secrets: z
    .record(z.string().min(1))
    .refine((s) => Object.keys(s).length > 0, { message: 'At least one secret field is required' }),
})

export const AiCredentialConnectionPayload = z.object({ connectionId: z.string().min(1) })

export const AiDetectProviderPayload = z.object({ apiKey: z.string().min(1) })

export const AiTestConnectionPayload = AiCredentialConnectionPayload

export const AiListModelsPayload = AiCredentialConnectionPayload

export const AiEstimateUsagePayload = AiUsageEstimateRequestSchema

export const AiCancelPayload = z.object({ requestId: z.string().min(1) })

export const AiPreviewContextPayload = z.object({
  repositoryId: z.string().min(1),
  kind: AiRequestKindSchema,
  selectedUnstagedPaths: z.array(z.string().min(1)).optional(),
  commitMessage: z.string().optional(),
  remoteName: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  pushGithub: z
    .object({
      assignedLogin: z.string().optional(),
      effectiveLogin: z.string().optional(),
      hasToken: z.boolean(),
      tokenInvalid: z.boolean(),
    })
    .optional(),
})

export const PushBriefPayload = z.object({
  repositoryId: z.string().min(1),
  remoteName: z.string().min(1),
  branch: z.string().min(1),
  github: z
    .object({
      assignedLogin: z.string().optional(),
      effectiveLogin: z.string().optional(),
      hasToken: z.boolean(),
      tokenInvalid: z.boolean(),
    })
    .optional(),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const HistorySummaryPayload = z.object({
  repositoryId: z.string().min(1),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const AiCommitAssistantPayload = z.object({
  repositoryId: z.string().min(1),
  commitMessage: z.string().optional(),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const ChangeReviewScanPayload = z.object({
  repositoryId: z.string().min(1),
})

export const SafetyCodeSchema = z.enum(ALL_SAFETY_CODES)

export const AiSafetyCopilotPayload = z.object({
  repositoryId: z.string().min(1),
  safetyCode: SafetyCodeSchema,
})

export const RepoBriefPayload = z.object({
  repositoryId: z.string().min(1),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const GitFailureExplainPayload = z.object({
  repositoryId: z.string().min(1),
  code: z.enum([
    'notARepository',
    'authenticationFailed',
    'remoteNotFound',
    'branchNotFound',
    'branchCheckedOutElsewhere',
    'mergeConflict',
    'nothingToCommit',
    'networkError',
    'gitNotFound',
    'unknown',
  ]),
  userMessage: z.string(),
  technicalDetails: z.string().optional(),
})

export const ToolFailureExplainPayload = z.object({
  repositoryId: z.string().min(1),
  output: z.string().min(1),
})

export const AiConnectionTemplateImportPayload = AiConnectionTemplateExportSchema

export const AiAgenticProposePayload = z.object({
  repositoryId: z.string().min(1),
  prompt: z.string().min(1),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const AiChatPayload = z.object({
  repositoryId: z.string().min(1),
  message: z.string().min(1),
  history: z.array(AiChatTurnSchema).optional(),
  selectedUnstagedPaths: z.array(z.string().min(1)).optional(),
  requestId: z.string().min(1).optional(),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const AiChatSuggestBlockPayload = z.object({
  repositoryId: z.string().min(1),
  message: z.string().min(1),
  assistantReply: z.string().min(1),
  history: z.array(AiChatTurnSchema).optional(),
  selectedUnstagedPaths: z.array(z.string().min(1)).optional(),
  requestId: z.string().min(1).optional(),
  expensiveSendAcknowledged: z.boolean().optional(),
})

export const AiChatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    requestId: z.string().min(1),
    type: z.literal('delta'),
    delta: z.string(),
  }),
  z.object({
    requestId: z.string().min(1),
    type: z.literal('done'),
    suggestedCommands: z.array(z.string()).optional(),
  }),
  z.object({
    requestId: z.string().min(1),
    type: z.literal('error'),
    error: z.string().min(1),
  }),
])

export const AiAgenticExecutePayload = z.object({
  repositoryId: z.string().min(1),
  fileEdits: z.array(
    z.object({
      path: z.string().min(1),
      before: z.string().optional(),
      after: z.string(),
    })
  ),
})

// Guard Quick-Fix (Phase 65): the four executable remediations. The action enum
// mirrors EXECUTABLE_ACTIONS in src/core/safety/remediation.ts — only in-app fixes
// are accepted here; navigate-only actions are handled by the renderer.
export const RemediationExecutePayload = z.object({
  action: z.enum([
    'set-local-identity',
    'switch-active-profile',
    'reconnect-github',
    'switch-profile-and-retry-push',
  ]),
  repoPath: z.string().min(1),
  profileId: z.string().optional(),
  remote: z.string().optional(),
  branch: z.string().optional(),
})
