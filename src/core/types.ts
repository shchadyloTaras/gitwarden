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
}

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
