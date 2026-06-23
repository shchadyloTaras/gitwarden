import { z } from 'zod'

export const ProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  gitAuthorName: z.string(),
  gitAuthorEmail: z.string(),
  githubUsername: z.string(),
  authenticationMethod: z.enum(['ssh', 'token']),
  sshKeyAlias: z.string().optional(),
  expectedRemoteHosts: z.array(z.string()),
  defaultProjectsFolder: z.string().optional(),
  notes: z.string().optional(),
})

export const RepositoryRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  localPath: z.string(),
  remoteUrl: z.string().optional(),
  assignedProfileId: z.string().optional(),
  lastOpenedAt: z.string().optional(),
  isFavorite: z.boolean(),
  notes: z.string().optional(),
})

export const AppSettingsSchema = z.object({
  activeProfileId: z.string().optional(),
  lastOpenedRepositoryId: z.string().optional(),
  appearance: z.enum(['system', 'light', 'dark']),
  customGitPath: z.string().optional(),
})

export type ProfileInput = z.input<typeof ProfileSchema>
export type RepositoryRecordInput = z.input<typeof RepositoryRecordSchema>
export type AppSettingsInput = z.input<typeof AppSettingsSchema>

export const ProfilesDataSchema = z.object({
  profiles: z.array(ProfileSchema),
})

export const RepositoriesDataSchema = z.object({
  repositories: z.array(RepositoryRecordSchema),
})

export type ProfilesData = z.infer<typeof ProfilesDataSchema>
export type RepositoriesData = z.infer<typeof RepositoriesDataSchema>
