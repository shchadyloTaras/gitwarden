import React, { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useOnboardingStore } from '../store/onboardingStore'
import { useUpdatesStore } from '../store/updatesStore'
import AiConnectionSettings from '../components/AiConnectionSettings'
import type { AppearanceMode } from '../../core/types'
import { STR } from '../strings'
import { applyTheme } from '../theme'
import './workflowScreens.css'

type SettingsTab = 'general' | 'ai' | 'walkthrough'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: STR.SETTINGS_TAB_GENERAL },
  { id: 'ai', label: STR.SETTINGS_TAB_AI },
  { id: 'walkthrough', label: STR.SETTINGS_TAB_WALKTHROUGH },
]

function AppearancePicker({
  value,
  onChange,
}: {
  value: AppearanceMode
  onChange(mode: AppearanceMode): void
}): React.ReactElement {
  const modes: { id: AppearanceMode; label: string }[] = [
    { id: 'system', label: STR.SETTINGS_APPEARANCE_SYSTEM },
    { id: 'light', label: STR.SETTINGS_APPEARANCE_LIGHT },
    { id: 'dark', label: STR.SETTINGS_APPEARANCE_DARK },
  ]
  return (
    <div
      data-testid="settings-appearance-picker"
      className="gw-toolbar gw-settings-choice-group"
      role="group"
      aria-labelledby="settings-appearance-title"
    >
      {modes.map((m) => (
        <button
          type="button"
          key={m.id}
          data-testid={`settings-appearance-${m.id}`}
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={`gw-button gw-button--secondary gw-workflow-button gw-settings-choice${
            value === m.id ? ' gw-settings-choice--selected' : ''
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

/** Manual "Check for updates" + status, mirroring the header notifier (no in-app install). */
function UpdatesCard(): React.ReactElement {
  const result = useUpdatesStore((s) => s.result)
  const checking = useUpdatesStore((s) => s.checking)
  const check = useUpdatesStore((s) => s.check)

  const release = result?.status === 'update-available' ? result.release : null

  let status: string | null = null
  if (checking) {
    status = STR.UPDATE_CHECKING
  } else if (result) {
    switch (result.status) {
      case 'update-available':
        status = STR.UPDATE_AVAILABLE(result.release.version)
        break
      case 'up-to-date':
        status = STR.UPDATE_UP_TO_DATE(result.currentVersion)
        break
      case 'no-releases':
        status = STR.UPDATE_NO_RELEASES
        break
      case 'error':
        status = STR.UPDATE_ERROR
        break
    }
  }

  return (
    <section
      className="gw-card gw-workflow-card gw-settings-card"
      aria-labelledby="settings-updates-title"
    >
      <h2 id="settings-updates-title" className="gw-workflow-card-title">
        {STR.UPDATE_SETTINGS_TITLE}
      </h2>
      <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--wrap">
        <button
          type="button"
          data-testid="settings-update-check"
          onClick={() => void check()}
          disabled={checking}
          className="gw-button gw-button--secondary gw-workflow-button"
        >
          {checking ? STR.UPDATE_CHECKING : STR.UPDATE_CHECK_BUTTON}
        </button>
        {release && (
          <button
            type="button"
            data-testid="settings-update-download"
            onClick={() => void window.api.shell.openExternal(release.url)}
            className="gw-button gw-button--primary gw-workflow-button"
          >
            {STR.UPDATE_DOWNLOAD_BUTTON}
          </button>
        )}
        {status && (
          <span data-testid="settings-update-status" className="gw-ai-status" role="status">
            {status}
          </span>
        )}
      </div>
      <p className="gw-settings-copy">{STR.UPDATE_SETTINGS_HINT}</p>
    </section>
  )
}

export default function SettingsScreen(): React.ReactElement {
  const { appearance, loading, load, update } = useSettingsStore()
  const startOnboarding = useOnboardingStore((s) => s.start)

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [localAppearance, setLocalAppearance] = useState<AppearanceMode>('system')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const didLoad = useRef(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    void load()
  }, [load])

  // Sync store values into local form state once loaded
  useEffect(() => {
    if (!loading && !didLoad.current) {
      didLoad.current = true
      setLocalAppearance(appearance)
    }
  }, [loading, appearance])

  function handleAppearanceChange(mode: AppearanceMode): void {
    setLocalAppearance(mode)
    setDirty(true)
    setSaved(false)
    // Live preview (Phase 105): apply immediately, before Save — reverted on unmount
    // below if the user navigates away without saving.
    applyTheme(mode)
  }

  // Revert an unsaved appearance preview when the user navigates away without
  // clicking Save (Phase 105) — simplest design per the plan: no "are you sure",
  // just fall back to whatever is actually persisted. A no-op if the user DID save
  // (the store's appearance already matches what's on screen).
  useEffect(() => {
    return () => {
      applyTheme(useSettingsStore.getState().appearance)
    }
  }, [])

  async function handleSave(): Promise<void> {
    setSaveError(null)
    setSaved(false)
    try {
      await update({ appearance: localAppearance })
      setDirty(false)
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : STR.SETTINGS_SAVE_ERROR)
    }
  }

  // Appearance feeds the shared save below; the Save row is shown only on the
  // General tab, which is the one that contributes to it.
  const showSaveRow = activeTab === 'general'

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ): void {
    let nextIndex: number | null = null

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1

    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = TABS[nextIndex]
    setActiveTab(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <section
      data-testid="screen-settings"
      className="gw-page gw-workflow-page"
      aria-labelledby="settings-page-title"
      aria-busy={loading}
    >
      <header className="gw-page-header gw-workflow-page-header">
        <h1 id="settings-page-title" className="gw-page-title gw-workflow-page-title">
          {STR.SETTINGS_TITLE}
        </h1>
      </header>

      {loading && (
        <div
          data-testid="settings-loading"
          className="gw-empty-state gw-workflow-state"
          role="status"
        >
          {STR.LOADING}
        </div>
      )}

      {!loading && (
        <>
          <div
            role="tablist"
            aria-labelledby="settings-page-title"
            data-testid="settings-tabs"
            className="gw-settings-tabs"
          >
            {TABS.map((tab, index) => {
              const selected = activeTab === tab.id
              return (
                <button
                  ref={(element) => {
                    tabRefs.current[index] = element
                  }}
                  type="button"
                  id={`settings-tab-control-${tab.id}`}
                  key={tab.id}
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  data-testid={`settings-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className="gw-settings-tab"
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* General — Appearance + Updates */}
          {activeTab === 'general' && (
            <div
              id="settings-panel-general"
              role="tabpanel"
              aria-labelledby="settings-tab-control-general"
              data-testid="settings-tabpanel-general"
              className="gw-settings-panel"
            >
              {/* Appearance */}
              <section
                className="gw-card gw-workflow-card gw-settings-card"
                aria-labelledby="settings-appearance-title"
              >
                <h2 id="settings-appearance-title" className="gw-workflow-card-title">
                  {STR.SETTINGS_APPEARANCE_LABEL}
                </h2>
                <AppearancePicker value={localAppearance} onChange={handleAppearanceChange} />
                <p className="gw-settings-copy">{STR.SETTINGS_APPEARANCE_HINT}</p>
              </section>

              <UpdatesCard />
            </div>
          )}

          {/* AI Assistant — token-first single active connection (manages its own saves). */}
          {activeTab === 'ai' && (
            <div
              id="settings-panel-ai"
              role="tabpanel"
              aria-labelledby="settings-tab-control-ai"
              data-testid="settings-tabpanel-ai"
              className="gw-settings-panel"
            >
              <AiConnectionSettings />
            </div>
          )}

          {/* Walkthrough — guided introduction replay */}
          {activeTab === 'walkthrough' && (
            <div
              id="settings-panel-walkthrough"
              role="tabpanel"
              aria-labelledby="settings-tab-control-walkthrough"
              data-testid="settings-tabpanel-walkthrough"
              className="gw-settings-panel"
            >
              <section
                data-testid="settings-onboarding-card"
                className="gw-card gw-workflow-card gw-settings-card"
                aria-labelledby="settings-onboarding-title"
              >
                <h2 id="settings-onboarding-title" className="gw-workflow-card-title">
                  {STR.SETTINGS_ONBOARDING_LABEL}
                </h2>
                <p className="gw-settings-copy" style={{ marginTop: 0, marginBottom: 16 }}>
                  {STR.SETTINGS_ONBOARDING_HINT}
                </p>
                <ol className="gw-settings-steps">
                  {[
                    STR.ONBOARDING_STEP_WELCOME_TITLE,
                    STR.ONBOARDING_STEP_HEADER_TITLE,
                    STR.ONBOARDING_STEP_NAV_TITLE,
                    STR.ONBOARDING_STEP_PROFILES_TITLE,
                    STR.ONBOARDING_STEP_REPOS_TITLE,
                    STR.ONBOARDING_STEP_STATUS_TITLE,
                    STR.ONBOARDING_STEP_COMMIT_PUSH_TITLE,
                    STR.ONBOARDING_STEP_SAFETY_TITLE,
                    STR.ONBOARDING_STEP_AI_CHAT_TITLE,
                    STR.ONBOARDING_STEP_AI_SETTINGS_TITLE,
                    STR.ONBOARDING_STEP_SETTINGS_TITLE,
                  ].map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ol>
                <button
                  type="button"
                  data-testid="settings-start-onboarding"
                  onClick={startOnboarding}
                  className="gw-button gw-button--secondary gw-workflow-button"
                >
                  {STR.SETTINGS_ONBOARDING_START}
                </button>
              </section>
            </div>
          )}

          {/* Save — persists Appearance */}
          {showSaveRow && (
            <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--wrap gw-settings-save-row">
              <span
                data-tooltip={dirty ? undefined : STR.SETTINGS_SAVE_NO_CHANGES}
                style={{ display: 'inline-block' }}
              >
                <button
                  type="button"
                  data-testid="settings-save"
                  disabled={!dirty}
                  onClick={() => void handleSave()}
                  className="gw-button gw-button--primary gw-workflow-button"
                >
                  {STR.SETTINGS_SAVE}
                </button>
              </span>

              {saved && (
                <span
                  data-testid="settings-saved-msg"
                  className="gw-ai-status"
                  role="status"
                  style={{ color: 'var(--gw-success, #4ade80)' }}
                >
                  {STR.SETTINGS_SAVED}
                </span>
              )}

              {saveError && (
                <span
                  data-testid="settings-save-error"
                  className="gw-ai-status"
                  role="alert"
                  style={{ color: 'var(--gw-danger, #f87171)' }}
                >
                  {saveError}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
