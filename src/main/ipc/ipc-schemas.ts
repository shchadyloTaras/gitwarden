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
