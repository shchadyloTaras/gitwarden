import React, { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useOnboardingStore } from '../store/onboardingStore'
import { useUpdatesStore } from '../store/updatesStore'
import AiConnectionSettings from '../components/AiConnectionSettings'
import type { AppearanceMode } from '../../core/types'
import { STR } from '../strings'
import { applyTheme } from '../theme'

type SettingsTab = 'general' | 'ai' | 'walkthrough'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: STR.SETTINGS_TAB_GENERAL },
  { id: 'ai', label: STR.SETTINGS_TAB_AI },
  { id: 'walkthrough', label: STR.SETTINGS_TAB_WALKTHROUGH },
]

const CARD: React.CSSProperties = {
  background: 'var(--gw-surface, #18181b)',
  border: '1px solid var(--gw-border, #27272a)',
  borderRadius: 8,
  padding: '20px 24px',
  marginBottom: 20,
}

const CARD_TITLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 14,
  color: 'var(--gw-text, #f4f4f5)',
}

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
    <div data-testid="settings-appearance-picker" style={{ display: 'flex', gap: 6 }}>
      {modes.map((m) => (
        <button
          key={m.id}
          data-testid={`settings-appearance-${m.id}`}
          onClick={() => onChange(m.id)}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            fontSize: 14,
            cursor: 'pointer',
            border:
              value === m.id
                ? '2px solid var(--gw-accent, #6366f1)'
                : '1px solid var(--gw-surface3, #3f3f46)',
            background:
              value === m.id ? 'var(--gw-accent-soft, #1e1b4b)' : 'var(--gw-surface2, #27272a)',
            color:
              value === m.id ? 'var(--gw-accent-text, #a5b4fc)' : 'var(--gw-text-muted, #a1a1aa)',
            fontWeight: value === m.id ? 600 : 400,
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

const SECONDARY_BUTTON: React.CSSProperties = {
  padding: '6px 12px',
  background: 'none',
  border: '1px solid var(--gw-surface3, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  fontSize: 14,
  cursor: 'pointer',
  flexShrink: 0,
}

const ACCENT_BUTTON: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--gw-accent, #6366f1)',
  border: 'none',
  borderRadius: 4,
  color: 'var(--gw-on-solid, #fff)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
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
    <div style={CARD}>
      <div style={CARD_TITLE}>{STR.UPDATE_SETTINGS_TITLE}</div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <button
          data-testid="settings-update-check"
          onClick={() => void check()}
          disabled={checking}
          style={{ ...SECONDARY_BUTTON, opacity: checking ? 0.6 : 1 }}
        >
          {checking ? STR.UPDATE_CHECKING : STR.UPDATE_CHECK_BUTTON}
        </button>
        {release && (
          <button
            data-testid="settings-update-download"
            onClick={() => void window.api.shell.openExternal(release.url)}
            style={ACCENT_BUTTON}
          >
            {STR.UPDATE_DOWNLOAD_BUTTON}
          </button>
        )}
        {status && (
          <span
            data-testid="settings-update-status"
            style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}
          >
            {status}
          </span>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--gw-text-faint, #71717a)' }}>
        {STR.UPDATE_SETTINGS_HINT}
      </p>
    </div>
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

  return (
    <div
      data-testid="screen-settings"
      style={{ padding: '24px 32px', maxWidth: 680, color: 'var(--gw-text, #f4f4f5)' }}
    >
      <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600 }}>{STR.SETTINGS_TITLE}</h2>

      {loading && (
        <div
          data-testid="settings-loading"
          style={{ color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}
        >
          {STR.LOADING}
        </div>
      )}

      {!loading && (
        <>
          <div
            role="tablist"
            data-testid="settings-tabs"
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 20,
              borderBottom: '1px solid var(--gw-border, #27272a)',
            }}
          >
            {TABS.map((tab) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={selected}
                  data-testid={`settings-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: selected
                      ? '2px solid var(--gw-accent, #6366f1)'
                      : '2px solid transparent',
                    color: selected ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-muted, #a1a1aa)',
                    fontSize: 14,
                    fontWeight: selected ? 600 : 400,
                    cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* General — Appearance + Updates */}
          {activeTab === 'general' && (
            <div role="tabpanel" data-testid="settings-tabpanel-general">
              {/* Appearance */}
              <div style={CARD}>
                <div style={CARD_TITLE}>{STR.SETTINGS_APPEARANCE_LABEL}</div>
                <AppearancePicker value={localAppearance} onChange={handleAppearanceChange} />
                <p
                  style={{
                    marginTop: 10,
                    marginBottom: 0,
                    fontSize: 14,
                    color: 'var(--gw-text-faint, #71717a)',
                  }}
                >
                  {STR.SETTINGS_APPEARANCE_HINT}
                </p>
              </div>

              <UpdatesCard />
            </div>
          )}

          {/* AI Assistant — token-first single active connection (manages its own saves). */}
          {activeTab === 'ai' && (
            <div role="tabpanel" data-testid="settings-tabpanel-ai">
              <AiConnectionSettings />
            </div>
          )}

          {/* Walkthrough — guided introduction replay */}
          {activeTab === 'walkthrough' && (
            <div role="tabpanel" data-testid="settings-tabpanel-walkthrough">
              <div data-testid="settings-onboarding-card" style={CARD}>
                <div style={{ ...CARD_TITLE, marginBottom: 10 }}>
                  {STR.SETTINGS_ONBOARDING_LABEL}
                </div>
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 16,
                    fontSize: 14,
                    color: 'var(--gw-text-faint, #71717a)',
                  }}
                >
                  {STR.SETTINGS_ONBOARDING_HINT}
                </p>
                <ol
                  style={{
                    margin: '0 0 20px',
                    padding: '0 0 0 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {[
                    STR.ONBOARDING_STEP_WELCOME_TITLE,
                    STR.ONBOARDING_STEP_HEADER_TITLE,
                    STR.ONBOARDING_STEP_NAV_TITLE,
                    STR.ONBOARDING_STEP_PROFILES_TITLE,
                    STR.ONBOARDING_STEP_REPOS_TITLE,
                    STR.ONBOARDING_STEP_STATUS_TITLE,
                    STR.ONBOARDING_STEP_COMMIT_TITLE,
                    STR.ONBOARDING_STEP_REMOTE_TITLE,
                    STR.ONBOARDING_STEP_SAFETY_TITLE,
                    STR.ONBOARDING_STEP_AI_CHAT_TITLE,
                    STR.ONBOARDING_STEP_AI_SETTINGS_TITLE,
                    STR.ONBOARDING_STEP_SETTINGS_TITLE,
                  ].map((title) => (
                    <li
                      key={title}
                      style={{ fontSize: 13, color: 'var(--gw-text-muted, #a1a1aa)' }}
                    >
                      {title}
                    </li>
                  ))}
                </ol>
                <button
                  data-testid="settings-start-onboarding"
                  onClick={startOnboarding}
                  style={{
                    padding: '7px 14px',
                    background: 'var(--gw-surface3, #3f3f46)',
                    border: 'none',
                    borderRadius: 4,
                    color: 'var(--gw-text, #f4f4f5)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {STR.SETTINGS_ONBOARDING_START}
                </button>
              </div>
            </div>
          )}

          {/* Save — persists Appearance */}
          {showSaveRow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                data-tooltip={dirty ? undefined : STR.SETTINGS_SAVE_NO_CHANGES}
                style={{ display: 'inline-block' }}
              >
                <button
                  data-testid="settings-save"
                  disabled={!dirty}
                  onClick={() => void handleSave()}
                  style={{
                    padding: '8px 20px',
                    background: dirty ? 'var(--gw-accent, #6366f1)' : 'var(--gw-surface2, #27272a)',
                    color: dirty ? 'var(--gw-on-solid, #fff)' : 'var(--gw-text-dim, #52525b)',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: dirty ? 'pointer' : 'not-allowed',
                  }}
                >
                  {STR.SETTINGS_SAVE}
                </button>
              </span>

              {saved && (
                <span
                  data-testid="settings-saved-msg"
                  style={{ fontSize: 14, color: 'var(--gw-success, #4ade80)' }}
                >
                  {STR.SETTINGS_SAVED}
                </span>
              )}

              {saveError && (
                <span
                  data-testid="settings-save-error"
                  style={{ fontSize: 14, color: 'var(--gw-danger, #f87171)' }}
                >
                  {saveError}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
