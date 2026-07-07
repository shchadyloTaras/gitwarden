import React, { useEffect, useState } from 'react'
import { useBranchStore } from '../store/branchStore'
import { useAppStore } from '../store/appStore'
import { matchesAnyPattern } from '../../core/safety/branchPatterns'
import type { GitBranch } from '../../core/types'
import { STR } from '../strings'
import RemediationButton from '../components/RemediationButton'

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderBottom: '1px solid var(--gw-border, #27272a)',
}

const BTN: React.CSSProperties = {
  fontSize: 14,
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid var(--gw-surface3, #3f3f46)',
  background: 'none',
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
}

const BTN_DANGER: React.CSSProperties = {
  ...BTN,
  borderColor: 'var(--gw-danger-solid, #dc2626)',
  color: 'var(--gw-danger-solid, #dc2626)',
}

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  borderColor: 'var(--gw-accent, #6366f1)',
  color: 'var(--gw-accent, #6366f1)',
}

const WORKTREE_BADGE: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 6px',
  borderRadius: 999,
  border: '1px solid var(--gw-warning-solid, #d97706)',
  color: 'var(--gw-warning, #fbbf24)',
  whiteSpace: 'nowrap',
}

function isCheckedOutInAnotherWorktree(branch: GitBranch, repoPath: string | null): boolean {
  return Boolean(!branch.isCurrent && branch.worktreePath && branch.worktreePath !== repoPath)
}

export default function BranchesScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const {
    repository,
    branches,
    loading,
    error,
    successMessage,
    deleteConfirmBranch,
    forceDeleteConfirmBranch,
    mergeConfirmBranch,
    mergeConflict,
    repoPath,
    load,
    doSwitch,
    doCreate,
    doDelete,
    doForceDelete,
    doMerge,
    setDeleteConfirm,
    setForceDeleteConfirm,
    setMergeConfirm,
  } = useBranchStore()

  const [newBranchName, setNewBranchName] = useState('')

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo)
  }, [activeRepo, load])

  async function handleSwitch(branch: string): Promise<void> {
    await doSwitch(branch)
  }

  async function handleCreate(): Promise<void> {
    const name = newBranchName.trim()
    if (!name) return
    await doCreate(name)
    setNewBranchName('')
  }

  async function handleDelete(branch: string): Promise<void> {
    await doDelete(branch)
  }

  async function handleForceDelete(branch: string): Promise<void> {
    await doForceDelete(branch)
  }

  async function handleMerge(branch: string): Promise<void> {
    await doMerge(branch)
  }

  const localBranches = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)
  const currentBranch = branches.find((b) => b.isCurrent)?.name ?? null

  return (
    <div
      data-testid="screen-branches"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--gw-text, #f4f4f5)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid var(--gw-border, #27272a)',
          background: 'var(--gw-surface, #18181b)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Branches</span>

        {currentBranch && (
          <span
            data-testid="branches-current-branch"
            style={{
              fontSize: 14,
              fontFamily: 'monospace',
              background: 'var(--gw-surface3, #3f3f46)',
              padding: '2px 8px',
              borderRadius: 4,
              color: 'var(--gw-text-muted, #a1a1aa)',
            }}
          >
            current: {currentBranch}
          </span>
        )}
        {/* Branch badge — shown when a push policy is configured */}
        {currentBranch && repository?.pushPolicy && (
          <BranchBadge branch={currentBranch} policy={repository.pushPolicy} />
        )}
      </div>

      {/* Body */}
      {!activeRepo ? (
        <div style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}>
          Add a repository to get started.
        </div>
      ) : loading ? (
        <div style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}>
          Loading…
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div
              data-testid="branches-error"
              style={{
                margin: '12px 16px',
                padding: '8px 12px',
                background: 'var(--gw-danger-bg, #450a0a)',
                border: '1px solid var(--gw-danger-solid, #dc2626)',
                borderRadius: 4,
                fontSize: 14,
                color: 'var(--gw-danger, #f87171)',
              }}
            >
              {error}
            </div>
          )}

          {successMessage && (
            <div
              data-testid="branches-success"
              style={{
                margin: '12px 16px',
                padding: '8px 12px',
                background: 'var(--gw-success-bg, #052e16)',
                border: '1px solid var(--gw-success-solid, #16a34a)',
                borderRadius: 4,
                fontSize: 14,
                color: 'var(--gw-success, #4ade80)',
              }}
            >
              {successMessage}
            </div>
          )}

          {mergeConflict && (
            <div
              data-testid="branches-merge-remediation"
              style={{
                margin: '12px 16px',
                padding: '8px 12px',
                background: 'var(--gw-danger-bg, #450a0a)',
                border: '1px solid var(--gw-danger-solid, #dc2626)',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              <div style={{ color: 'var(--gw-danger, #f87171)', marginBottom: 8 }}>
                {mergeConflict.message}
              </div>
              {mergeConflict.remediation && (
                <RemediationButton remediation={mergeConflict.remediation} />
              )}
            </div>
          )}

          {/* Create branch */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--gw-border, #27272a)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--gw-text-faint, #71717a)',
                  width: 100,
                  flexShrink: 0,
                }}
              >
                New branch
              </span>
              <input
                data-testid="branches-create-input"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate()
                }}
                placeholder={
                  repository?.pushPolicy?.suggestedBranchPrefix
                    ? `${repository.pushPolicy.suggestedBranchPrefix}branch-name`
                    : 'branch-name'
                }
                style={{
                  flex: 1,
                  background: 'var(--gw-input-bg, #09090b)',
                  color: 'var(--gw-text, #f4f4f5)',
                  border: '1px solid var(--gw-border-subtle, #3f3f46)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 14,
                  maxWidth: 240,
                }}
              />
              <button
                data-testid="branches-create-btn"
                data-tooltip={STR.TT_BRANCH_CREATE}
                disabled={!newBranchName.trim()}
                onClick={() => void handleCreate()}
                style={{
                  ...BTN_PRIMARY,
                  opacity: !newBranchName.trim() ? 0.4 : 1,
                }}
              >
                Create &amp; Switch
              </button>
            </div>
            {repository?.pushPolicy?.suggestedBranchPrefix && (
              <span
                data-testid="branches-suggested-prefix"
                style={{ fontSize: 12, color: 'var(--gw-text-dim, #52525b)', paddingLeft: 108 }}
              >
                {STR.BRANCH_BADGE_SUGGESTED_PREFIX(repository.pushPolicy.suggestedBranchPrefix)}
              </span>
            )}
          </div>

          {/* Local branches */}
          <div
            style={{
              padding: '8px 16px 4px',
              fontSize: 14,
              color: 'var(--gw-text-faint, #71717a)',
            }}
          >
            LOCAL BRANCHES
          </div>
          <div data-testid="branches-local-list">
            {localBranches.length === 0 && (
              <div
                style={{ padding: '4px 16px', fontSize: 14, color: 'var(--gw-text-dim, #52525b)' }}
              >
                None
              </div>
            )}
            {localBranches.map((b) => {
              const checkedOutElsewhere = isCheckedOutInAnotherWorktree(b, repoPath)
              return (
                <div key={b.name} data-testid={`branches-local-item-${b.name}`} style={ROW}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontFamily: 'monospace',
                        color: b.isCurrent
                          ? 'var(--gw-accent, #6366f1)'
                          : 'var(--gw-text, #f4f4f5)',
                        fontWeight: b.isCurrent ? 600 : 400,
                      }}
                    >
                      {b.isCurrent ? '* ' : '  '}
                      {b.name}
                    </div>
                    {checkedOutElsewhere && (
                      <div
                        data-testid="branches-worktree-path"
                        title={b.worktreePath}
                        style={{
                          marginTop: 2,
                          marginLeft: 18,
                          color: 'var(--gw-text-faint, #71717a)',
                          fontSize: 12,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {b.worktreePath}
                      </div>
                    )}
                  </div>

                  {checkedOutElsewhere && (
                    <span data-testid="branches-worktree-badge" style={WORKTREE_BADGE}>
                      In worktree
                    </span>
                  )}

                  {!b.isCurrent && !checkedOutElsewhere && (
                    <button
                      data-testid="branches-switch-btn"
                      data-tooltip={STR.TT_BRANCH_SWITCH}
                      onClick={() => void handleSwitch(b.name)}
                      style={BTN}
                    >
                      Switch
                    </button>
                  )}

                  {!b.isCurrent &&
                    !checkedOutElsewhere &&
                    deleteConfirmBranch !== b.name &&
                    forceDeleteConfirmBranch !== b.name && (
                      <button
                        data-testid="branches-delete-btn"
                        data-tooltip={STR.TT_BRANCH_DELETE}
                        onClick={() => {
                          setDeleteConfirm(b.name)
                          setMergeConfirm(null)
                        }}
                        style={BTN_DANGER}
                      >
                        Delete
                      </button>
                    )}

                  {!b.isCurrent && !checkedOutElsewhere && deleteConfirmBranch === b.name && (
                    <>
                      <span style={{ fontSize: 14, color: 'var(--gw-danger, #f87171)' }}>
                        {STR.BRANCH_DELETE_CONFIRM}
                      </span>
                      <button
                        data-testid="branches-delete-confirm-btn"
                        onClick={() => void handleDelete(b.name)}
                        style={{ ...BTN_DANGER, fontWeight: 600 }}
                      >
                        {STR.BRANCH_DELETE_CONFIRM_YES}
                      </button>
                      <button
                        data-testid="branches-delete-cancel-btn"
                        onClick={() => setDeleteConfirm(null)}
                        style={BTN}
                      >
                        {STR.BRANCH_DELETE_CANCEL}
                      </button>
                    </>
                  )}

                  {/* Escalated force-delete confirm (W6/W27): reachable ONLY after the
                      safe -d delete refuses with branchNotMerged — a distinct, visibly
                      stronger warning per AGENTS.md #6, never a bare "Delete?" repeat. */}
                  {!b.isCurrent && !checkedOutElsewhere && forceDeleteConfirmBranch === b.name && (
                    <div
                      data-testid="branches-force-delete-warning"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ fontSize: 14, color: 'var(--gw-warning, #fbbf24)' }}
                      >
                        ⚠
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--gw-danger, #f87171)',
                        }}
                      >
                        {STR.BRANCH_FORCE_DELETE_CONFIRM(b.name)}
                      </span>
                      <button
                        data-testid="branches-force-delete-confirm-btn"
                        onClick={() => void handleForceDelete(b.name)}
                        style={{ ...BTN_DANGER, fontWeight: 700 }}
                      >
                        {STR.BRANCH_FORCE_DELETE_CONFIRM_YES}
                      </button>
                      <button
                        data-testid="branches-force-delete-cancel-btn"
                        onClick={() => setForceDeleteConfirm(null)}
                        style={BTN}
                      >
                        {STR.BRANCH_FORCE_DELETE_CANCEL}
                      </button>
                    </div>
                  )}

                  {!b.isCurrent && currentBranch && mergeConfirmBranch !== b.name && (
                    <button
                      data-testid="branches-merge-btn"
                      data-tooltip={STR.TT_BRANCH_MERGE}
                      onClick={() => {
                        setMergeConfirm(b.name)
                        setDeleteConfirm(null)
                      }}
                      style={BTN_PRIMARY}
                    >
                      {STR.BRANCH_MERGE_BUTTON(currentBranch)}
                    </button>
                  )}

                  {!b.isCurrent && currentBranch && mergeConfirmBranch === b.name && (
                    <>
                      <span style={{ fontSize: 14, color: 'var(--gw-accent, #6366f1)' }}>
                        {STR.BRANCH_MERGE_CONFIRM(b.name, currentBranch)}
                      </span>
                      <button
                        data-testid="branches-merge-confirm-btn"
                        onClick={() => void handleMerge(b.name)}
                        style={{ ...BTN_PRIMARY, fontWeight: 600 }}
                      >
                        {STR.BRANCH_MERGE_CONFIRM_YES}
                      </button>
                      <button
                        data-testid="branches-merge-cancel-btn"
                        onClick={() => setMergeConfirm(null)}
                        style={BTN}
                      >
                        {STR.BRANCH_MERGE_CANCEL}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Remote branches */}
          {remoteBranches.length > 0 && (
            <>
              <div
                style={{
                  padding: '12px 16px 4px',
                  fontSize: 14,
                  color: 'var(--gw-text-faint, #71717a)',
                }}
              >
                REMOTE BRANCHES
              </div>
              <div data-testid="branches-remote-list">
                {remoteBranches.map((b) => (
                  <div
                    key={b.name}
                    data-testid="branches-remote-item"
                    style={{ ...ROW, color: 'var(--gw-text-faint, #71717a)' }}
                  >
                    <span style={{ flex: 1, fontSize: 14, fontFamily: 'monospace' }}>{b.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Badge showing "allowed" / "blocked" based on the repo push policy. */
function BranchBadge({
  branch,
  policy,
}: {
  branch: string
  policy: NonNullable<import('../../core/types').RepositoryRecord['pushPolicy']>
}): React.ReactElement {
  const blocked = matchesAnyPattern(branch, policy.blockedBranchPatterns)
  const allowed =
    !blocked &&
    policy.mode === 'branchScoped' &&
    policy.allowedBranchPatterns.length > 0 &&
    matchesAnyPattern(branch, policy.allowedBranchPatterns)

  if (!blocked && !allowed) return <></>

  return (
    <span
      data-testid="branches-branch-badge"
      style={{
        fontSize: 12,
        padding: '1px 6px',
        borderRadius: 3,
        background: blocked ? 'var(--gw-danger-bg, #450a0a)' : 'var(--gw-success-bg, #052e16)',
        color: blocked ? 'var(--gw-danger, #f87171)' : 'var(--gw-success, #4ade80)',
        border: `1px solid ${blocked ? 'var(--gw-danger-solid, #dc2626)' : 'var(--gw-success-border, #2d4a2d)'}`,
      }}
    >
      {blocked ? STR.BRANCH_BADGE_BLOCKED : STR.BRANCH_BADGE_ALLOWED}
    </span>
  )
}
