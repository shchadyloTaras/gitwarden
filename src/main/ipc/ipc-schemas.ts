import { z } from 'zod'
import { ProfileSchema, RepositoryRecordSchema, AppSettingsSchema } from '../../core/schemas.js'

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
