import React, { useEffect, useRef, useState } from 'react'
import type { RepositoryRecord } from '../../core/types'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useProfilesStore } from '../store/profilesStore'
import { useAppStore } from '../store/appStore'
import Dropdown from '../components/Dropdown'
import ResizableMainSplit from '../components/ResizableMainSplit'
import { STR } from '../strings'

type Mode = 'idle' | 'add' | 'edit'

interface EditForm {
  name: string
  assignedProfileId: string
  notes: string
}

function editFormFromRepo(r: RepositoryRecord): EditForm {
  return {
    name: r.name,
    assignedProfileId: r.assignedProfileId ?? '',
    notes: r.notes ?? '',
  }
}

export default function RepositoriesScreen(): React.ReactElement {
  const { repos, addRepository, updateRepo, removeRepo } = useRepositoriesStore()
  const { profiles, activeProfileId } = useProfilesStore()
  const setActiveRepo = useAppStore((s) => s.setActiveRepo)

  const [mode, setMode] = useState<Mode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addPath, setAddPath] = useState('')
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    assignedProfileId: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const selectedRepo = repos.find((r) => r.id === selectedId) ?? null

  function selectRepo(r: RepositoryRecord) {
    setSelectedId(r.id)
    setEditForm(editFormFromRepo(r))
    setMode('edit')
    setError(null)
    setSuccessMessage(null)
    setConfirmRemove(false)
    setActiveRepo(r)
  }

  function startAdd() {
    setSelectedId(null)
    setAddPath('')
    setMode('add')
    setError(null)
    setSuccessMessage(null)
  }

  async function handleBrowse() {
    const res = await window.api.dialog.openDirectory()
    if (res.ok && res.data) setAddPath(res.data)
  }

  async function handleValidateAndAdd() {
    setError(null)
    setSuccessMessage(null)
    const trimmed = addPath.trim()
    if (!trimmed) {
      setError('Enter or browse to a repository path.')
      return
    }
    setSaving(true)
    try {
      const repo = await addRepository(trimmed)
      selectRepo(repo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      await updateRepo(selectedId, {
        name: editForm.name.trim() || selectedRepo?.name,
        assignedProfileId: editForm.assignedProfileId || undefined,
        notes: editForm.notes.trim() || undefined,
      })
      setSuccessMessage(STR.REPOSITORY_SAVED)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!selectedId) return
    setSaving(true)
    setSuccessMessage(null)
    try {
      await removeRepo(selectedId)
      setSelectedId(null)
      setMode('idle')
      setConfirmRemove(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const assignedProfile = profiles.find((p) => p.id === selectedRepo?.assignedProfileId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId)
  const hasMismatch =
    mode === 'edit' &&
    Boolean(selectedRepo?.assignedProfileId) &&
    Boolean(activeProfileId) &&
    selectedRepo?.assignedProfileId !== activeProfileId

  return (
    <div data-testid="screen-repositories" style={{ display: 'flex', height: '100%', minWidth: 0 }}>
      <ResizableMainSplit
        storageKey="gitwarden.layout.repositoriesSplit.v1"
        resizeLabel={STR.REPOSITORIES_SPLIT_RESIZE_LABEL}
        handleTestId="repositories-main-resize-handle"
        startPaneTestId="repositories-list-pane"
        endPaneTestId="repositories-detail-pane"
        defaultStartWidth={220}
        minStartWidth={180}
        maxStartWidth={360}
        minEndWidth={220}
        start={
          <div
            style={{
              flex: 1,
              minHeight: 0,
              borderRight: '1px solid var(--gw-border, #27272a)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '12px 12px 8px',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--gw-text-dim, #52525b)',
              }}
            >
              REPOSITORIES
            </div>

            <div data-testid="repos-list" style={{ flex: 1, overflowY: 'auto' }}>
              {repos.length === 0 && (
                <div
                  style={{
                    padding: 12,
                    fontSize: 14,
                    color: 'var(--gw-text-dim, #52525b)',
                    fontStyle: 'italic',
                  }}
                >
                  No repositories yet
                </div>
              )}
              {repos.map((r) => {
                const assigned = profiles.find((p) => p.id === r.assignedProfileId)
                const mismatch =
                  r.assignedProfileId && activeProfileId && r.assignedProfileId !== activeProfileId
                return (
                  <button
                    key={r.id}
                    data-testid="repo-item"
                    onClick={() => selectRepo(r)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      width: '100%',
                      padding: '8px 12px',
                      background:
                        selectedId === r.id ? 'var(--gw-surface2, #27272a)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--gw-border, #27272a)',
                      color: 'var(--gw-text, #f4f4f5)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      gap: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {mismatch && (
                        <span
                          data-testid="repo-item-mismatch"
                          title="Profile mismatch"
                          style={{ color: 'var(--gw-warning, #fbbf24)', fontSize: 14 }}
                        >
                          ⚠
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 14,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.name}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: 'var(--gw-text-dim, #52525b)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {assigned ? assigned.displayName : 'Unassigned'}
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--gw-border, #27272a)' }}>
              <button
                data-testid="repos-add-btn"
                onClick={startAdd}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  background: 'var(--gw-surface3, #3f3f46)',
                  border: 'none',
                  borderRadius: 4,
                  color: 'var(--gw-text, #f4f4f5)',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                + Add Repository
              </button>
            </div>
          </div>
        }
        end={
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 }}>
            {mode === 'idle' && (
              <div
                style={{
                  display: 'flex',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gw-text-dim, #52525b)',
                  fontSize: 14,
                }}
              >
                Select a repository or add one.
              </div>
            )}

            {mode === 'add' && (
              <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--gw-text, #f4f4f5)',
                  }}
                >
                  Add Repository
                </h2>

                <Field label="Repository Path">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      data-testid="repo-path-input"
                      value={addPath}
                      onChange={(e) => setAddPath(e.target.value)}
                      placeholder="/path/to/your/repo"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      data-testid="repo-browse-btn"
                      onClick={() => {
                        void handleBrowse()
                      }}
                      style={{
                        padding: '6px 10px',
                        background: 'var(--gw-surface3, #3f3f46)',
                        border: 'none',
                        borderRadius: 4,
                        color: 'var(--gw-text, #f4f4f5)',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      Browse
                    </button>
                  </div>
                </Field>

                {error && (
                  <div
                    data-testid="repo-error"
                    style={{ fontSize: 14, color: 'var(--gw-danger, #f87171)' }}
                  >
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    data-testid="repo-validate-btn"
                    onClick={() => {
                      void handleValidateAndAdd()
                    }}
                    disabled={saving}
                    style={{
                      padding: '6px 18px',
                      background: 'var(--gw-primary, #2563eb)',
                      border: 'none',
                      borderRadius: 4,
                      color: 'var(--gw-on-solid, #fff)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {saving ? 'Validating…' : 'Validate & Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('idle')}
                    style={{
                      padding: '6px 14px',
                      background: 'none',
                      border: '1px solid var(--gw-surface3, #3f3f46)',
                      borderRadius: 4,
                      color: 'var(--gw-text-muted, #a1a1aa)',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {mode === 'edit' && selectedRepo && (
              <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {hasMismatch && (
                  <div
                    data-testid="repo-mismatch-warning"
                    style={{
                      padding: '10px 14px',
                      background: 'var(--gw-warning-bg, #422006)',
                      border: '1px solid var(--gw-warning-border, #78350f)',
                      borderRadius: 6,
                      fontSize: 14,
                      color: 'var(--gw-warning, #fbbf24)',
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠ This repository is assigned to{' '}
                    <strong>{assignedProfile?.displayName ?? 'a profile'}</strong>, but your active
                    profile is <strong>{activeProfile?.displayName ?? 'another profile'}</strong>.
                    Switch profiles before committing.
                  </div>
                )}

                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--gw-text, #f4f4f5)',
                  }}
                >
                  Repository
                </h2>

                <RepositoryPathField path={selectedRepo.localPath} />

                <Field label="Name">
                  <input
                    data-testid="repo-form-name"
                    value={editForm.name}
                    onChange={(e) => {
                      setSuccessMessage(null)
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Assigned Profile">
                  <Dropdown
                    testId="repo-form-profile"
                    ariaLabel="Assigned profile"
                    block
                    value={editForm.assignedProfileId}
                    onChange={(id) => {
                      setSuccessMessage(null)
                      setEditForm((f) => ({ ...f, assignedProfileId: id }))
                    }}
                    options={[
                      { value: '', label: '— Unassigned —' },
                      ...profiles.map((p) => ({ value: p.id, label: p.displayName })),
                    ]}
                    triggerStyle={inputStyle}
                  />
                </Field>

                <Field label="Notes">
                  <textarea
                    data-testid="repo-form-notes"
                    value={editForm.notes}
                    onChange={(e) => {
                      setSuccessMessage(null)
                      setEditForm((f) => ({ ...f, notes: e.target.value }))
                    }}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </Field>

                {error && (
                  <div
                    data-testid="repo-error"
                    style={{ fontSize: 14, color: 'var(--gw-danger, #f87171)' }}
                  >
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div
                    data-testid="repo-saved-msg"
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 14, color: 'var(--gw-success, #4ade80)' }}
                  >
                    {successMessage}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                  <button
                    data-testid="repo-save-btn"
                    onClick={() => {
                      void handleSave()
                    }}
                    disabled={saving}
                    style={{
                      width: '100%',
                      padding: '8px 14px',
                      background: 'var(--gw-primary, #2563eb)',
                      border: 'none',
                      borderRadius: 4,
                      color: 'var(--gw-on-solid, #fff)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>

                  {!confirmRemove ? (
                    <button
                      data-testid="repo-remove-btn"
                      onClick={() => setConfirmRemove(true)}
                      disabled={saving}
                      style={{
                        width: '100%',
                        padding: '8px 14px',
                        background: 'none',
                        border: '1px solid var(--gw-danger-border, #7f1d1d)',
                        borderRadius: 4,
                        color: 'var(--gw-danger, #f87171)',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                      }}
                    >
                      Remove from App
                    </button>
                  ) : (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 4,
                        border: '1px solid var(--gw-border-subtle, #3f3f46)',
                        background: 'var(--gw-surface2, #27272a)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}>
                        Remove &ldquo;{selectedRepo.name}&rdquo; from GitWarden?
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(false)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            background: 'none',
                            border: '1px solid var(--gw-surface3, #3f3f46)',
                            borderRadius: 4,
                            color: 'var(--gw-text-muted, #a1a1aa)',
                            cursor: 'pointer',
                            fontSize: 14,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          data-testid="repo-remove-confirm-btn"
                          onClick={() => {
                            void handleRemove()
                          }}
                          disabled={saving}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            background: 'var(--gw-danger-solid, #dc2626)',
                            border: 'none',
                            borderRadius: 4,
                            color: 'var(--gw-on-solid, #fff)',
                            cursor: saving ? 'wait' : 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        }
      />
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--gw-input-bg, #09090b)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text, #f4f4f5)',
  fontSize: 14,
  boxSizing: 'border-box',
}

function splitLocalPath(path: string): { directory: string; name: string } {
  const trimmed = path.replace(/[/\\]+$/, '')
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (lastSlash < 0) return { directory: '', name: trimmed }
  return {
    directory: trimmed.slice(0, lastSlash + 1),
    name: trimmed.slice(lastSlash + 1),
  }
}

function RepositoryPathField({ path }: { path: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { directory, name } = splitLocalPath(path)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can reject when the window is not focused.
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--gw-text-faint, #71717a)',
            letterSpacing: '0.04em',
          }}
        >
          PATH
        </span>
        <button
          type="button"
          data-testid="repo-path-copy-btn"
          onClick={() => {
            void handleCopy()
          }}
          aria-label={STR.REPOSITORY_PATH_COPY}
          style={{
            padding: '2px 8px',
            background: 'none',
            border: 'none',
            color: copied ? 'var(--gw-success, #4ade80)' : 'var(--gw-info, #60a5fa)',
            cursor: 'pointer',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {copied ? STR.REPOSITORY_PATH_COPIED : STR.REPOSITORY_PATH_COPY}
        </button>
      </div>
      <div
        data-testid="repo-form-path"
        title={path}
        style={{
          ...inputStyle,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: '8px 10px',
        }}
      >
        {directory ? (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.4,
              color: 'var(--gw-text-dim, #52525b)',
              overflowWrap: 'anywhere',
            }}
          >
            {directory}
          </span>
        ) : null}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--gw-text-muted, #a1a1aa)',
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </span>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--gw-text-faint, #71717a)',
          letterSpacing: '0.04em',
        }}
      >
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  )
}
