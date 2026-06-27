import { z } from 'zod'

// --- GitHub OAuth (Device Authorization Flow) ---
// Pure boundary schemas; no Node.js or browser globals. See docs/plans/github-oauth-plan.md §2 + Appendix A.

/** Granted-scope and identity link persisted on a Profile. The token is NEVER stored here. */
export const LinkedGitHubAccountSchema = z.object({
  login: z.string(),
  accountId: z.number().int(),
  scopes: z.array(z.string()),
  connectedAt: z.string(),
})

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
  linkedGitHub: LinkedGitHubAccountSchema.optional(),
})

export const RepositoryPushPolicySchema = z.object({
  mode: z.enum(['unrestricted', 'branchScoped']),
  allowedBranchPatterns: z.array(z.string()),
  blockedBranchPatterns: z.array(z.string()),
  expectedRemoteOwner: z.string().optional(),
  expectedRemoteRepo: z.string().optional(),
  expectedGitHubActor: z.string().optional(),
  suggestedBranchPrefix: z.string().optional(),
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
  // Per-repo AI override (most specific in the precedence chain). Absent = inherit.
  aiOverride: z.enum(['enabled', 'disabled']).optional(),
  recommendedConnectionId: z.string().optional(),
  pushPolicy: RepositoryPushPolicySchema.optional(),
})

export const AppSettingsSchema = z.object({
  activeProfileId: z.string().optional(),
  lastOpenedRepositoryId: z.string().optional(),
  appearance: z.enum(['system', 'light', 'dark']),
  customGitPath: z.string().optional(),
  defaultProjectsFolder: z.string().optional(),
  onboardingCompletedAt: z.string().optional(),
  onboardingSkippedAt: z.string().optional(),
  // Global "Enable AI" consent (default-off; §4). Separate from saving a connection.
  aiEnabled: z.boolean().optional(),
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

// --- GitHub OAuth: enums, renderer-facing payloads, and raw API responses ---

export const GitHubAuthStatusSchema = z.enum([
  'idle',
  'awaitingUser',
  'authorized',
  'denied',
  'expired',
  'error',
])

export const GitHubAuthErrorCodeSchema = z.enum([
  'slowDown',
  'expiredToken',
  'accessDenied',
  'tokenInvalid',
  'network',
  'unknown',
])

/** Renderer-facing device-code payload (camelCase). The raw `device_code` is NOT included. */
export const GitHubDeviceCodeSchema = z.object({
  userCode: z.string(),
  verificationUri: z.string(),
  expiresInSec: z.number().int(),
  intervalSec: z.number().int(),
})

/** Renderer-facing resolved identity (camelCase). */
export const GitHubAccountSchema = z.object({
  id: z.number().int(),
  login: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
})

// Raw GitHub REST responses (snake_case). Validated in main before mapping to
// the camelCase domain types above. Unknown keys are stripped by Zod.

/** POST https://github.com/login/device/code */
export const GitHubDeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  interval: z.number(),
})

/** POST https://github.com/login/oauth/access_token — success branch. */
export const GitHubAccessTokenSuccessSchema = z.object({
  access_token: z.string(),
  scope: z.string(), // space/comma-separated granted scopes
  token_type: z.string(),
})

/** POST .../access_token — pending/error branch (authorization_pending, slow_down, expired_token, access_denied, …). */
export const GitHubAccessTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  error_uri: z.string().optional(),
  interval: z.number().optional(), // present on slow_down
})

export const GitHubAccessTokenResponseSchema = z.union([
  GitHubAccessTokenSuccessSchema,
  GitHubAccessTokenErrorSchema,
])

/** GET https://api.github.com/user — `name`/`email` come back as null when unset. */
export const GitHubUserResponseSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
})

/** One entry of GET https://api.github.com/user/emails. */
export const GitHubEmailSchema = z.object({
  email: z.string(),
  primary: z.boolean(),
  verified: z.boolean(),
  visibility: z.string().nullable().optional(),
})

export const GitHubEmailsResponseSchema = z.array(GitHubEmailSchema)

export type LinkedGitHubAccountInput = z.input<typeof LinkedGitHubAccountSchema>
export type GitHubDeviceCodeInput = z.input<typeof GitHubDeviceCodeSchema>
export type GitHubAccountInput = z.input<typeof GitHubAccountSchema>
