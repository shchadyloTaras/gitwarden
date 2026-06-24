export type AuthenticationMethod = 'ssh' | 'token' // token model-only in MVP

export interface Profile {
  id: string
  displayName: string
  gitAuthorName: string
  gitAuthorEmail: string
  githubUsername: string
  authenticationMethod: AuthenticationMethod
  sshKeyAlias?: string
  expectedRemoteHosts: string[]
  defaultProjectsFolder?: string
  notes?: string
  /** Set once the profile is linked to a GitHub account via OAuth Device Flow. The token is NEVER stored here — it lives only in TokenStore, keyed by profile id. */
  linkedGitHub?: LinkedGitHubAccount
}

// --- GitHub OAuth (Device Authorization Flow) ---
// See docs/plans/github-oauth-plan.md §2. Tokens are never part of any model;
// only LinkedGitHubAccount is persisted, and only user_code/verification_uri
// ever cross to the renderer (the device_code stays in the main process).

/**
 * What the device-flow start step returns to the renderer. The `device_code`
 * itself stays in main and is NEVER sent to the renderer.
 */
export interface GitHubDeviceCode {
  userCode: string // e.g. "WDJB-MJHT" — shown to the user
  verificationUri: string // e.g. "https://github.com/login/device"
  expiresInSec: number // typically 900
  intervalSec: number // minimum poll interval, e.g. 5
}

/** Resolved identity fetched from the GitHub API after authorization. */
export interface GitHubAccount {
  id: number
  login: string // the @username
  name?: string
  email?: string // primary verified email (may be absent)
  avatarUrl?: string
}

/** Persisted on the Profile. The token is NOT here. */
export interface LinkedGitHubAccount {
  login: string
  accountId: number
  scopes: string[] // granted scopes, e.g. ["read:user","user:email"]
  connectedAt: string // ISO
}

/** Auth progress, surfaced to the UI via an IPC event channel. */
export type GitHubAuthStatus =
  | 'idle'
  | 'awaitingUser' // device code shown; polling
  | 'authorized' // token obtained
  | 'denied' // user rejected
  | 'expired' // user_code expired
  | 'error'

export type GitHubAuthErrorCode =
  | 'slowDown'
  | 'expiredToken'
  | 'accessDenied'
  | 'tokenInvalid' // 401 from the API later (revoked/expired)
  | 'network'
  | 'unknown'

export interface RepositoryRecord {
  id: string
  name: string
  localPath: string
  remoteUrl?: string
  assignedProfileId?: string
  lastOpenedAt?: string // ISO
  isFavorite: boolean
  notes?: string
}

export type ChangeKind =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'

export interface FileChange {
  path: string
  originalPath?: string
  indexStatus: ChangeKind
  worktreeStatus: ChangeKind
}

export interface GitStatus {
  files: FileChange[]
  branch?: string
  upstream?: string
  ahead: number
  behind: number
}

export interface GitBranch {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream?: string
}

export interface GitCommit {
  fullHash: string
  shortHash: string
  message: string
  authorName: string
  authorEmail: string
  date: string
}

export interface GitRemote {
  name: string
  url: string
  host?: string
}

export type GitConfigScope = 'local' | 'global' | 'system'

export interface EffectiveGitIdentity {
  userName?: string
  userEmail?: string
  nameSource?: GitConfigScope
  emailSource?: GitConfigScope
}

export type Severity = 'warning' | 'blocker'

export interface SafetyIssue {
  code: string
  message: string
  severity: Severity
}

export interface SafetyCheckResult {
  canCommit: boolean
  canPush: boolean
  issues: SafetyIssue[]
}

export type AppearanceMode = 'system' | 'light' | 'dark'

export interface AppSettings {
  activeProfileId?: string
  lastOpenedRepositoryId?: string
  appearance: AppearanceMode
  customGitPath?: string
  defaultProjectsFolder?: string
  onboardingCompletedAt?: string
  onboardingSkippedAt?: string
}

export type GitErrorCode =
  | 'notARepository'
  | 'authenticationFailed'
  | 'remoteNotFound'
  | 'branchNotFound'
  | 'mergeConflict'
  | 'nothingToCommit'
  | 'networkError'
  | 'gitNotFound'
  | 'unknown'

export interface GitCommandError {
  code: GitErrorCode
  userMessage: string
  technicalDetails: string
  exitCode?: number
}
