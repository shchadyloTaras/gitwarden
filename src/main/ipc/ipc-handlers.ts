import { ipcMain, dialog } from 'electron'
import type { IProfileService } from '../services/ProfileService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import type { ISettingsService } from '../services/SettingsService.js'
import type { GitService } from '../services/GitService.js'
import {
  ProfileGetPayload,
  ProfileCreatePayload,
  ProfileUpdatePayload,
  ProfileDeletePayload,
  RepositoryGetPayload,
  RepositoryCreatePayload,
  RepositoryUpdatePayload,
  RepositoryDeletePayload,
  SettingsUpdatePayload,
  GitRepoPathPayload,
  GitFilePathPayload,
  GitDiffPayload,
  GitCommitPayload,
  GitSetIdentityPayload,
  GitRemoteOpPayload,
  GitRemoteBranchOpPayload,
  GitBranchOpPayload,
  GitCreateBranchPayload,
  GitHistoryPayload,
  GitValidatePathPayload,
} from './ipc-schemas.js'

export interface Services {
  profiles: IProfileService
  repositories: IRepositoryService
  settings: ISettingsService
  git: GitService
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerIpcHandlers(services: Services): void {
  // Profiles
  ipcMain.handle('profiles:list', () => wrap(() => services.profiles.list()))

  ipcMain.handle('profiles:get', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = ProfileGetPayload.parse(raw)
      return services.profiles.get(id)
    })
  )

  ipcMain.handle('profiles:create', (_e, raw: unknown) =>
    wrap(async () => {
      const input = ProfileCreatePayload.parse(raw)
      return services.profiles.create(input)
    })
  )

  ipcMain.handle('profiles:update', (_e, raw: unknown) =>
    wrap(async () => {
      const { id, patch } = ProfileUpdatePayload.parse(raw)
      return services.profiles.update(id, patch)
    })
  )

  ipcMain.handle('profiles:delete', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = ProfileDeletePayload.parse(raw)
      return services.profiles.delete(id)
    })
  )

  // Repositories
  ipcMain.handle('repositories:list', () => wrap(() => services.repositories.list()))

  ipcMain.handle('repositories:get', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = RepositoryGetPayload.parse(raw)
      return services.repositories.get(id)
    })
  )

  ipcMain.handle('repositories:create', (_e, raw: unknown) =>
    wrap(async () => {
      const input = RepositoryCreatePayload.parse(raw)
      return services.repositories.create(input)
    })
  )

  ipcMain.handle('repositories:update', (_e, raw: unknown) =>
    wrap(async () => {
      const { id, patch } = RepositoryUpdatePayload.parse(raw)
      return services.repositories.update(id, patch)
    })
  )

  ipcMain.handle('repositories:delete', (_e, raw: unknown) =>
    wrap(async () => {
      const { id } = RepositoryDeletePayload.parse(raw)
      return services.repositories.delete(id)
    })
  )

  // Settings
  ipcMain.handle('settings:get', () => wrap(() => services.settings.get()))

  ipcMain.handle('settings:update', (_e, raw: unknown) =>
    wrap(async () => {
      const patch = SettingsUpdatePayload.parse(raw)
      return services.settings.update(patch)
    })
  )

  // Dialog
  ipcMain.handle('dialog:openDirectory', () =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    })
  )

  // Git
  ipcMain.handle('git:getStatus', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getStatus(repoPath)
    })
  )

  ipcMain.handle('git:getEffectiveIdentity', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getEffectiveIdentity(repoPath)
    })
  )

  ipcMain.handle('git:validateRepository', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.validateRepository(repoPath)
    })
  )

  ipcMain.handle('git:stageFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.stageFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:unstageFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.unstageFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:stageAll', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.stageAll(repoPath)
    })
  )

  ipcMain.handle('git:unstageAll', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.unstageAll(repoPath)
    })
  )

  ipcMain.handle('git:getDiff', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath, staged } = GitDiffPayload.parse(raw)
      return services.git.getDiff(repoPath, filePath, staged)
    })
  )

  ipcMain.handle('git:commit', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, message } = GitCommitPayload.parse(raw)
      return services.git.commit(repoPath, message)
    })
  )

  ipcMain.handle('git:setLocalIdentity', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, name, email } = GitSetIdentityPayload.parse(raw)
      return services.git.setLocalIdentity(repoPath, name, email)
    })
  )

  ipcMain.handle('git:getRemotes', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getRemotes(repoPath)
    })
  )

  ipcMain.handle('git:fetch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, remote } = GitRemoteOpPayload.parse(raw)
      return services.git.fetch(repoPath, remote)
    })
  )

  ipcMain.handle('git:pull', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, remote, branch } = GitRemoteBranchOpPayload.parse(raw)
      return services.git.pull(repoPath, remote, branch)
    })
  )

  ipcMain.handle('git:push', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, remote, branch } = GitRemoteBranchOpPayload.parse(raw)
      return services.git.push(repoPath, remote, branch)
    })
  )

  ipcMain.handle('git:getBranches', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath } = GitRepoPathPayload.parse(raw)
      return services.git.getBranches(repoPath)
    })
  )

  ipcMain.handle('git:switchBranch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, branch } = GitBranchOpPayload.parse(raw)
      return services.git.switchBranch(repoPath, branch)
    })
  )

  ipcMain.handle('git:createBranch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, name } = GitCreateBranchPayload.parse(raw)
      return services.git.createBranch(repoPath, name)
    })
  )

  ipcMain.handle('git:deleteBranch', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, branch } = GitBranchOpPayload.parse(raw)
      return services.git.deleteBranch(repoPath, branch)
    })
  )

  ipcMain.handle('git:getCommitHistory', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, limit, skip } = GitHistoryPayload.parse(raw)
      return services.git.getCommitHistory(repoPath, limit, skip)
    })
  )

  ipcMain.handle('git:discardFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.discardFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:cleanFile', (_e, raw: unknown) =>
    wrap(async () => {
      const { repoPath, filePath } = GitFilePathPayload.parse(raw)
      return services.git.cleanFile(repoPath, filePath)
    })
  )

  ipcMain.handle('git:validateGitPath', (_e, raw: unknown) =>
    wrap(async () => {
      const { gitPath } = GitValidatePathPayload.parse(raw)
      return services.git.validateGitPath(gitPath)
    })
  )
}
