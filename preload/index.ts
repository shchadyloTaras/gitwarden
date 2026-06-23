import { contextBridge, ipcRenderer } from 'electron'
import type {
  Profile,
  RepositoryRecord,
  AppSettings,
  GitStatus,
  EffectiveGitIdentity,
} from '../src/core/types.js'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>
}

export const api = {
  dialog: {
    openDirectory: (): Promise<IpcResult<string | null>> => invoke('dialog:openDirectory'),
  },
  profiles: {
    list: (): Promise<IpcResult<Profile[]>> => invoke('profiles:list'),
    get: (id: string): Promise<IpcResult<Profile | undefined>> => invoke('profiles:get', { id }),
    create: (input: Omit<Profile, 'id'>): Promise<IpcResult<Profile>> =>
      invoke('profiles:create', input),
    update: (id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<IpcResult<Profile>> =>
      invoke('profiles:update', { id, patch }),
    delete: (id: string): Promise<IpcResult<void>> => invoke('profiles:delete', { id }),
  },
  repositories: {
    list: (): Promise<IpcResult<RepositoryRecord[]>> => invoke('repositories:list'),
    get: (id: string): Promise<IpcResult<RepositoryRecord | undefined>> =>
      invoke('repositories:get', { id }),
    create: (input: Omit<RepositoryRecord, 'id'>): Promise<IpcResult<RepositoryRecord>> =>
      invoke('repositories:create', input),
    update: (
      id: string,
      patch: Partial<Omit<RepositoryRecord, 'id'>>
    ): Promise<IpcResult<RepositoryRecord>> => invoke('repositories:update', { id, patch }),
    delete: (id: string): Promise<IpcResult<void>> => invoke('repositories:delete', { id }),
  },
  settings: {
    get: (): Promise<IpcResult<AppSettings>> => invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>> =>
      invoke('settings:update', patch),
  },
  git: {
    getStatus: (repoPath: string): Promise<IpcResult<GitStatus>> =>
      invoke('git:getStatus', { repoPath }),
    getEffectiveIdentity: (repoPath: string): Promise<IpcResult<EffectiveGitIdentity>> =>
      invoke('git:getEffectiveIdentity', { repoPath }),
    validateRepository: (
      repoPath: string
    ): Promise<IpcResult<{ name: string; remoteUrl?: string }>> =>
      invoke('git:validateRepository', { repoPath }),
    stageFile: (repoPath: string, filePath: string): Promise<IpcResult<void>> =>
      invoke('git:stageFile', { repoPath, filePath }),
    unstageFile: (repoPath: string, filePath: string): Promise<IpcResult<void>> =>
      invoke('git:unstageFile', { repoPath, filePath }),
    stageAll: (repoPath: string): Promise<IpcResult<void>> =>
      invoke('git:stageAll', { repoPath }),
    unstageAll: (repoPath: string): Promise<IpcResult<void>> =>
      invoke('git:unstageAll', { repoPath }),
    getDiff: (repoPath: string, filePath: string, staged: boolean): Promise<IpcResult<string>> =>
      invoke('git:getDiff', { repoPath, filePath, staged }),
  },
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
