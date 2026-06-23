import React, { useState } from 'react'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useBranchStore } from '../store/branchStore'
import type { RepositoryRecord } from '../../core/types'

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderBottom: '1px solid #27272a',
}

const BTN: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid #3f3f46',
  background: 'none',
  color: '#a1a1aa',
  cursor: 'pointer',
}

const BTN_DANGER: React.CSSProperties = {
  ...BTN,
  borderColor: '#dc2626',
  color: '#dc2626',
}

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  borderColor: '#6366f1',
  color: '#6366f1',
}

export default function BranchesScreen(): React.ReactElement {
  const repositories = useRepositoriesStore((s) => s.repos)
  const {
    repoPath,
    repository,
    branches,
    loading,
    error,
    successMessage,
    deleteConfirmBranch,
    load,
    doSwitch,
    doCreate,
    doDelete,
    setDeleteConfirm,
  } = useBranchStore()

  const [newBranchName, setNewBranchName] = useState('')

  function handleRepoChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const repo = repositories.find((r: RepositoryRecord) => r.id === e.target.value)
    if (repo) void load(repo.localPath, repo)
  }

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

  const localBranches = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)
  const currentBranch = branches.find((b) => b.isCurrent)?.name ?? null

  return (
    <div
      data-testid="screen-branches"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#e4e4e7' }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid #27272a',
          background: '#18181b',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Branches</span>

        <select
          data-testid="branches-repo-select"
          value={repository?.id ?? ''}
          onChange={handleRepoChange}
          style={{
            background: '#27272a',
            color: '#e4e4e7',
            border: '1px solid #3f3f46',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 13,
          }}
        >
          <option value="">— select repository —</option>
          {repositories.map((r: RepositoryRecord) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {currentBranch && (
          <span
            data-testid="branches-current-branch"
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              background: '#3f3f46',
              padding: '2px 8px',
              borderRadius: 4,
              color: '#a1a1aa',
            }}
          >
            current: {currentBranch}
          </span>
        )}
      </div>

      {/* Body */}
      {!repoPath ? (
        <div style={{ padding: 24, color: '#71717a', fontSize: 13 }}>
          Select a repository to see its branches.
        </div>
      ) : loading ? (
        <div style={{ padding: 24, color: '#71717a', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div
              data-testid="branches-error"
              style={{
                margin: '12px 16px',
                padding: '8px 12px',
                background: '#450a0a',
                border: '1px solid #dc2626',
                borderRadius: 4,
                fontSize: 13,
                color: '#fca5a5',
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
                background: '#052e16',
                border: '1px solid #16a34a',
                borderRadius: 4,
                fontSize: 13,
                color: '#86efac',
              }}
            >
              {successMessage}
            </div>
          )}

          {/* Create branch */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #27272a',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: '#71717a', width: 100, flexShrink: 0 }}>
              New branch
            </span>
            <input
              data-testid="branches-create-input"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
              }}
              placeholder="branch-name"
              style={{
                flex: 1,
                background: '#27272a',
                color: '#e4e4e7',
                border: '1px solid #3f3f46',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 13,
                maxWidth: 240,
              }}
            />
            <button
              data-testid="branches-create-btn"
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

          {/* Local branches */}
          <div style={{ padding: '8px 16px 4px', fontSize: 11, color: '#71717a' }}>
            LOCAL BRANCHES
          </div>
          <div data-testid="branches-local-list">
            {localBranches.length === 0 && (
              <div style={{ padding: '4px 16px', fontSize: 13, color: '#52525b' }}>None</div>
            )}
            {localBranches.map((b) => (
              <div key={b.name} data-testid={`branches-local-item-${b.name}`} style={ROW}>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: 'monospace',
                    color: b.isCurrent ? '#6366f1' : '#e4e4e7',
                    fontWeight: b.isCurrent ? 600 : 400,
                  }}
                >
                  {b.isCurrent ? '* ' : '  '}
                  {b.name}
                </span>

                {!b.isCurrent && (
                  <button
                    data-testid="branches-switch-btn"
                    onClick={() => void handleSwitch(b.name)}
                    style={BTN}
                  >
                    Switch
                  </button>
                )}

                {!b.isCurrent && deleteConfirmBranch !== b.name && (
                  <button
                    data-testid="branches-delete-btn"
                    onClick={() => setDeleteConfirm(b.name)}
                    style={BTN_DANGER}
                  >
                    Delete
                  </button>
                )}

                {!b.isCurrent && deleteConfirmBranch === b.name && (
                  <>
                    <span style={{ fontSize: 12, color: '#f87171' }}>Delete?</span>
                    <button
                      data-testid="branches-delete-confirm-btn"
                      onClick={() => void handleDelete(b.name)}
                      style={{ ...BTN_DANGER, fontWeight: 600 }}
                    >
                      Yes, delete
                    </button>
                    <button
                      data-testid="branches-delete-cancel-btn"
                      onClick={() => setDeleteConfirm(null)}
                      style={BTN}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Remote branches */}
          {remoteBranches.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 4px', fontSize: 11, color: '#71717a' }}>
                REMOTE BRANCHES
              </div>
              <div data-testid="branches-remote-list">
                {remoteBranches.map((b) => (
                  <div
                    key={b.name}
                    data-testid="branches-remote-item"
                    style={{ ...ROW, color: '#71717a' }}
                  >
                    <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}>{b.name}</span>
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
