import React, { useEffect, useRef, useState } from 'react'
import type { RepositoryRecord } from '../../core/types'
import { isValidGitRemoteUrl } from '../../core/remoteUrl'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useProfilesStore } from '../store/profilesStore'
import { useAppStore } from '../store/appStore'
import Dropdown from '../components/Dropdown'
import ResizableMainSplit from '../components/ResizableMainSplit'
import { STR } from '../strings'
import './dataScreens.css'

// Must match the phrase gitInitializeHandler.ts's nested-repo throw always contains —
// there is no structured error code for this pre-check (it never reaches GitError),
// so the friendly STR copy is shown in its place instead of the raw backend message.
const NESTED_REPO_ERROR_MARKER = 'already inside a Git repository'

type Mode = 'idle' | 'add' | 'edit'

interface EditForm {
  name: string
  assignedProfileId: string
  notes: string
  policyEnabled: boolean
  policyMode: 'unrestricted' | 'branchScoped'
  policyAllowed: string
  policyBlocked: string
  policyExpectedOwner: string
  policyExpectedRepo: string
  policyGitHubActor: string
  policyPrefix: string
}

function editFormFromRepo(r: RepositoryRecord): EditForm {
  const p = r.pushPolicy
  return {
    name: r.name,
    assignedProfileId: r.assignedProfileId ?? '',
    notes: r.notes ?? '',
    policyEnabled: !!p,
    policyMode: p?.mode ?? 'unrestricted',
    policyAllowed: p?.allowedBranchPatterns.join('\n') ?? '',
    policyBlocked: p?.blockedBranchPatterns.join('\n') ?? '',
    policyExpectedOwner: p?.expectedRemoteOwner ?? '',
    policyExpectedRepo: p?.expectedRemoteRepo ?? '',
    policyGitHubActor: p?.expectedGitHubActor ?? '',
    policyPrefix: p?.suggestedBranchPrefix ?? '',
  }
}

function RepositoryListIcon({ mismatch }: { mismatch: boolean }): React.ReactElement {
  return (
    <span data-testid="repo-item-icon" className="gw-repository-list-icon">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.75 7.25A1.75 1.75 0 0 1 5.5 5.5h4l1.75 2h7.25a1.75 1.75 0 0 1 1.75 1.75v8.25a1.75 1.75 0 0 1-1.75 1.75h-13a1.75 1.75 0 0 1-1.75-1.75V7.25Z" />
      </svg>
      {mismatch && (
        <span
          data-testid="repo-item-mismatch"
          className="gw-repository-list-icon__mismatch"
          role="img"
          aria-label={STR.REPOSITORY_PROFILE_MISMATCH}
          title={STR.REPOSITORY_PROFILE_MISMATCH}
        />
      )}
    </span>
  )
}

export default function RepositoriesScreen(): React.ReactElement {
  const { repos, addRepository, initializeRepository, updateRepo, removeRepo } =
    useRepositoriesStore()
  const { profiles, activeProfileId } = useProfilesStore()
  const setActiveRepo = useAppStore((s) => s.setActiveRepo)
  const navigate = useAppStore((s) => s.navigate)

  const [mode, setMode] = useState<Mode>('idle')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addPath, setAddPath] = useState('')
  const [initMode, setInitMode] = useState(false)
  const [initRemoteUrl, setInitRemoteUrl] = useState('')
  const [initUrlError, setInitUrlError] = useState<string | null>(null)
  const [initNestedWarning, setInitNestedWarning] = useState<string | null>(null)
  const [initSaving, setInitSaving] = useState(false)
  // True only after a *real* Validate & Add failure on a non-empty path (the folder exists but
  // isn't a Git repo). The empty-path input guard is NOT a validation failure, so it must never
  // surface the Initialize affordance — there is nothing to initialize. Gating the init section on
  // this flag (rather than the generic `error`) is what keeps the button hidden for the empty path.
  const [initEligible, setInitEligible] = useState(false)
  const [initPending, setInitPending] = useState<{
    repo: RepositoryRecord
    remoteError: string
  } | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    assignedProfileId: '',
    notes: '',
    policyEnabled: false,
    policyMode: 'unrestricted',
    policyAllowed: '',
    policyBlocked: '',
    policyExpectedOwner: '',
    policyExpectedRepo: '',
    policyGitHubActor: '',
    policyPrefix: '',
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

  function resetInitState() {
    setInitMode(false)
    setInitRemoteUrl('')
    setInitUrlError(null)
    setInitNestedWarning(null)
    setInitPending(null)
    setInitEligible(false)
  }

  function startAdd() {
    setSelectedId(null)
    setAddPath('')
    setMode('add')
    setError(null)
    setSuccessMessage(null)
    resetInitState()
  }

  async function handleBrowse() {
    const res = await window.api.dialog.openDirectory()
    if (res.ok && res.data) setAddPath(res.data)
  }

  async function handleValidateAndAdd() {
    setError(null)
    setSuccessMessage(null)
    resetInitState()
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
      // A non-empty path that failed git validation — offer to initialize it.
      setInitEligible(true)
    } finally {
      setSaving(false)
    }
  }

  function finishInitialize(repo: RepositoryRecord) {
    setActiveRepo(repo)
    navigate('commit')
  }

  async function handleInitialize() {
    const profile = profiles.find((p) => p.id === activeProfileId)
    if (!profile) return
    const trimmedPath = addPath.trim()
    if (!trimmedPath) return

    setInitUrlError(null)
    setInitNestedWarning(null)
    const trimmedUrl = initRemoteUrl.trim()
    if (trimmedUrl && !isValidGitRemoteUrl(trimmedUrl)) {
      setInitUrlError(STR.INITIALIZE_REPO_INVALID_URL)
      return
    }

    setInitSaving(true)
    try {
      const { repo, remoteError } = await initializeRepository(
        trimmedPath,
        trimmedUrl || undefined,
        { name: profile.gitAuthorName, email: profile.gitAuthorEmail },
        profile.id
      )
      if (remoteError) {
        setInitPending({ repo, remoteError })
      } else {
        finishInitialize(repo)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      if (message.includes(NESTED_REPO_ERROR_MARKER)) {
        setInitNestedWarning(STR.INITIALIZE_REPO_NESTED_WARNING)
      } else {
        setError(message)
      }
    } finally {
      setInitSaving(false)
    }
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const pushPolicy = editForm.policyEnabled
        ? {
            mode: editForm.policyMode,
            allowedBranchPatterns: editForm.policyAllowed
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            blockedBranchPatterns: editForm.policyBlocked
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
            expectedRemoteOwner: editForm.policyExpectedOwner.trim() || undefined,
            expectedRemoteRepo: editForm.policyExpectedRepo.trim() || undefined,
            expectedGitHubActor: editForm.policyGitHubActor.trim() || undefined,
            suggestedBranchPrefix: editForm.policyPrefix.trim() || undefined,
          }
        : undefined
      await updateRepo(selectedId, {
        name: editForm.name.trim() || selectedRepo?.name,
        assignedProfileId: editForm.assignedProfileId || undefined,
        notes: editForm.notes.trim() || undefined,
        pushPolicy,
      })
      // If we just edited the active repo, refresh its snapshot in appStore so the
      // header reflects the new record and the active profile re-syncs to the new
      // assignment. setActiveRepo keeps the current branch for a same-repo refresh.
      const updated = useRepositoriesStore.getState().repos.find((r) => r.id === selectedId)
      if (updated && useAppStore.getState().activeRepo?.id === selectedId) {
        setActiveRepo(updated)
      }
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
    <div
      data-testid="screen-repositories"
      className="gw-page gw-management-page gw-management-page--repositories"
      style={{ display: 'flex', height: '100%', minWidth: 0 }}
    >
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
              REPOSITORIES
            </h1>

            <div
              data-testid="repos-list"
              className="gw-management-list"
              style={{ flex: 1, overflowY: 'auto' }}
            >
              {repos.length === 0 && (
                <div
                  className="gw-empty-state gw-management-list-empty"
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
                    className={`gw-list-row gw-management-row gw-management-row-main gw-management-repo-row${selectedId === r.id ? ' gw-management-row--selected' : ''}`}
                    aria-pressed={selectedId === r.id}
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
                    <div className="gw-repository-list-row-content">
                      <RepositoryListIcon mismatch={Boolean(mismatch)} />
                      <div className="gw-repository-list-row-copy">
                        <span className="gw-repository-list-row-name">{r.name}</span>
                        <span className="gw-repository-list-row-profile">
                          {assigned ? assigned.displayName : 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div
              className="gw-management-pane-footer"
              style={{ padding: '8px 12px', borderTop: '1px solid var(--gw-border, #27272a)' }}
            >
              <button
                data-testid="repos-add-btn"
                className="gw-button gw-button--secondary gw-management-primary-action"
                data-tooltip={STR.TT_REPO_ADD}
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
                Select a repository or add one.
              </div>
            )}

            {mode === 'add' && (
              <div
                className="gw-card gw-management-form"
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
                  Add Repository
                </h2>

                <Field label="Repository Path" labelId="repository-path-label">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      id="repository-path-input"
                      aria-labelledby="repository-path-label"
                      data-testid="repo-path-input"
                      value={addPath}
                      onChange={(e) => setAddPath(e.target.value)}
                      placeholder="/path/to/your/repo"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      className="gw-button gw-button--compact gw-button--secondary"
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
                    className="gw-button gw-button--primary"
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
                    className="gw-button gw-button--secondary"
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

                {initEligible && (
                  <div
                    data-testid="repo-init-section"
                    style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                  >
                    {!initMode &&
                      (activeProfile ? (
                        <button
                          type="button"
                          className="gw-button gw-button--secondary"
                          data-testid="repo-init-btn"
                          onClick={() => setInitMode(true)}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '6px 14px',
                            background: 'none',
                            border: '1px solid var(--gw-primary, #2563eb)',
                            borderRadius: 4,
                            color: 'var(--gw-primary, #2563eb)',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {STR.INITIALIZE_REPO_BUTTON}
                        </button>
                      ) : (
                        <div
                          data-testid="repo-init-no-profile-hint"
                          style={{ fontSize: 14, color: 'var(--gw-text-dim, #52525b)' }}
                        >
                          {STR.INITIALIZE_REPO_NO_PROFILE_HINT}
                        </div>
                      ))}

                    {initMode && activeProfile && (
                      <div
                        data-testid="repo-init-panel"
                        className="gw-card gw-management-subcard"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          padding: '10px 12px',
                          border: '1px solid var(--gw-border, #27272a)',
                          borderRadius: 4,
                        }}
                      >
                        {initNestedWarning && (
                          <div
                            data-testid="repo-init-nested-warning"
                            style={{ fontSize: 14, color: 'var(--gw-warning, #fbbf24)' }}
                          >
                            {initNestedWarning}
                          </div>
                        )}

                        {initPending ? (
                          <>
                            <div
                              data-testid="repo-init-remote-note"
                              style={{ fontSize: 14, color: 'var(--gw-warning, #fbbf24)' }}
                            >
                              {STR.INITIALIZE_REPO_REMOTE_NOTE(initPending.remoteError)}
                            </div>
                            <button
                              type="button"
                              className="gw-button gw-button--primary"
                              data-testid="repo-init-continue-btn"
                              onClick={() => finishInitialize(initPending.repo)}
                              style={{
                                alignSelf: 'flex-start',
                                padding: '6px 14px',
                                background: 'var(--gw-primary, #2563eb)',
                                border: 'none',
                                borderRadius: 4,
                                color: 'var(--gw-on-solid, #fff)',
                                cursor: 'pointer',
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              {STR.INITIALIZE_REPO_CONTINUE_BUTTON}
                            </button>
                          </>
                        ) : (
                          <>
                            <Field
                              label={STR.INITIALIZE_REPO_URL_LABEL}
                              htmlFor="repository-init-url-input"
                            >
                              <input
                                id="repository-init-url-input"
                                data-testid="repo-init-url-input"
                                value={initRemoteUrl}
                                onChange={(e) => {
                                  setInitRemoteUrl(e.target.value)
                                  setInitUrlError(null)
                                }}
                                placeholder={STR.INITIALIZE_REPO_URL_PLACEHOLDER}
                                style={inputStyle}
                              />
                            </Field>

                            {initUrlError && (
                              <div
                                data-testid="repo-init-url-error"
                                style={{ fontSize: 14, color: 'var(--gw-danger, #f87171)' }}
                              >
                                {initUrlError}
                              </div>
                            )}

                            <div
                              data-testid="repo-init-identity-line"
                              style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}
                            >
                              {STR.INITIALIZE_REPO_IDENTITY_LINE(
                                activeProfile.displayName,
                                activeProfile.gitAuthorEmail
                              )}
                            </div>

                            <button
                              type="button"
                              className="gw-button gw-button--primary"
                              data-testid="repo-init-submit-btn"
                              onClick={() => {
                                void handleInitialize()
                              }}
                              disabled={initSaving}
                              style={{
                                alignSelf: 'flex-start',
                                padding: '6px 18px',
                                background: 'var(--gw-primary, #2563eb)',
                                border: 'none',
                                borderRadius: 4,
                                color: 'var(--gw-on-solid, #fff)',
                                cursor: initSaving ? 'wait' : 'pointer',
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              {initSaving
                                ? STR.INITIALIZE_REPO_SUBMITTING
                                : STR.INITIALIZE_REPO_SUBMIT_BUTTON}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === 'edit' && selectedRepo && (
              <div
                className="gw-card gw-management-form"
                style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}
              >
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
                  className="gw-management-detail-title"
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

                <Field label="Name" htmlFor="repository-name-input">
                  <input
                    id="repository-name-input"
                    data-testid="repo-form-name"
                    value={editForm.name}
                    onChange={(e) => {
                      setSuccessMessage(null)
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Assigned Profile" labelId="repository-profile-label">
                  <Dropdown
                    testId="repo-form-profile"
                    ariaLabel="Assigned profile"
                    ariaLabelledBy="repository-profile-label"
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

                <Field label="Notes" htmlFor="repository-notes-input">
                  <textarea
                    id="repository-notes-input"
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

                {/* Push Policy section */}
                <div
                  data-testid="repo-push-policy-section"
                  className="gw-card gw-management-subcard gw-management-policy-card"
                  style={{
                    border: '1px solid var(--gw-border, #27272a)',
                    borderRadius: 4,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--gw-text-faint, #71717a)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {STR.PUSH_POLICY_SECTION_TITLE.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--gw-text-dim, #52525b)' }}>
                    {STR.PUSH_POLICY_SECTION_HINT}
                  </div>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  >
                    <input
                      data-testid="repo-policy-enabled"
                      type="checkbox"
                      checked={editForm.policyEnabled}
                      onChange={(e) => {
                        setSuccessMessage(null)
                        setEditForm((f) => ({ ...f, policyEnabled: e.target.checked }))
                      }}
                    />
                    <span style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}>
                      {STR.PUSH_POLICY_ENABLE_LABEL}
                    </span>
                  </label>

                  {editForm.policyEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Field
                        label={STR.PUSH_POLICY_MODE_LABEL}
                        labelId="repository-policy-mode-label"
                      >
                        <Dropdown
                          testId="repo-policy-mode"
                          ariaLabel={STR.PUSH_POLICY_MODE_LABEL}
                          ariaLabelledBy="repository-policy-mode-label"
                          block
                          value={editForm.policyMode}
                          onChange={(v) => {
                            setSuccessMessage(null)
                            setEditForm((f) => ({
                              ...f,
                              policyMode: v as 'unrestricted' | 'branchScoped',
                            }))
                          }}
                          options={[
                            { value: 'unrestricted', label: STR.PUSH_POLICY_MODE_UNRESTRICTED },
                            { value: 'branchScoped', label: STR.PUSH_POLICY_MODE_BRANCH_SCOPED },
                          ]}
                          triggerStyle={inputStyle}
                        />
                      </Field>

                      <Field
                        label={STR.PUSH_POLICY_ALLOWED_LABEL}
                        htmlFor="repository-policy-allowed-input"
                      >
                        <textarea
                          id="repository-policy-allowed-input"
                          data-testid="repo-policy-allowed"
                          value={editForm.policyAllowed}
                          onChange={(e) => {
                            setSuccessMessage(null)
                            setEditForm((f) => ({ ...f, policyAllowed: e.target.value }))
                          }}
                          rows={3}
                          placeholder="client-x/taras/*"
                          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--gw-text-dim, #52525b)',
                            marginTop: 2,
                          }}
                        >
                          {STR.PUSH_POLICY_ALLOWED_HINT}
                        </span>
                      </Field>

                      <Field
                        label={STR.PUSH_POLICY_BLOCKED_LABEL}
                        htmlFor="repository-policy-blocked-input"
                      >
                        <textarea
                          id="repository-policy-blocked-input"
                          data-testid="repo-policy-blocked"
                          value={editForm.policyBlocked}
                          onChange={(e) => {
                            setSuccessMessage(null)
                            setEditForm((f) => ({ ...f, policyBlocked: e.target.value }))
                          }}
                          rows={2}
                          placeholder="main&#10;release/*"
                          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--gw-text-dim, #52525b)',
                            marginTop: 2,
                          }}
                        >
                          {STR.PUSH_POLICY_BLOCKED_HINT}
                        </span>
                      </Field>

                      <div className="gw-management-form-grid" style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Field
                            label={STR.PUSH_POLICY_EXPECTED_OWNER_LABEL}
                            htmlFor="repository-policy-owner-input"
                          >
                            <input
                              id="repository-policy-owner-input"
                              data-testid="repo-policy-expected-owner"
                              value={editForm.policyExpectedOwner}
                              onChange={(e) => {
                                setSuccessMessage(null)
                                setEditForm((f) => ({
                                  ...f,
                                  policyExpectedOwner: e.target.value,
                                }))
                              }}
                              placeholder={STR.PUSH_POLICY_EXPECTED_OWNER_PLACEHOLDER}
                              style={{ ...inputStyle, fontFamily: 'monospace' }}
                            />
                          </Field>
                        </div>
                        <div style={{ flex: 1 }}>
                          <Field
                            label={STR.PUSH_POLICY_EXPECTED_REPO_LABEL}
                            htmlFor="repository-policy-repo-input"
                          >
                            <input
                              id="repository-policy-repo-input"
                              data-testid="repo-policy-expected-repo"
                              value={editForm.policyExpectedRepo}
                              onChange={(e) => {
                                setSuccessMessage(null)
                                setEditForm((f) => ({
                                  ...f,
                                  policyExpectedRepo: e.target.value,
                                }))
                              }}
                              placeholder={STR.PUSH_POLICY_EXPECTED_REPO_PLACEHOLDER}
                              style={{ ...inputStyle, fontFamily: 'monospace' }}
                            />
                          </Field>
                        </div>
                      </div>

                      <Field
                        label={STR.PUSH_POLICY_GITHUB_ACTOR_LABEL}
                        htmlFor="repository-policy-actor-input"
                      >
                        <input
                          id="repository-policy-actor-input"
                          data-testid="repo-policy-github-actor"
                          value={editForm.policyGitHubActor}
                          onChange={(e) => {
                            setSuccessMessage(null)
                            setEditForm((f) => ({ ...f, policyGitHubActor: e.target.value }))
                          }}
                          placeholder={STR.PUSH_POLICY_GITHUB_ACTOR_PLACEHOLDER}
                          style={{ ...inputStyle, fontFamily: 'monospace' }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--gw-text-dim, #52525b)',
                            marginTop: 2,
                          }}
                        >
                          {STR.PUSH_POLICY_GITHUB_ACTOR_HINT}
                        </span>
                      </Field>

                      <Field
                        label={STR.PUSH_POLICY_PREFIX_LABEL}
                        htmlFor="repository-policy-prefix-input"
                      >
                        <input
                          id="repository-policy-prefix-input"
                          data-testid="repo-policy-prefix"
                          value={editForm.policyPrefix}
                          onChange={(e) => {
                            setSuccessMessage(null)
                            setEditForm((f) => ({ ...f, policyPrefix: e.target.value }))
                          }}
                          placeholder={STR.PUSH_POLICY_PREFIX_PLACEHOLDER}
                          style={{ ...inputStyle, fontFamily: 'monospace' }}
                        />
                      </Field>
                    </div>
                  )}
                </div>

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
                    className="gw-button gw-button--primary"
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
                      className="gw-button gw-button--danger-ghost"
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
                        Remove &ldquo;{selectedRepo.name}&rdquo; from Git Warden?
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="gw-button gw-button--secondary"
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
                          className="gw-button gw-button--danger"
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
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
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
