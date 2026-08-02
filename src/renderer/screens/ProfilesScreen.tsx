import React, { useEffect, useMemo, useState } from 'react'
import type { GitHubAccount, Profile } from '../../core/types'
import { buildProfileRepositorySummary } from '../../core/profiles/profileRepositorySummary'
import { useProfilesStore, profileStatusColor } from '../store/profilesStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useAppStore } from '../store/appStore'
import {
  deriveRepositoryDataState,
  type RepositoryDataState,
} from '../profileRepositoryPresentation'
import { GITHUB_CLIENT_ID } from '../../core/config/github'
import ConnectGitHubModal from '../components/ConnectGitHubModal'
import ResizableMainSplit from '../components/ResizableMainSplit'
import { STR } from '../strings'
import './dataScreens.css'

/** GitHub's avatar CDN keyed by numeric account id — no avatar URL needs persisting. */
function avatarUrlFor(accountId: number): string {
  return `https://avatars.githubusercontent.com/u/${accountId}?s=48&v=4`
}

/** GitHub's per-app authorizations page, so the user can fully revoke access there. */
const GITHUB_REVOKE_URL = `https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}`

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

function repositoryBadgePresentation(
  count: number,
  state: RepositoryDataState
): { value: number | '—'; label: string; visualState: RepositoryDataState | 'zero' } {
  switch (state) {
    case 'loading':
      return {
        value: '—',
        label: STR.PROFILE_REPOSITORY_BADGE_LOADING,
        visualState: state,
      }
    case 'unavailable':
      return {
        value: '—',
        label: STR.PROFILE_REPOSITORY_BADGE_UNAVAILABLE,
        visualState: state,
      }
    case 'refreshing':
      return {
        value: count,
        label: STR.PROFILE_REPOSITORY_BADGE_REFRESHING(count),
        visualState: state,
      }
    case 'stale':
      return {
        value: count,
        label: STR.PROFILE_REPOSITORY_BADGE_STALE(count),
        visualState: state,
      }
    case 'ready':
      return {
        value: count,
        label: STR.PROFILE_REPOSITORY_BADGE_LABEL(count),
        visualState: count === 0 ? 'zero' : state,
      }
  }
}

export default function ProfilesScreen(): React.ReactElement {
  const {
    profiles,
    activeProfileId,
    loading: profilesLoading,
    createProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
    load,
  } = useProfilesStore()
  const selectedProfileId = useAppStore((s) => s.selectedProfileId)
  const setSelectedProfileId = useAppStore((s) => s.setSelectedProfileId)
  const repos = useRepositoriesStore((s) => s.repos)
  const repositoriesLoading = useRepositoriesStore((s) => s.loading)
  const repositoriesError = useRepositoriesStore((s) => s.error)

  const [mode, setMode] = useState<FormMode>('idle')
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null
  const linkedGitHub = selectedProfile?.linkedGitHub ?? null
  const repositoryDataState = deriveRepositoryDataState({
    cachedRepositoryCount: repos.length,
    loading: repositoriesLoading,
    error: repositoriesError,
  })
  const repositorySummaries = useMemo(
    () =>
      new Map(
        profiles.map((profile) => [profile.id, buildProfileRepositorySummary(profile.id, repos)])
      ),
    [profiles, repos]
  )

  useEffect(() => {
    if (profilesLoading) return

    if (!selectedProfileId) {
      if (mode === 'edit') {
        setMode('idle')
        setForm(EMPTY_FORM)
      }
      return
    }

    const selected = profiles.find((profile) => profile.id === selectedProfileId)
    if (!selected) {
      setSelectedProfileId(null)
      setMode('idle')
      setForm(EMPTY_FORM)
      setError(null)
      setSuccessMessage(null)
      setWarning(null)
      setConfirmDelete(false)
      setConfirmDisconnect(false)
      setConnecting(false)
      return
    }

    // Selection survives navigation because it is shared with Context; restore only
    // the initial form when this screen remounts, never overwrite in-progress edits.
    if (mode === 'idle') {
      setForm(formFromProfile(selected))
      setMode('edit')
    }
  }, [mode, profiles, profilesLoading, selectedProfileId, setSelectedProfileId])

  function selectProfile(p: Profile) {
    setSelectedProfileId(p.id)
    setForm(formFromProfile(p))
    setMode('edit')
    setError(null)
    setSuccessMessage(null)
    setWarning(null)
    setConfirmDelete(false)
    setConfirmDisconnect(false)
  }

  function startCreate() {
    setSelectedProfileId(null)
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
      setSelectedProfileId(created.id)
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
      setError(STR.PROFILE_FIELDS_REQUIRED)
      return
    }
    if (!EMAIL_PATTERN.test(form.gitAuthorEmail.trim())) {
      setError(STR.PROFILE_EMAIL_INVALID)
      return
    }

    const input = formToInput()

    setSaving(true)
    try {
      const wasCreate = mode === 'create'
      if (mode === 'create') {
        const created = await createProfile(input)
        setSelectedProfileId(created.id)
        setMode('edit')
      } else if (mode === 'edit' && selectedProfileId) {
        await updateProfile(selectedProfileId, input)
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
    if (!selectedProfileId) return
    setSaving(true)
    setSuccessMessage(null)
    try {
      await deleteProfile(selectedProfileId)
      setSelectedProfileId(null)
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
    if (!selectedProfileId) return
    await handleSetActiveById(selectedProfileId)
  }

  // On a successful GitHub link, auto-fill identity (displayName only if still empty)
  // and persist it — which also pulls the linkedGitHub record main just wrote into the
  // store, so the linked badge appears.
  async function handleAuthorized(identity: GitHubAccount) {
    if (!selectedProfileId) return
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
      await updateProfile(selectedProfileId, patch)
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
    if (!selectedProfileId) return
    setSaving(true)
    setSuccessMessage(null)
    try {
      const res = await window.api.github.disconnect(selectedProfileId)
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

  const isActive = selectedProfileId === activeProfileId

  return (
    <div
      data-testid="screen-profiles"
      className="gw-page gw-management-page gw-management-page--profiles"
      style={{ display: 'flex', height: '100%', minWidth: 0 }}
    >
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
            className="gw-management-pane gw-management-pane--list"
            style={{
              flex: 1,
              minHeight: 0,
              borderRight: '1px solid var(--gw-border, #27272a)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h1
              className="gw-management-pane-title"
              style={{
                margin: 0,
                padding: '12px 12px 8px',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--gw-text-dim, #52525b)',
              }}
            >
              PROFILES
            </h1>

            <div
              data-testid="profiles-list"
              className="gw-management-list"
              role="list"
              style={{ flex: 1, overflowY: 'auto' }}
            >
              {profiles.length === 0 && (
                <div
                  className="gw-empty-state gw-management-list-empty"
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
                const repositoryCount = repositorySummaries.get(p.id)?.count ?? 0
                const repositoryBadge = repositoryBadgePresentation(
                  repositoryCount,
                  repositoryDataState
                )
                return (
                  <div
                    key={p.id}
                    data-testid="profile-item"
                    role="listitem"
                    className={`gw-list-row gw-management-row gw-management-profile-row${selectedProfileId === p.id ? ' gw-management-row--selected' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      background:
                        selectedProfileId === p.id ? 'var(--gw-surface2, #27272a)' : 'transparent',
                      borderBottom: '1px solid var(--gw-border, #27272a)',
                    }}
                  >
                    <button
                      type="button"
                      className="gw-management-row-main"
                      aria-pressed={selectedProfileId === p.id}
                      aria-current={isActiveRow ? 'true' : undefined}
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
                        data-testid="profile-status-indicator"
                        data-profile-state={isActiveRow ? 'active' : 'inactive'}
                        aria-hidden="true"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: profileStatusColor(isActiveRow),
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
                      <span
                        data-testid="profile-repository-count-badge"
                        data-profile-id={p.id}
                        data-repository-state={repositoryBadge.visualState}
                        className="gw-profile-repository-badge"
                        aria-label={repositoryBadge.label}
                        title={repositoryBadge.label}
                      >
                        {repositoryBadge.value}
                      </span>
                    </button>
                    {isActiveRow ? (
                      <span
                        data-testid="profile-active-badge"
                        style={{
                          fontSize: 14,
                          color: 'var(--gw-profile-active-text, #7be0b0)',
                          fontWeight: 700,
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
                          className="gw-button gw-button--compact gw-management-row-action"
                          data-testid="profile-row-set-active-btn"
                          data-tooltip={STR.TT_PROFILE_SET_ACTIVE}
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

            <div
              className="gw-management-pane-footer"
              style={{ padding: '8px 12px', borderTop: '1px solid var(--gw-border, #27272a)' }}
            >
              <button
                data-testid="profiles-new-btn"
                className="gw-button gw-button--secondary gw-management-primary-action"
                data-tooltip={STR.TT_PROFILE_NEW}
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
          <div
            className="gw-management-pane gw-management-pane--detail"
            style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 24 }}
          >
            {mode === 'idle' && (
              <div
                className="gw-empty-state gw-management-empty-state"
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
                className="gw-card gw-management-form"
                onSubmit={(e) => {
                  void handleSubmit(e)
                }}
                style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <h2
                  className="gw-management-detail-title"
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--gw-text, #f4f4f5)',
                  }}
                >
                  {mode === 'create' ? 'New Profile' : 'Edit Profile'}
                </h2>

                <Field label="Display Name *" htmlFor="profile-display-name-input">
                  <input
                    id="profile-display-name-input"
                    data-testid="profile-form-displayName"
                    value={form.displayName}
                    onChange={(e) => setField('displayName', e.target.value)}
                    placeholder="e.g. Personal"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Git Author Name *" htmlFor="profile-author-name-input">
                  <input
                    id="profile-author-name-input"
                    data-testid="profile-form-gitAuthorName"
                    value={form.gitAuthorName}
                    onChange={(e) => setField('gitAuthorName', e.target.value)}
                    placeholder="e.g. Jane Doe"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Git Author Email *" htmlFor="profile-author-email-input">
                  <input
                    id="profile-author-email-input"
                    data-testid="profile-form-gitAuthorEmail"
                    type="email"
                    value={form.gitAuthorEmail}
                    onChange={(e) => setField('gitAuthorEmail', e.target.value)}
                    placeholder="e.g. jane@personal.dev"
                    style={inputStyle}
                  />
                </Field>

                <Field label="GitHub Username *" htmlFor="profile-github-username-input">
                  <input
                    id="profile-github-username-input"
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
                        className="gw-button gw-button--secondary"
                        data-testid="github-connect-new-btn"
                        data-tooltip={STR.TT_PROFILE_CONNECT_GH}
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
                              className="gw-button gw-button--compact"
                              data-testid="github-reconnect-btn"
                              data-tooltip={STR.TT_PROFILE_RECONNECT_GH}
                              onClick={() => setConnecting(true)}
                              style={ghSecondaryBtn}
                            >
                              {STR.GITHUB_RECONNECT_BTN}
                            </button>
                            <button
                              type="button"
                              className="gw-button gw-button--compact gw-button--danger-ghost"
                              data-testid="github-disconnect-btn"
                              data-tooltip={STR.TT_PROFILE_DISCONNECT_GH}
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
                            className="gw-button gw-button--compact"
                            onClick={() => setConfirmDisconnect(false)}
                            style={ghSecondaryBtn}
                          >
                            {STR.GITHUB_DISCONNECT_CANCEL_BTN}
                          </button>
                          <button
                            type="button"
                            className="gw-button gw-button--compact gw-button--danger"
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
                        className="gw-button gw-button--secondary"
                        data-testid="github-connect-btn"
                        data-tooltip={STR.TT_PROFILE_CONNECT_GH}
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

                <Field label="Authentication" labelId="profile-authentication-label">
                  <div
                    role="radiogroup"
                    aria-labelledby="profile-authentication-label"
                    style={{ display: 'flex', gap: 16, fontSize: 14 }}
                  >
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

                <Field label="SSH Host Alias" htmlFor="profile-ssh-alias-input">
                  <input
                    id="profile-ssh-alias-input"
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

                <Field label="Expected Remote Hosts" labelId="profile-remote-hosts-label">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      id="profile-new-host-input"
                      aria-labelledby="profile-remote-hosts-label"
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
                      className="gw-button gw-button--compact gw-button--secondary"
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
                        className="gw-button gw-button--icon"
                        aria-label={STR.PROFILE_REMOVE_EXPECTED_HOST(h)}
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
                    data-testid="profile-form-error"
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
                <div
                  className="gw-toolbar gw-management-form-actions"
                  style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}
                >
                  {mode === 'edit' && (
                    <button
                      type="button"
                      className="gw-button gw-button--secondary"
                      data-testid="profile-set-active-btn"
                      data-tooltip={STR.TT_PROFILE_SET_ACTIVE}
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
                        color: isActive
                          ? 'var(--gw-profile-active-text, #7be0b0)'
                          : 'var(--gw-text, #f4f4f5)',
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
                    className="gw-button gw-button--primary"
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
                      className="gw-button gw-button--danger-ghost"
                      data-testid="profile-delete-btn"
                      data-tooltip={STR.TT_PROFILE_DELETE}
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
                        className="gw-button gw-button--compact"
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
                        className="gw-button gw-button--compact gw-button--danger"
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

      {connecting && selectedProfileId && (
        <ConnectGitHubModal
          profileId={selectedProfileId}
          onAuthorized={handleAuthorized}
          onClose={() => {
            setConnecting(false)
            // W24: a cancel racing the OAuth return-poke can close BEFORE
            // handleAuthorized's own patch has a chance to run — main may have
            // already persisted the link by then. Reloading from disk on every
            // close (not just success) means the UI can never disagree with what
            // actually got saved, regardless of which side won the race.
            void load()
          }}
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
  htmlFor,
  labelId,
}: {
  label: string
  children: React.ReactNode
  htmlFor?: string
  labelId?: string
}): React.ReactElement {
  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--gw-text-faint, #71717a)',
    letterSpacing: '0.04em',
  }

  return (
    <div className="gw-field" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {htmlFor ? (
        <label className="gw-field__label" htmlFor={htmlFor} style={labelStyle}>
          {label.toUpperCase()}
        </label>
      ) : (
        <div className="gw-field__label" id={labelId} style={labelStyle}>
          {label.toUpperCase()}
        </div>
      )}
      {children}
    </div>
  )
}
