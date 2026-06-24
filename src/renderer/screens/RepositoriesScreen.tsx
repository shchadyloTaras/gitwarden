import React, { useState } from 'react'
import type { RepositoryRecord } from '../../core/types'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useProfilesStore } from '../store/profilesStore'
import { useAppStore } from '../store/appStore'

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
  const [editForm, setEditForm] = useState<EditForm>({ name: '', assignedProfileId: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const selectedRepo = repos.find((r) => r.id === selectedId) ?? null

  function selectRepo(r: RepositoryRecord) {
    setSelectedId(r.id)
    setEditForm(editFormFromRepo(r))
    setMode('edit')
    setError(null)
    setConfirmRemove(false)
    setActiveRepo(r)
  }

  function startAdd() {
    setSelectedId(null)
    setAddPath('')
    setMode('add')
    setError(null)
  }

  async function handleBrowse() {
    const res = await window.api.dialog.openDirectory()
    if (res.ok && res.data) setAddPath(res.data)
  }

  async function handleValidateAndAdd() {
    setError(null)
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
    try {
      await updateRepo(selectedId, {
        name: editForm.name.trim() || selectedRepo?.name,
        assignedProfileId: editForm.assignedProfileId || undefined,
        notes: editForm.notes.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!selectedId) return
    setSaving(true)
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
    <div data-testid="screen-repositories" style={{ display: 'flex', height: '100%' }}>
      {/* Left: repo list */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: '1px solid #27272a',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 12px 8px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#52525b',
          }}
        >
          REPOSITORIES
        </div>

        <div data-testid="repos-list" style={{ flex: 1, overflowY: 'auto' }}>
          {repos.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: '#52525b', fontStyle: 'italic' }}>
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
                  background: selectedId === r.id ? '#27272a' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #1c1c1f',
                  color: '#e4e4e7',
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
                      style={{ color: '#f97316', fontSize: 10 }}
                    >
                      ⚠
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 13,
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
                    fontSize: 10,
                    color: '#52525b',
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

        <div style={{ padding: '8px 12px', borderTop: '1px solid #27272a' }}>
          <button
            data-testid="repos-add-btn"
            onClick={startAdd}
            style={{
              width: '100%',
              padding: '6px 0',
              background: '#3f3f46',
              border: 'none',
              borderRadius: 4,
              color: '#e4e4e7',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            + Add Repository
          </button>
        </div>
      </div>

      {/* Right: content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {mode === 'idle' && (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#52525b',
              fontSize: 13,
            }}
          >
            Select a repository or add one.
          </div>
        )}

        {mode === 'add' && (
          <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f4f4f5' }}>
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
                    background: '#3f3f46',
                    border: 'none',
                    borderRadius: 4,
                    color: '#e4e4e7',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Browse
                </button>
              </div>
            </Field>

            {error && (
              <div data-testid="repo-error" style={{ fontSize: 12, color: '#f87171' }}>
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
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: saving ? 'wait' : 'pointer',
                  fontSize: 12,
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
                  border: '1px solid #3f3f46',
                  borderRadius: 4,
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontSize: 12,
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
                  background: '#431407',
                  border: '1px solid #9a3412',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#fdba74',
                  lineHeight: 1.5,
                }}
              >
                ⚠ This repository is assigned to{' '}
                <strong>{assignedProfile?.displayName ?? 'a profile'}</strong>, but your active
                profile is <strong>{activeProfile?.displayName ?? 'another profile'}</strong>.
                Switch profiles before committing.
              </div>
            )}

            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f4f4f5' }}>
              Repository
            </h2>

            <Field label="Path">
              <div
                style={{
                  ...inputStyle,
                  color: '#71717a',
                  fontFamily: 'monospace',
                  userSelect: 'text',
                }}
              >
                {selectedRepo.localPath}
              </div>
            </Field>

            <Field label="Name">
              <input
                data-testid="repo-form-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
              />
            </Field>

            <Field label="Assigned Profile">
              <select
                data-testid="repo-form-profile"
                value={editForm.assignedProfileId}
                onChange={(e) => setEditForm((f) => ({ ...f, assignedProfileId: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— Unassigned —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Notes">
              <textarea
                data-testid="repo-form-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>

            {error && (
              <div data-testid="repo-error" style={{ fontSize: 12, color: '#f87171' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                data-testid="repo-save-btn"
                onClick={() => {
                  void handleSave()
                }}
                disabled={saving}
                style={{
                  padding: '6px 18px',
                  background: '#2563eb',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: saving ? 'wait' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              {!confirmRemove && (
                <button
                  data-testid="repo-remove-btn"
                  onClick={() => setConfirmRemove(true)}
                  disabled={saving}
                  style={{
                    marginLeft: 'auto',
                    padding: '6px 14px',
                    background: 'none',
                    border: '1px solid #3f3f46',
                    borderRadius: 4,
                    color: '#f87171',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Remove from App
                </button>
              )}

              {confirmRemove && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>
                    Remove &ldquo;{selectedRepo.name}&rdquo;?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    style={{
                      padding: '4px 10px',
                      background: 'none',
                      border: '1px solid #3f3f46',
                      borderRadius: 4,
                      color: '#a1a1aa',
                      cursor: 'pointer',
                      fontSize: 12,
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
                      padding: '4px 10px',
                      background: '#dc2626',
                      border: 'none',
                      borderRadius: 4,
                      color: '#fff',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 4,
  color: '#e4e4e7',
  fontSize: 13,
  boxSizing: 'border-box',
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
      <label style={{ fontSize: 11, fontWeight: 600, color: '#71717a', letterSpacing: '0.04em' }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  )
}
