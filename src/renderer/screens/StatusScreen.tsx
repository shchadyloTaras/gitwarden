import React, { useEffect, useState } from 'react'
import type { FileChange } from '../../core/types'
import { useStatusStore } from '../store/statusStore'
import { useRepositoriesStore } from '../store/repositoriesStore'

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
  onSelect,
  selected,
}: {
  file: FileChange
  kindKey: string
  actionLabel: string
  actionTestId: string
  rowTestId: string
  onAction(path: string): void
  onSelect(): void
  selected: boolean
}): React.ReactElement {
  const displayPath = file.originalPath ? `${file.path} ← ${file.originalPath}` : file.path
  return (
    <div
      data-testid={rowTestId}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        borderBottom: '1px solid #1c1c1f',
        fontSize: 12,
        cursor: 'pointer',
        background: selected ? '#27272a' : 'transparent',
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
          color: selected ? '#ffffff' : '#e4e4e7',
        }}
        title={displayPath}
      >
        {displayPath}
      </span>
      <button
        data-testid={actionTestId}
        onClick={(e) => {
          e.stopPropagation()
          onAction(file.path)
        }}
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

function DiffLine({ line }: { line: string }): React.ReactElement {
  let color = '#a1a1aa'
  let bg = 'transparent'
  if (line.startsWith('+') && !line.startsWith('+++')) {
    color = '#4ade80'
    bg = '#052e16'
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    color = '#f87171'
    bg = '#450a0a'
  } else if (line.startsWith('@')) {
    color = '#818cf8'
    bg = '#1e1b4b'
  } else if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('+++') ||
    line.startsWith('---')
  ) {
    color = '#71717a'
  }
  return (
    <div
      style={{
        color,
        background: bg,
        padding: '0 12px',
        fontFamily: 'monospace',
        fontSize: 11,
        whiteSpace: 'pre',
        lineHeight: '18px',
      }}
    >
      {line}
    </div>
  )
}

function DiffPanel({
  file,
  diff,
  loading,
  diffMode,
  canViewStaged,
  canViewUnstaged,
  onToggle,
}: {
  file: FileChange | null
  diff: string | null
  loading: boolean
  diffMode: 'staged' | 'unstaged'
  canViewStaged: boolean
  canViewUnstaged: boolean
  onToggle(mode: 'staged' | 'unstaged'): void
}): React.ReactElement {
  if (!file) {
    return (
      <div
        data-testid="diff-empty"
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#52525b',
          fontSize: 13,
        }}
      >
        Select a file to view its diff.
      </div>
    )
  }

  const isUntracked = file.worktreeStatus === 'untracked'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Diff toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderBottom: '1px solid #27272a',
          background: '#18181b',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#a1a1aa',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file.path}
        </span>
        {!isUntracked && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              data-testid="diff-toggle-staged"
              onClick={() => onToggle('staged')}
              disabled={!canViewStaged}
              style={{
                padding: '2px 8px',
                background: diffMode === 'staged' ? '#3f3f46' : 'none',
                border: '1px solid #3f3f46',
                borderRadius: 3,
                color: canViewStaged ? '#e4e4e7' : '#52525b',
                cursor: canViewStaged ? 'pointer' : 'default',
                fontSize: 11,
                fontWeight: diffMode === 'staged' ? 700 : 400,
              }}
            >
              Staged
            </button>
            <button
              data-testid="diff-toggle-unstaged"
              onClick={() => onToggle('unstaged')}
              disabled={!canViewUnstaged}
              style={{
                padding: '2px 8px',
                background: diffMode === 'unstaged' ? '#3f3f46' : 'none',
                border: '1px solid #3f3f46',
                borderRadius: 3,
                color: canViewUnstaged ? '#e4e4e7' : '#52525b',
                cursor: canViewUnstaged ? 'pointer' : 'default',
                fontSize: 11,
                fontWeight: diffMode === 'unstaged' ? 700 : 400,
              }}
            >
              Unstaged
            </button>
          </div>
        )}
      </div>

      {/* Diff content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ padding: 16, color: '#71717a', fontSize: 12 }}>Loading diff…</div>
        )}
        {!loading && isUntracked && (
          <div style={{ padding: 16, color: '#52525b', fontSize: 12 }}>
            Untracked file — no diff available.
          </div>
        )}
        {!loading && !isUntracked && diff !== null && diff.length === 0 && (
          <div style={{ padding: 16, color: '#52525b', fontSize: 12 }}>No diff in this view.</div>
        )}
        {!loading && !isUntracked && diff && diff.length > 0 && (
          <div data-testid="diff-panel" style={{ paddingBottom: 16 }}>
            {diff.split('\n').map((line, i) => (
              <DiffLine key={i} line={line} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function StatusScreen(): React.ReactElement {
  const { repos } = useRepositoriesStore()
  const { status, loading, error, loadStatus, stageFile, unstageFile, stageAll, unstageAll } =
    useStatusStore()

  const [selectedRepoId, setSelectedRepoId] = useState<string>('')
  const [opError, setOpError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null)
  const [diffMode, setDiffMode] = useState<'staged' | 'unstaged'>('unstaged')
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const selectedRepo = repos.find((r) => r.id === selectedRepoId) ?? null

  useEffect(() => {
    setSelectedFile(null)
    setDiff(null)
    if (selectedRepo) {
      void loadStatus(selectedRepo.localPath)
    }
  }, [selectedRepo, loadStatus])

  // Load diff whenever selected file or mode changes
  useEffect(() => {
    if (!selectedRepo || !selectedFile) {
      setDiff(null)
      return
    }
    if (selectedFile.worktreeStatus === 'untracked') {
      setDiff(null)
      return
    }
    setDiffLoading(true)
    void window.api.git
      .getDiff(selectedRepo.localPath, selectedFile.path, diffMode === 'staged')
      .then((res) => {
        setDiff(res.ok ? res.data : null)
        setDiffLoading(false)
      })
  }, [selectedRepo, selectedFile, diffMode])

  async function act(fn: () => Promise<void>): Promise<void> {
    setOpError(null)
    try {
      await fn()
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err))
    }
  }

  function selectFile(file: FileChange, defaultMode: 'staged' | 'unstaged'): void {
    setSelectedFile(file)
    setDiffMode(defaultMode)
  }

  const files = status?.files ?? []
  const staged = files.filter(isStagedChange)
  const unstaged = files.filter(isUnstagedChange)
  const untracked = files.filter(isUntracked)

  const canViewStaged =
    selectedFile !== null &&
    selectedFile.indexStatus !== 'unmodified' &&
    selectedFile.indexStatus !== 'untracked'
  const canViewUnstaged =
    selectedFile !== null &&
    selectedFile.worktreeStatus !== 'unmodified' &&
    selectedFile.worktreeStatus !== 'ignored' &&
    selectedFile.worktreeStatus !== 'untracked'

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
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {!selectedRepo && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#52525b',
              fontSize: 13,
            }}
          >
            Select a repository to view its status.
          </div>
        )}

        {selectedRepo && (
          <>
            {/* Left: file list */}
            <div
              style={{
                width: 300,
                flexShrink: 0,
                borderRight: '1px solid #27272a',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {loading && !status && (
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

              {status && (
                <>
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
                          onSelect={() => selectFile(f, 'staged')}
                          selected={selectedFile?.path === f.path && diffMode === 'staged'}
                        />
                      ))}
                    </div>
                  </section>

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
                          onSelect={() => selectFile(f, 'unstaged')}
                          selected={selectedFile?.path === f.path && diffMode === 'unstaged'}
                        />
                      ))}
                    </div>
                  </section>

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
                          onSelect={() => selectFile(f, 'unstaged')}
                          selected={selectedFile?.path === f.path}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>

            {/* Right: diff panel */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <DiffPanel
                file={selectedFile}
                diff={diff}
                loading={diffLoading}
                diffMode={diffMode}
                canViewStaged={canViewStaged}
                canViewUnstaged={canViewUnstaged}
                onToggle={setDiffMode}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
