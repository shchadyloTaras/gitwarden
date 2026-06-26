import React, { useState } from 'react'
import type { GitHubAccount, Profile } from '../../core/types'
import { useProfilesStore, profileColor } from '../store/profilesStore'
import { GITHUB_CLIENT_ID } from '../../core/config/github'
import ConnectGitHubModal from '../components/ConnectGitHubModal'
import ResizableMainSplit from '../components/ResizableMainSplit'
import { STR } from '../strings'

/** GitHub's avatar CDN keyed by numeric account id — no avatar URL needs persisting. */
function avatarUrlFor(accountId: number): string {
  return `https://avatars.githubusercontent.com/u/${accountId}?s=48&v=4`
}

/** GitHub's per-app authorizations page, so the user can fully revoke access there. */
const GITHUB_REVOKE_URL = `https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}`

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
  const {
    profiles,
    activeProfileId,
    createProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
    load,
  } = useProfilesStore()

  const [mode, setMode] = useState<FormMode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null
  const linkedGitHub = selectedProfile?.linkedGitHub ?? null

  function selectProfile(p: Profile) {
    setSelectedId(p.id)
    setForm(formFromProfile(p))
    setMode('edit')
    setError(null)
    setSuccessMessage(null)
    setWarning(null)
    setConfirmDelete(false)
    setConfirmDisconnect(false)
  }

  function startCreate() {
    setSelectedId(null)
    setForm(EMPTY_FORM)
    setMode('create')
    setError(null)
    setSuccessMessage(null)
    setWarning(null)
    setConfirmDelete(false)
    setConfirmDisconnect(false)
  }

  function setField(key: keyof FormData, value: string) {
    setSuccessMessage(null)
    setWarning(null)
    setForm((f) => ({ ...f, [key]: value }))
  }

  function addHost() {
    const host = form.newHost.trim()
    if (!host || form.expectedRemoteHosts.includes(host)) return
    setSuccessMessage(null)
    setForm((f) => ({ ...f, expectedRemoteHosts: [...f.expectedRemoteHosts, host], newHost: '' }))
  }

  function removeHost(host: string) {
    setSuccessMessage(null)
    setForm((f) => ({
      ...f,
      expectedRemoteHosts: f.expectedRemoteHosts.filter((h) => h !== host),
    }))
  }

  /** The profile fields as the form currently stands, ready for create/update. */
  function formToInput(): Omit<Profile, 'id'> {
    return {
      displayName: form.displayName.trim(),
      gitAuthorName: form.gitAuthorName.trim(),
      gitAuthorEmail: form.gitAuthorEmail.trim(),
      githubUsername: form.githubUsername.trim(),
      authenticationMethod: 'ssh',
      sshKeyAlias: form.sshKeyAlias.trim() || undefined,
      expectedRemoteHosts: form.expectedRemoteHosts,
    }
  }

  // One-click connect for a brand-new profile: GitHub fills in the identity, so we only
  // require a display name here, save the profile as a draft to obtain an id (the OAuth
  // flow is keyed by profile id and main persists `linkedGitHub` onto it), then open the
  // connect modal. If the user cancels OAuth the draft simply stays unlinked.
  async function handleConnectNew() {
    setError(null)
    setSuccessMessage(null)
    setWarning(null)
    if (!form.displayName.trim()) {
      setError(STR.PROFILE_DISPLAYNAME_REQUIRED)
      return
    }
    setSaving(true)
    try {
      const created = await createProfile(formToInput())
      setSelectedId(created.id)
      setMode('edit')
      setSuccessMessage(STR.PROFILE_CREATED_NOT_CONNECTED)
      setConnecting(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setWarning(null)

    if (
      !form.displayName.trim() ||
      !form.gitAuthorName.trim() ||
      !form.gitAuthorEmail.trim() ||
      !form.githubUsername.trim()
    ) {
      setError('Display name, Git name, Git email, and GitHub username are required.')
      return
    }

    const input = formToInput()

    setSaving(true)
    try {
      const wasCreate = mode === 'create'
      if (mode === 'create') {
        const created = await createProfile(input)
        setSelectedId(created.id)
        setMode('edit')
      } else if (mode === 'edit' && selectedId) {
        await updateProfile(selectedId, input)
      }
      setError(null)
      setSuccessMessage(wasCreate ? STR.PROFILE_CREATED : STR.PROFILE_SAVED)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    setSaving(true)
    setSuccessMessage(null)
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

  async function handleSetActiveById(id: string) {
    setSuccessMessage(null)
    try {
      await setActiveProfile(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleSetActive() {
    if (!selectedId) return
    await handleSetActiveById(selectedId)
  }

  // On a successful GitHub link, auto-fill identity (displayName only if still empty)
  // and persist it — which also pulls the linkedGitHub record main just wrote into the
  // store, so the linked badge appears.
  async function handleAuthorized(identity: GitHubAccount) {
    if (!selectedId) return
    setSuccessMessage(null)
    // Safety check: if the user already declared a GitHub username for this profile and it
    // differs from the account they actually authorized as, surface a mismatch warning
    // instead of silently overwriting it (GitHub logins are case-insensitive).
    const expectedUsername = form.githubUsername.trim()
    const isMismatch =
      expectedUsername !== '' && expectedUsername.toLowerCase() !== identity.login.toLowerCase()
    const resolvedName = identity.name?.trim() || identity.login
    const patch: Partial<Omit<Profile, 'id'>> = {
      gitAuthorName: resolvedName,
      githubUsername: identity.login,
    }
    if (identity.email) patch.gitAuthorEmail = identity.email
    if (!form.displayName.trim()) patch.displayName = resolvedName

    try {
      await updateProfile(selectedId, patch)
      setForm((f) => ({
        ...f,
        gitAuthorName: patch.gitAuthorName ?? f.gitAuthorName,
        githubUsername: patch.githubUsername ?? f.githubUsername,
        gitAuthorEmail: patch.gitAuthorEmail ?? f.gitAuthorEmail,
        displayName: patch.displayName ?? f.displayName,
      }))
      setError(null)
      setWarning(isMismatch ? STR.GITHUB_IDENTITY_MISMATCH(expectedUsername, identity.login) : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  async function handleDisconnect() {
    if (!selectedId) return
    setSaving(true)
    setSuccessMessage(null)
    try {
      const res = await window.api.github.disconnect(selectedId)
      if (!res.ok) throw new Error(res.error)
      // Refresh so the cleared linkedGitHub is reflected in the badge.
      await load()
      setConfirmDisconnect(false)
      // We cannot revoke via API (no client secret) — open GitHub so the user can.
      void window.api.shell.openExternal(GITHUB_REVOKE_URL)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const isActive = selectedId === activeProfileId

  return (
    <div data-testid="screen-profiles" style={{ display: 'flex', height: '100%', minWidth: 0 }}>
      <ResizableMainSplit
        storageKey="gitwarden.layout.profilesSplit.v1"
        resizeLabel={STR.PROFILES_SPLIT_RESIZE_LABEL}
        handleTestId="profiles-main-resize-handle"
        startPaneTestId="profiles-list-pane"
        endPaneTestId="profiles-detail-pane"
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
              PROFILES
            </div>

            <div data-testid="profiles-list" style={{ flex: 1, overflowY: 'auto' }}>
              {profiles.length === 0 && (
                <div
                  style={{
                    padding: '12px',
                    fontSize: 14,
                    color: 'var(--gw-text-dim, #52525b)',
                    fontStyle: 'italic',
                  }}
                >
                  No profiles yet
                </div>
              )}
              {profiles.map((p) => {
                const isActiveRow = p.id === activeProfileId
                return (
                  <div
                    key={p.id}
                    data-testid="profile-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      background:
                        selectedId === p.id ? 'var(--gw-surface2, #27272a)' : 'transparent',
                      borderBottom: '1px solid var(--gw-border, #27272a)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => selectProfile(p)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--gw-text, #f4f4f5)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 14,
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
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.displayName}
                      </span>
                    </button>
                    {isActiveRow ? (
                      <span
                        data-testid="profile-active-badge"
                        style={{
                          fontSize: 14,
                          color: 'var(--gw-success, #4ade80)',
                          fontWeight: 600,
                          paddingRight: 12,
                          flexShrink: 0,
                        }}
                      >
                        {STR.PROFILE_ACTIVE}
                      </span>
                    ) : (
                      profiles.length > 1 && (
                        <button
                          type="button"
                          data-testid="profile-row-set-active-btn"
                          onClick={() => {
                            void handleSetActiveById(p.id)
                          }}
                          style={{
                            marginRight: 8,
                            padding: '4px 10px',
                            background: 'var(--gw-surface3, #3f3f46)',
                            border: 'none',
                            borderRadius: 4,
                            color: 'var(--gw-text, #f4f4f5)',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {STR.PROFILE_SET_ACTIVE}
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--gw-border, #27272a)' }}>
              <button
                data-testid="profiles-new-btn"
                onClick={startCreate}
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
                + New Profile
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
                Select a profile or create a new one.
              </div>
            )}

            {(mode === 'create' || mode === 'edit') && (
              <form
                data-testid="profiles-form"
                onSubmit={(e) => {
                  void handleSubmit(e)
                }}
                style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--gw-text, #f4f4f5)',
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

                <Field label={STR.GITHUB_SECTION_LABEL}>
                  {mode === 'create' ? (
                    <div>
                      <button
                        type="button"
                        data-testid="github-connect-new-btn"
                        onClick={() => {
                          void handleConnectNew()
                        }}
                        disabled={saving}
                        style={{
                          padding: '6px 14px',
                          background: 'var(--gw-surface3, #3f3f46)',
                          border: 'none',
                          borderRadius: 4,
                          color: 'var(--gw-text, #e4e4e7)',
                          cursor: saving ? 'wait' : 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {STR.GITHUB_CONNECT_BTN}
                      </button>
                      <div
                        style={{ fontSize: 14, color: 'var(--gw-text-dim, #52525b)', marginTop: 6 }}
                      >
                        {STR.GITHUB_CONNECT_NEW_HINT}
                      </div>
                    </div>
                  ) : linkedGitHub ? (
                    <div
                      data-testid="github-linked-badge"
                      style={{
                        ...linkedBadgeStyle,
                        flexDirection: 'column',
                        alignItems: 'stretch',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <img
                          src={avatarUrlFor(linkedGitHub.accountId)}
                          alt=""
                          width={28}
                          height={28}
                          style={{
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: 'var(--gw-surface2, #27272a)',
                          }}
                          onError={(e) => {
                            e.currentTarget.style.visibility = 'hidden'
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            data-testid="github-linked-login"
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--gw-text, #f4f4f5)',
                            }}
                          >
                            {STR.GITHUB_LINKED_AS(linkedGitHub.login)}
                          </div>
                          <div style={{ fontSize: 14, color: 'var(--gw-text-faint, #71717a)' }}>
                            {STR.GITHUB_LINKED_CONNECTED_AT(linkedGitHub.connectedAt)}
                          </div>
                        </div>
                        {!confirmDisconnect && (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              data-testid="github-reconnect-btn"
                              onClick={() => setConnecting(true)}
                              style={ghSecondaryBtn}
                            >
                              {STR.GITHUB_RECONNECT_BTN}
                            </button>
                            <button
                              type="button"
                              data-testid="github-disconnect-btn"
                              onClick={() => setConfirmDisconnect(true)}
                              style={{ ...ghSecondaryBtn, color: 'var(--gw-danger, #f87171)' }}
                            >
                              {STR.GITHUB_DISCONNECT_BTN}
                            </button>
                          </div>
                        )}
                      </div>
                      {confirmDisconnect && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 8,
                            flexWrap: 'wrap',
                            paddingTop: 8,
                            borderTop: '1px solid var(--gw-border-subtle, #3f3f46)',
                          }}
                        >
                          <span style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}>
                            {STR.GITHUB_DISCONNECT_CONFIRM_PROMPT}
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmDisconnect(false)}
                            style={ghSecondaryBtn}
                          >
                            {STR.GITHUB_DISCONNECT_CANCEL_BTN}
                          </button>
                          <button
                            type="button"
                            data-testid="github-disconnect-confirm-btn"
                            onClick={() => {
                              void handleDisconnect()
                            }}
                            disabled={saving}
                            style={{
                              ...ghSecondaryBtn,
                              background: 'var(--gw-danger, #dc2626)',
                              border: 'none',
                              color: 'var(--gw-on-solid, #fff)',
                              fontWeight: 600,
                            }}
                          >
                            {STR.GITHUB_DISCONNECT_CONFIRM_BTN}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        data-testid="github-connect-btn"
                        onClick={() => setConnecting(true)}
                        style={{
                          padding: '6px 14px',
                          background: 'var(--gw-surface3, #3f3f46)',
                          border: 'none',
                          borderRadius: 4,
                          color: 'var(--gw-text, #e4e4e7)',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {STR.GITHUB_CONNECT_BTN}
                      </button>
                      <div
                        style={{ fontSize: 14, color: 'var(--gw-text-dim, #52525b)', marginTop: 6 }}
                      >
                        {STR.GITHUB_CONNECT_HINT}
                      </div>
                    </div>
                  )}
                </Field>

                <Field label="Authentication">
                  <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
                    >
                      <input type="radio" checked readOnly />
                      SSH
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        color: 'var(--gw-text-dim, #52525b)',
                        cursor: 'not-allowed',
                      }}
                    >
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
                  <div style={{ fontSize: 14, color: 'var(--gw-text-dim, #52525b)', marginTop: 4 }}>
                    Matches the Host entry in ~/.ssh/config
                  </div>
                </Field>

                <Field label="Expected Remote Hosts">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      data-testid="profile-form-newHost"
                      value={form.newHost}
                      onChange={(e) => setField('newHost', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addHost()
                        }
                      }}
                      placeholder="e.g. github-personal"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={addHost}
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
                        background: 'var(--gw-surface2, #27272a)',
                        borderRadius: 4,
                        marginTop: 4,
                        fontSize: 14,
                        fontFamily: 'monospace',
                        color: 'var(--gw-text-muted, #a1a1aa)',
                      }}
                    >
                      {h}
                      <button
                        type="button"
                        onClick={() => removeHost(h)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--gw-text-faint, #71717a)',
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
                  <div
                    style={{ fontSize: 14, color: 'var(--gw-danger, #f87171)', padding: '6px 0' }}
                  >
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div
                    data-testid="profile-saved-msg"
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 14, color: 'var(--gw-success, #4ade80)', padding: '6px 0' }}
                  >
                    {successMessage}
                  </div>
                )}

                {warning && (
                  <div
                    data-testid="profile-warning-msg"
                    role="status"
                    aria-live="polite"
                    style={{ fontSize: 14, color: 'var(--gw-warning, #fbbf24)', padding: '6px 0' }}
                  >
                    {warning}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  {mode === 'edit' && (
                    <button
                      type="button"
                      data-testid="profile-set-active-btn"
                      onClick={() => {
                        void handleSetActive()
                      }}
                      disabled={isActive || saving}
                      style={{
                        padding: '6px 14px',
                        background: isActive
                          ? 'var(--gw-success-bg, #052e16)'
                          : 'var(--gw-surface3, #3f3f46)',
                        border: 'none',
                        borderRadius: 4,
                        color: isActive ? 'var(--gw-success, #4ade80)' : 'var(--gw-text, #f4f4f5)',
                        cursor: isActive ? 'default' : 'pointer',
                        fontSize: 14,
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
                      background: 'var(--gw-primary, #2563eb)',
                      border: 'none',
                      borderRadius: 4,
                      color: 'var(--gw-on-solid, #fff)',
                      cursor: saving ? 'wait' : 'pointer',
                      fontSize: 14,
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
                        border: '1px solid var(--gw-surface3, #3f3f46)',
                        borderRadius: 4,
                        color: 'var(--gw-danger, #f87171)',
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      Delete
                    </button>
                  )}

                  {mode === 'edit' && confirmDelete && (
                    <div
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}>
                        Delete &quot;{selectedProfile?.displayName}&quot;?
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        style={{
                          padding: '4px 10px',
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
                        type="button"
                        data-testid="profile-delete-confirm-btn"
                        onClick={() => {
                          void handleDelete()
                        }}
                        disabled={saving}
                        style={{
                          padding: '4px 10px',
                          background: 'var(--gw-danger-solid, #dc2626)',
                          border: 'none',
                          borderRadius: 4,
                          color: 'var(--gw-on-solid, #fff)',
                          cursor: saving ? 'wait' : 'pointer',
                          fontSize: 14,
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
        }
      />

      {connecting && selectedId && (
        <ConnectGitHubModal
          profileId={selectedId}
          onAuthorized={handleAuthorized}
          onClose={() => setConnecting(false)}
        />
      )}
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

const linkedBadgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  background: 'var(--gw-surface2, #27272a)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 6,
}

const ghSecondaryBtn: React.CSSProperties = {
  padding: '4px 10px',
  background: 'none',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
  fontSize: 14,
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
