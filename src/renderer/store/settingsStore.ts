import { create } from 'zustand'
import type { AppearanceMode } from '../../core/types'

interface SettingsState {
  appearance: AppearanceMode
  customGitPath: string | undefined
  defaultProjectsFolder: string | undefined
  onboardingCompletedAt: string | undefined
  onboardingSkippedAt: string | undefined
  loading: boolean
  error: string | null
  load(): Promise<void>
  update(patch: {
    appearance?: AppearanceMode
    customGitPath?: string | undefined
    defaultProjectsFolder?: string | undefined
    onboardingCompletedAt?: string | undefined
    onboardingSkippedAt?: string | undefined
  }): Promise<void>
  markOnboardingCompleted(): Promise<void>
  markOnboardingSkipped(): Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appearance: 'system',
  customGitPath: undefined,
  defaultProjectsFolder: undefined,
  onboardingCompletedAt: undefined,
  onboardingSkippedAt: undefined,
  loading: false,
  error: null,

  async load() {
    if (!window.api) return
    set({ loading: true, error: null })
    try {
      const result = await window.api.settings.get()
      if (result.ok) {
        set({
          appearance: result.data.appearance ?? 'system',
          customGitPath: result.data.customGitPath,
          defaultProjectsFolder: result.data.defaultProjectsFolder,
          onboardingCompletedAt: result.data.onboardingCompletedAt,
          onboardingSkippedAt: result.data.onboardingSkippedAt,
          loading: false,
        })
      } else {
        set({ loading: false, error: result.error })
      }
    } catch {
      set({ loading: false })
    }
  },

  async update(patch) {
    const hasCustomGitPath = Object.prototype.hasOwnProperty.call(patch, 'customGitPath')
    const hasDefaultProjectsFolder = Object.prototype.hasOwnProperty.call(
      patch,
      'defaultProjectsFolder'
    )
    const hasOnboardingCompletedAt = Object.prototype.hasOwnProperty.call(
      patch,
      'onboardingCompletedAt'
    )
    const hasOnboardingSkippedAt = Object.prototype.hasOwnProperty.call(
      patch,
      'onboardingSkippedAt'
    )
    const result = await window.api.settings.update({
      ...(patch.appearance !== undefined ? { appearance: patch.appearance } : {}),
      ...(hasCustomGitPath ? { customGitPath: patch.customGitPath || undefined } : {}),
      ...(hasDefaultProjectsFolder
        ? { defaultProjectsFolder: patch.defaultProjectsFolder || undefined }
        : {}),
      ...(hasOnboardingCompletedAt
        ? { onboardingCompletedAt: patch.onboardingCompletedAt || undefined }
        : {}),
      ...(hasOnboardingSkippedAt
        ? { onboardingSkippedAt: patch.onboardingSkippedAt || undefined }
        : {}),
    })
    if (result.ok) {
      set({
        appearance: result.data.appearance ?? 'system',
        customGitPath: result.data.customGitPath,
        defaultProjectsFolder: result.data.defaultProjectsFolder,
        onboardingCompletedAt: result.data.onboardingCompletedAt,
        onboardingSkippedAt: result.data.onboardingSkippedAt,
      })
    } else {
      set({ error: result.error })
      throw new Error(result.error)
    }
  },

  async markOnboardingCompleted() {
    await get().update({ onboardingCompletedAt: new Date().toISOString() })
  },

  async markOnboardingSkipped() {
    await get().update({ onboardingSkippedAt: new Date().toISOString() })
  },
}))
