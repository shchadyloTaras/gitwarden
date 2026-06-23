import { create } from 'zustand'
import type { AppearanceMode } from '../../core/types'

interface SettingsState {
  appearance: AppearanceMode
  customGitPath: string | undefined
  defaultProjectsFolder: string | undefined
  loading: boolean
  error: string | null
  load(): Promise<void>
  update(patch: {
    appearance?: AppearanceMode
    customGitPath?: string | undefined
    defaultProjectsFolder?: string | undefined
  }): Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  appearance: 'system',
  customGitPath: undefined,
  defaultProjectsFolder: undefined,
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null })
    const result = await window.api.settings.get()
    if (result.ok) {
      set({
        appearance: result.data.appearance ?? 'system',
        customGitPath: result.data.customGitPath,
        defaultProjectsFolder: result.data.defaultProjectsFolder,
        loading: false,
      })
    } else {
      set({ loading: false, error: result.error })
    }
  },

  async update(patch) {
    const hasCustomGitPath = Object.prototype.hasOwnProperty.call(patch, 'customGitPath')
    const hasDefaultProjectsFolder = Object.prototype.hasOwnProperty.call(
      patch,
      'defaultProjectsFolder'
    )
    const result = await window.api.settings.update({
      ...(patch.appearance !== undefined ? { appearance: patch.appearance } : {}),
      ...(hasCustomGitPath ? { customGitPath: patch.customGitPath || undefined } : {}),
      ...(hasDefaultProjectsFolder
        ? { defaultProjectsFolder: patch.defaultProjectsFolder || undefined }
        : {}),
    })
    if (result.ok) {
      set({
        appearance: result.data.appearance ?? 'system',
        customGitPath: result.data.customGitPath,
        defaultProjectsFolder: result.data.defaultProjectsFolder,
      })
    } else {
      set({ error: result.error })
      throw new Error(result.error)
    }
  },
}))
