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
