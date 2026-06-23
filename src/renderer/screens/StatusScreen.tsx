import React, { useEffect, useState } from 'react'
import type { FileChange } from '../../core/types'
import { useStatusStore } from '../store/statusStore'
import { useRepositoriesStore } from '../store/repositoriesStore'

// Filtering — a file can appear in multiple sections simultaneously (e.g. MM)
function isStagedChange(f: FileChange): boolean {
  return (
    f.indexStatus !== 'unmodified' &&
    f.indexStatus !== 'untracked' &&
    f.indexStatus !== 'ignored'
  )
}

function isUnstagedChange(f: FileChange): boolean {
  return (
    f.worktreeStatus !== 'unmodified' &&
    f.worktreeStatus !== 'ignored' &&
    f.worktreeStatus !== 'untracked'
  )
}

function isUntracked(f: FileChange): boolean {
  return f.worktreeStatus === 'untracked'
}

const KIND_COLOR: Record<string, string> = {
  added: '#4ade80',
  modified: '#60a5fa',
  deleted: '#f87171',
  renamed: '#a78bfa',
  copied: '#34d399',
  conflicted: '#fbbf24',
  untracked: '#94a3b8',
}

const KIND_ABBREV: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  conflicted: '!',
  untracked: '?',
  unmodified: ' ',
  ignored: 'I',
}

function StatusBadge({ kind }: { kind: string }): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'monospace',
        color: KIND_COLOR[kind] ?? '#a1a1aa',
        background: '#1c1c1f',
        padding: '1px 5px',
        borderRadius: 3,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {KIND_ABBREV[kind] ?? kind}
    </span>
  )
}

function FileRow({
  file,
  kindKey,
  actionLabel,
  actionTestId,
  rowTestId,
  onAction,
}: {
  file: FileChange
  kindKey: string
  actionLabel: string
  actionTestId: string
  rowTestId: string
  onAction(path: string): void
}): React.ReactElement {
  const displayPath = file.originalPath ? `${file.path} ← ${file.originalPath}` : file.path
  return (
    <div
      data-testid={rowTestId}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        borderBottom: '1px solid #1c1c1f',
        fontSize: 12,
      }}
    >
      <StatusBadge kind={kindKey} />
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
          color: '#e4e4e7',
        }}
        title={displayPath}
      >
        {displayPath}
      </span>
      <button
        data-testid={actionTestId}
        onClick={() => onAction(file.path)}
        style={{
          flexShrink: 0,
          padding: '2px 8px',
          background: '#3f3f46',
          border: 'none',
          borderRadius: 3,
          color: '#e4e4e7',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

function SectionHeader({
  title,
  count,
  bulkLabel,
  bulkTestId,
  onBulk,
}: {
  title: string
  count: number
  bulkLabel: string
  bulkTestId: string
  onBulk(): void
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        background: '#18181b',
        borderBottom: '1px solid #27272a',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#71717a' }}>
        {title}
      </span>
      <span style={{ fontSize: 11, color: '#52525b' }}>({count})</span>
      <div style={{ flex: 1 }} />
      {count > 0 && (
        <button
          data-testid={bulkTestId}
          onClick={onBulk}
          style={{
            padding: '2px 8px',
            background: 'none',
            border: '1px solid #3f3f46',
            borderRadius: 3,
            color: '#a1a1aa',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          {bulkLabel}
        </button>
      )}
    </div>
  )
}

export default function StatusScreen(): React.ReactElement {
  const { repos } = useRepositoriesStore()
  const { status, loading, error, loadStatus, stageFile, unstageFile, stageAll, unstageAll } =
    useStatusStore()

  const [selectedRepoId, setSelectedRepoId] = useState<string>('')
  const [opError, setOpError] = useState<string | null>(null)

  const selectedRepo = repos.find((r) => r.id === selectedRepoId) ?? null

  // Load status whenever the selected repo changes
  useEffect(() => {
    if (selectedRepo) {
      void loadStatus(selectedRepo.localPath)
    }
  }, [selectedRepo, loadStatus])

  async function act(fn: () => Promise<void>): Promise<void> {
    setOpError(null)
    try {
      await fn()
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err))
    }
  }

  const files = status?.files ?? []
  const staged = files.filter(isStagedChange)
  const unstaged = files.filter(isUnstagedChange)
  const untracked = files.filter(isUntracked)

  return (
    <div
      data-testid="screen-status"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid #27272a',
          background: '#18181b',
          flexShrink: 0,
        }}
      >
        <select
          data-testid="status-repo-select"
          value={selectedRepoId}
          onChange={(e) => {
            setSelectedRepoId(e.target.value)
            setOpError(null)
          }}
          style={{
            padding: '4px 8px',
            background: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: 4,
            color: '#e4e4e7',
            fontSize: 12,
            cursor: 'pointer',
            minWidth: 160,
          }}
        >
          <option value="">Select a repository…</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        {selectedRepo && (
          <button
            data-testid="status-refresh"
            onClick={() => act(() => loadStatus(selectedRepo.localPath))}
            disabled={loading}
            style={{
              padding: '4px 10px',
              background: 'none',
              border: '1px solid #3f3f46',
              borderRadius: 4,
              color: '#a1a1aa',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 11,
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!selectedRepo && (
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
            Select a repository to view its status.
          </div>
        )}

        {selectedRepo && loading && !status && (
          <div
            data-testid="status-loading"
            style={{ padding: 24, color: '#71717a', fontSize: 13 }}
          >
            Loading…
          </div>
        )}

        {(error || opError) && (
          <div
            data-testid="status-error"
            style={{ padding: '10px 12px', fontSize: 12, color: '#f87171' }}
          >
            {error ?? opError}
          </div>
        )}

        {selectedRepo && status && (
          <>
            {/* Staged section */}
            <section data-testid="staged-section">
              <SectionHeader
                title="STAGED CHANGES"
                count={staged.length}
                bulkLabel="Unstage All"
                bulkTestId="status-unstage-all"
                onBulk={() => act(unstageAll)}
              />
              <div data-testid="staged-list">
                {staged.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: '#52525b' }}>
                    No staged changes
                  </div>
                )}
                {staged.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    kindKey={f.indexStatus}
                    actionLabel="Unstage"
                    actionTestId="unstage-btn"
                    rowTestId="staged-file-row"
                    onAction={(p) => act(() => unstageFile(p))}
                  />
                ))}
              </div>
            </section>

            {/* Unstaged section */}
            <section data-testid="unstaged-section">
              <SectionHeader
                title="UNSTAGED CHANGES"
                count={unstaged.length}
                bulkLabel="Stage All"
                bulkTestId="status-stage-all"
                onBulk={() => act(stageAll)}
              />
              <div data-testid="unstaged-list">
                {unstaged.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: '#52525b' }}>
                    No unstaged changes
                  </div>
                )}
                {unstaged.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    kindKey={f.worktreeStatus}
                    actionLabel="Stage"
                    actionTestId="stage-btn"
                    rowTestId="unstaged-file-row"
                    onAction={(p) => act(() => stageFile(p))}
                  />
                ))}
              </div>
            </section>

            {/* Untracked section */}
            <section data-testid="untracked-section">
              <SectionHeader
                title="UNTRACKED FILES"
                count={untracked.length}
                bulkLabel="Stage All"
                bulkTestId="status-stage-untracked-all"
                onBulk={() => act(stageAll)}
              />
              <div data-testid="untracked-list">
                {untracked.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: '#52525b' }}>
                    No untracked files
                  </div>
                )}
                {untracked.map((f) => (
                  <FileRow
                    key={f.path}
                    file={f}
                    kindKey="untracked"
                    actionLabel="Stage"
                    actionTestId="stage-btn"
                    rowTestId="untracked-file-row"
                    onAction={(p) => act(() => stageFile(p))}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
