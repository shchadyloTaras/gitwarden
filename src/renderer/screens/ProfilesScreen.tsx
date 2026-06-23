import React, { useState } from 'react'
import type { Profile } from '../../core/types'
import { useProfilesStore, profileColor } from '../store/profilesStore'

type FormMode = 'idle' | 'create' | 'edit'

interface FormData {
  displayName: string
  gitAuthorName: string
  gitAuthorEmail: string
  githubUsername: string
  sshKeyAlias: string
  expectedRemoteHosts: string[]
  newHost: string
}

const EMPTY_FORM: FormData = {
  displayName: '',
  gitAuthorName: '',
  gitAuthorEmail: '',
  githubUsername: '',
  sshKeyAlias: '',
  expectedRemoteHosts: [],
  newHost: '',
}

function formFromProfile(p: Profile): FormData {
  return {
    displayName: p.displayName,
    gitAuthorName: p.gitAuthorName,
    gitAuthorEmail: p.gitAuthorEmail,
    githubUsername: p.githubUsername,
    sshKeyAlias: p.sshKeyAlias ?? '',
    expectedRemoteHosts: [...p.expectedRemoteHosts],
    newHost: '',
  }
}

export default function ProfilesScreen(): React.ReactElement {
  const { profiles, activeProfileId, createProfile, updateProfile, deleteProfile, setActiveProfile } =
    useProfilesStore()

  const [mode, setMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null

  function selectProfile(p: Profile) {
    setSelectedId(p.id)
    setForm(formFromProfile(p))
    setMode('edit')
    setError(null)
    setConfirmDelete(false)
  }

  function startCreate() {
    setSelectedId(null)
    setForm(EMPTY_FORM)
    setMode('create')
    setError(null)
    setConfirmDelete(false)
  }

  function setField(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addHost() {
    const host = form.newHost.trim()
    if (!host || form.expectedRemoteHosts.includes(host)) return
    setForm((f) => ({ ...f, expectedRemoteHosts: [...f.expectedRemoteHosts, host], newHost: '' }))
  }

  function removeHost(host: string) {
    setForm((f) => ({
      ...f,
      expectedRemoteHosts: f.expectedRemoteHosts.filter((h) => h !== host),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.displayName.trim() || !form.gitAuthorName.trim() || !form.gitAuthorEmail.trim() || !form.githubUsername.trim()) {
      setError('Display name, Git name, Git email, and GitHub username are required.')
      return
    }

    const input: Omit<Profile, 'id'> = {
      displayName: form.displayName.trim(),
      gitAuthorName: form.gitAuthorName.trim(),
      gitAuthorEmail: form.gitAuthorEmail.trim(),
      githubUsername: form.githubUsername.trim(),
      authenticationMethod: 'ssh',
      sshKeyAlias: form.sshKeyAlias.trim() || undefined,
      expectedRemoteHosts: form.expectedRemoteHosts,
    }

    setSaving(true)
    try {
      if (mode === 'create') {
        const created = await createProfile(input)
        setSelectedId(created.id)
        setMode('edit')
      } else if (mode === 'edit' && selectedId) {
        await updateProfile(selectedId, input)
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    setSaving(true)
    try {
      await deleteProfile(selectedId)
      setSelectedId(null)
      setMode('idle')
      setForm(EMPTY_FORM)
      setConfirmDelete(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetActive() {
    if (!selectedId) return
    try {
      await setActiveProfile(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const isActive = selectedId === activeProfileId

  return (
    <div
      data-testid="screen-profiles"
      style={{ display: 'flex', height: '100%', gap: 0 }}
    >
      {/* Left: profile list */}
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
          PROFILES
        </div>

        <div data-testid="profiles-list" style={{ flex: 1, overflowY: 'auto' }}>
          {profiles.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: '#52525b', fontStyle: 'italic' }}>
              No profiles yet
            </div>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              data-testid="profile-item"
              onClick={() => selectProfile(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                background: selectedId === p.id ? '#27272a' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #1c1c1f',
                color: '#e4e4e7',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: profileColor(p.id),
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.displayName}
              </span>
              {p.id === activeProfileId && (
                <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>Active</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 12px', borderTop: '1px solid #27272a' }}>
          <button
            data-testid="profiles-new-btn"
            onClick={startCreate}
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
            + New Profile
          </button>
        </div>
      </div>

      {/* Right: form or idle */}
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
            Select a profile or create a new one.
          </div>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <form
            data-testid="profiles-form"
            onSubmit={(e) => { void handleSubmit(e) }}
            style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: '#f4f4f5',
              }}
            >
              {mode === 'create' ? 'New Profile' : 'Edit Profile'}
            </h2>

            <Field label="Display Name *">
              <input
                data-testid="profile-form-displayName"
                value={form.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                placeholder="e.g. Personal"
                style={inputStyle}
              />
            </Field>

            <Field label="Git Author Name *">
              <input
                data-testid="profile-form-gitAuthorName"
                value={form.gitAuthorName}
                onChange={(e) => setField('gitAuthorName', e.target.value)}
                placeholder="e.g. Jane Doe"
                style={inputStyle}
              />
            </Field>

            <Field label="Git Author Email *">
              <input
                data-testid="profile-form-gitAuthorEmail"
                type="email"
                value={form.gitAuthorEmail}
                onChange={(e) => setField('gitAuthorEmail', e.target.value)}
                placeholder="e.g. jane@personal.dev"
                style={inputStyle}
              />
            </Field>

            <Field label="GitHub Username *">
              <input
                data-testid="profile-form-githubUsername"
                value={form.githubUsername}
                onChange={(e) => setField('githubUsername', e.target.value)}
                placeholder="e.g. janedoe"
                style={inputStyle}
              />
            </Field>

            <Field label="Authentication">
              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                  <input type="radio" checked readOnly />
                  SSH
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#52525b', cursor: 'not-allowed' }}>
                  <input type="radio" disabled />
                  Token (not available in MVP)
                </label>
              </div>
            </Field>

            <Field label="SSH Host Alias">
              <input
                data-testid="profile-form-sshKeyAlias"
                value={form.sshKeyAlias}
                onChange={(e) => setField('sshKeyAlias', e.target.value)}
                placeholder="e.g. github-personal"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: '#52525b', marginTop: 4 }}>
                Matches the Host entry in ~/.ssh/config
              </div>
            </Field>

            <Field label="Expected Remote Hosts">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  data-testid="profile-form-newHost"
                  value={form.newHost}
                  onChange={(e) => setField('newHost', e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHost() } }}
                  placeholder="e.g. github-personal"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={addHost}
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
                  Add
                </button>
              </div>
              {form.expectedRemoteHosts.map((h) => (
                <div
                  key={h}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: '#27272a',
                    borderRadius: 4,
                    marginTop: 4,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: '#a1a1aa',
                  }}
                >
                  {h}
                  <button
                    type="button"
                    onClick={() => removeHost(h)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#71717a',
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: '0 2px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </Field>

            {error && (
              <div style={{ fontSize: 12, color: '#f87171', padding: '6px 0' }}>{error}</div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              {mode === 'edit' && (
                <button
                  type="button"
                  data-testid="profile-set-active-btn"
                  onClick={() => { void handleSetActive() }}
                  disabled={isActive || saving}
                  style={{
                    padding: '6px 14px',
                    background: isActive ? '#166534' : '#3f3f46',
                    border: 'none',
                    borderRadius: 4,
                    color: isActive ? '#4ade80' : '#e4e4e7',
                    cursor: isActive ? 'default' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {isActive ? 'Active' : 'Set as Active'}
                </button>
              )}

              <button
                type="submit"
                data-testid="profile-form-submit"
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
                {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
              </button>

              {mode === 'edit' && !confirmDelete && (
                <button
                  type="button"
                  data-testid="profile-delete-btn"
                  onClick={() => setConfirmDelete(true)}
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
                  Delete
                </button>
              )}

              {mode === 'edit' && confirmDelete && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#a1a1aa' }}>Delete "{selectedProfile?.displayName}"?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
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
                    type="button"
                    data-testid="profile-delete-confirm-btn"
                    onClick={() => { void handleDelete() }}
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
                    Delete
                  </button>
                </div>
              )}
            </div>
          </form>
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

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#71717a', letterSpacing: '0.04em' }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  )
}
