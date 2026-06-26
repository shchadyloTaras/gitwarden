import React, { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useOnboardingStore } from '../store/onboardingStore'
import AiConnectionSettings from '../components/AiConnectionSettings'
import type { AppearanceMode } from '../../core/types'
import { STR } from '../strings'

type SettingsTab = 'general' | 'git' | 'ai' | 'walkthrough'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: STR.SETTINGS_TAB_GENERAL },
  { id: 'git', label: STR.SETTINGS_TAB_GIT },
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

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.05em',
  color: 'var(--gw-text-muted, #a1a1aa)',
  marginBottom: 10,
}

const INPUT: React.CSSProperties = {
  background: 'var(--gw-input-bg, #09090b)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text, #f4f4f5)',
  fontSize: 14,
  padding: '6px 10px',
  flex: 1,
  minWidth: 0,
  fontFamily: 'monospace',
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

export default function SettingsScreen(): React.ReactElement {
  const { appearance, customGitPath, defaultProjectsFolder, loading, load, update } =
    useSettingsStore()
  const startOnboarding = useOnboardingStore((s) => s.start)

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [localAppearance, setLocalAppearance] = useState<AppearanceMode>('system')
  const [localGitPath, setLocalGitPath] = useState<string>('')
  const [localDefaultFolder, setLocalDefaultFolder] = useState<string>('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validateStatus, setValidateStatus] = useState<
    { ok: true; version: string } | { ok: false; error: string } | 'validating' | null
  >(null)

  const didLoad = useRef(false)

  useEffect(() => {
    void load()
  }, [load])

  // Sync store values into local form state once loaded
  useEffect(() => {
    if (!loading && !didLoad.current) {
      didLoad.current = true
      setLocalAppearance(appearance)
      setLocalGitPath(customGitPath ?? '')
      setLocalDefaultFolder(defaultProjectsFolder ?? '')
    }
  }, [loading, appearance, customGitPath, defaultProjectsFolder])

  function handleAppearanceChange(mode: AppearanceMode): void {
    setLocalAppearance(mode)
    setDirty(true)
    setSaved(false)
  }

  function handleGitPathChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setLocalGitPath(e.target.value)
    setDirty(true)
    setSaved(false)
    setValidateStatus(null)
  }

  function handleDefaultFolderChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setLocalDefaultFolder(e.target.value)
    setDirty(true)
    setSaved(false)
  }

  async function handleBrowseDefaultFolder(): Promise<void> {
    const result = await window.api.dialog.openDirectory()
    if (result.ok && result.data) {
      setLocalDefaultFolder(result.data)
      setDirty(true)
      setSaved(false)
    }
  }

  async function handleValidate(): Promise<void> {
    const p = localGitPath.trim()
    if (!p) return
    setValidateStatus('validating')
    const result = await window.api.git.validateGitPath(p)
    if (result.ok) {
      setValidateStatus({ ok: true, version: result.data.version })
    } else {
      setValidateStatus({ ok: false, error: result.error })
    }
  }

  async function handleSave(): Promise<void> {
    setSaveError(null)
    setSaved(false)
    try {
      await update({
        appearance: localAppearance,
        customGitPath: localGitPath.trim() || undefined,
        defaultProjectsFolder: localDefaultFolder.trim() || undefined,
      })
      setDirty(false)
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : STR.SETTINGS_SAVE_ERROR)
    }
  }

  // Appearance + Default Projects Folder feed the shared save below; the Save row is
  // shown on the tabs that contribute to it (General and Git).
  const showSaveRow = activeTab === 'general' || activeTab === 'git'

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

          {/* General — Appearance + Default Projects Folder */}
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

              {/* Default projects folder */}
              <div style={CARD}>
                <div style={CARD_TITLE}>{STR.SETTINGS_DEFAULT_FOLDER_LABEL}</div>

                <label style={LABEL}>{STR.SETTINGS_DEFAULT_FOLDER_INPUT_LABEL}</label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    data-testid="settings-default-folder-input"
                    type="text"
                    value={localDefaultFolder}
                    onChange={handleDefaultFolderChange}
                    placeholder={STR.SETTINGS_DEFAULT_FOLDER_PLACEHOLDER}
                    style={INPUT}
                  />
                  <button
                    data-testid="settings-default-folder-browse"
                    onClick={() => void handleBrowseDefaultFolder()}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid var(--gw-surface3, #3f3f46)',
                      borderRadius: 4,
                      color: 'var(--gw-text-muted, #a1a1aa)',
                      fontSize: 14,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {STR.BTN_BROWSE}
                  </button>
                  {localDefaultFolder && (
                    <button
                      data-testid="settings-default-folder-clear"
                      onClick={() => {
                        setLocalDefaultFolder('')
                        setDirty(true)
                        setSaved(false)
                      }}
                      style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: '1px solid var(--gw-surface3, #3f3f46)',
                        borderRadius: 4,
                        color: 'var(--gw-text-faint, #71717a)',
                        fontSize: 14,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {STR.SETTINGS_DEFAULT_FOLDER_CLEAR}
                    </button>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: 14, color: 'var(--gw-text-faint, #71717a)' }}>
                  {STR.SETTINGS_DEFAULT_FOLDER_HINT}
                </p>
              </div>
            </div>
          )}

          {/* Git — Custom Git Path */}
          {activeTab === 'git' && (
            <div role="tabpanel" data-testid="settings-tabpanel-git">
              <div style={CARD}>
                <div style={CARD_TITLE}>{STR.SETTINGS_GIT_PATH_LABEL}</div>

                <label style={LABEL}>{STR.SETTINGS_GIT_PATH_INPUT_LABEL}</label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    data-testid="settings-git-path-input"
                    type="text"
                    value={localGitPath}
                    onChange={handleGitPathChange}
                    placeholder={STR.SETTINGS_GIT_PATH_PLACEHOLDER}
                    style={INPUT}
                  />
                  <button
                    data-testid="settings-git-path-validate"
                    disabled={!localGitPath.trim() || validateStatus === 'validating'}
                    onClick={() => void handleValidate()}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid var(--gw-surface3, #3f3f46)',
                      borderRadius: 4,
                      color: 'var(--gw-text-muted, #a1a1aa)',
                      fontSize: 14,
                      cursor: localGitPath.trim() ? 'pointer' : 'not-allowed',
                      flexShrink: 0,
                      opacity: !localGitPath.trim() ? 0.4 : 1,
                    }}
                  >
                    {validateStatus === 'validating'
                      ? STR.SETTINGS_GIT_PATH_VALIDATING
                      : STR.SETTINGS_GIT_PATH_VALIDATE}
                  </button>
                  {localGitPath && (
                    <button
                      data-testid="settings-git-path-clear"
                      onClick={() => {
                        setLocalGitPath('')
                        setValidateStatus(null)
                        setDirty(true)
                      }}
                      style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: '1px solid var(--gw-surface3, #3f3f46)',
                        borderRadius: 4,
                        color: 'var(--gw-text-faint, #71717a)',
                        fontSize: 14,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {STR.SETTINGS_GIT_PATH_CLEAR}
                    </button>
                  )}
                </div>

                {/* Validation status */}
                {validateStatus !== null && validateStatus !== 'validating' && (
                  <div
                    data-testid={validateStatus.ok ? 'settings-git-valid' : 'settings-git-invalid'}
                    style={{
                      fontSize: 14,
                      color: validateStatus.ok
                        ? 'var(--gw-success, #4ade80)'
                        : 'var(--gw-danger, #f87171)',
                      marginBottom: 6,
                    }}
                  >
                    {validateStatus.ok
                      ? STR.SETTINGS_GIT_VALID(validateStatus.version)
                      : STR.SETTINGS_GIT_INVALID}
                  </div>
                )}

                <p style={{ margin: 0, fontSize: 14, color: 'var(--gw-text-faint, #71717a)' }}>
                  {STR.SETTINGS_GIT_PATH_HINT}
                </p>
              </div>
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
                    marginBottom: 12,
                    fontSize: 14,
                    color: 'var(--gw-text-faint, #71717a)',
                  }}
                >
                  {STR.SETTINGS_ONBOARDING_HINT}
                </p>
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

          {/* Save — persists Appearance, Default Projects Folder and Custom Git Path together */}
          {showSaveRow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                title={dirty ? undefined : 'No changes to save.'}
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
