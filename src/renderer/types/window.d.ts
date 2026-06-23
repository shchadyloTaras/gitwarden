import type {
  Profile,
  RepositoryRecord,
  AppSettings,
  GitStatus,
  EffectiveGitIdentity,
  GitRemote,
} from '../../core/types.js'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

interface ElectronAPI {
  dialog: {
    openDirectory(): Promise<IpcResult<string | null>>
  }
  profiles: {
    list(): Promise<IpcResult<Profile[]>>
    get(id: string): Promise<IpcResult<Profile | undefined>>
    create(input: Omit<Profile, 'id'>): Promise<IpcResult<Profile>>
    update(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<IpcResult<Profile>>
    delete(id: string): Promise<IpcResult<void>>
  }
  repositories: {
    list(): Promise<IpcResult<RepositoryRecord[]>>
    get(id: string): Promise<IpcResult<RepositoryRecord | undefined>>
    create(input: Omit<RepositoryRecord, 'id'>): Promise<IpcResult<RepositoryRecord>>
    update(
      id: string,
      patch: Partial<Omit<RepositoryRecord, 'id'>>
    ): Promise<IpcResult<RepositoryRecord>>
    delete(id: string): Promise<IpcResult<void>>
  }
  settings: {
    get(): Promise<IpcResult<AppSettings>>
    update(patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>>
  }
  git: {
    getStatus(repoPath: string): Promise<IpcResult<GitStatus>>
    getEffectiveIdentity(repoPath: string): Promise<IpcResult<EffectiveGitIdentity>>
    validateRepository(repoPath: string): Promise<IpcResult<{ name: string; remoteUrl?: string }>>
    stageFile(repoPath: string, filePath: string): Promise<IpcResult<void>>
    unstageFile(repoPath: string, filePath: string): Promise<IpcResult<void>>
    stageAll(repoPath: string): Promise<IpcResult<void>>
    unstageAll(repoPath: string): Promise<IpcResult<void>>
    getDiff(repoPath: string, filePath: string, staged: boolean): Promise<IpcResult<string>>
    commit(repoPath: string, message: string): Promise<IpcResult<{ hash: string }>>
    setLocalIdentity(repoPath: string, name: string, email: string): Promise<IpcResult<void>>
    getRemotes(repoPath: string): Promise<IpcResult<GitRemote[]>>
    fetch(repoPath: string, remote: string): Promise<IpcResult<void>>
    pull(repoPath: string, remote: string, branch: string): Promise<IpcResult<void>>
    push(repoPath: string, remote: string, branch: string): Promise<IpcResult<void>>
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
