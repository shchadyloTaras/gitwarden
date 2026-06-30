import React, { useEffect, useState } from 'react'
import type { FileChange } from '../../core/types'
import { useStatusStore } from '../store/statusStore'
import { useAppStore } from '../store/appStore'
import ResizableMainSplit from '../components/ResizableMainSplit'
import { STR } from '../strings'

function isStagedChange(f: FileChange): boolean {
  return (
    f.indexStatus !== 'unmodified' && f.indexStatus !== 'untracked' && f.indexStatus !== 'ignored'
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
  added: 'var(--gw-success, #4ade80)',
  modified: 'var(--gw-info, #60a5fa)',
  deleted: 'var(--gw-danger, #f87171)',
  renamed: 'var(--gw-purple, #a78bfa)',
  copied: 'var(--gw-teal, #34d399)',
  conflicted: 'var(--gw-warning, #fbbf24)',
  untracked: 'var(--gw-code-muted, #94a3b8)',
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
        fontSize: 14,
        fontWeight: 700,
        fontFamily: 'monospace',
        color: KIND_COLOR[kind] ?? 'var(--gw-text-muted, #a1a1aa)',
        background: 'var(--gw-surface2, #27272a)',
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

interface ExtraAction {
  label: string
  testId: string
  onClick(path: string): void
  danger?: boolean
  tooltip?: string
}

function FileRow({
  file,
  kindKey,
  actionLabel,
  actionTooltip,
  actionTestId,
  rowTestId,
  onAction,
  onSelect,
  selected,
  extraAction,
  confirmKey,
  onConfirmAccept,
  onConfirmCancel,
}: {
  file: FileChange
  kindKey: string
  actionLabel: string
  actionTooltip?: string
  actionTestId: string
  rowTestId: string
  onAction(path: string): void
  onSelect(): void
  selected: boolean
  extraAction?: ExtraAction
  confirmKey?: string | null
  onConfirmAccept?(): void
  onConfirmCancel?(): void
}): React.ReactElement {
  const displayPath = file.originalPath ? `${file.path} ← ${file.originalPath}` : file.path
  const isConfirming = confirmKey === file.path
  const isIrreversible = extraAction?.danger === true

  return (
    <div style={{ borderBottom: '1px solid var(--gw-border, #27272a)' }}>
      <div
        data-testid={rowTestId}
        onClick={onSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          fontSize: 14,
          cursor: 'pointer',
          background: selected ? 'var(--gw-surface2, #27272a)' : 'transparent',
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
            color: 'var(--gw-text, #f4f4f5)',
          }}
          title={displayPath}
        >
          {displayPath}
        </span>
        <button
          data-testid={actionTestId}
          data-tooltip={actionTooltip}
          onClick={(e) => {
            e.stopPropagation()
            onAction(file.path)
          }}
          style={{
            flexShrink: 0,
            padding: '2px 8px',
            background: 'var(--gw-surface3, #3f3f46)',
            border: 'none',
            borderRadius: 3,
            color: 'var(--gw-text, #f4f4f5)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </button>
        {extraAction && !isConfirming && (
          <button
            data-testid={extraAction.testId}
            data-tooltip={extraAction.tooltip}
            onClick={(e) => {
              e.stopPropagation()
              extraAction.onClick(file.path)
            }}
            style={{
              flexShrink: 0,
              padding: '2px 8px',
              background: 'none',
              border: `1px solid ${extraAction.danger ? 'var(--gw-danger-solid, #dc2626)' : 'var(--gw-surface3, #3f3f46)'}`,
              borderRadius: 3,
              color: extraAction.danger
                ? 'var(--gw-danger, #f87171)'
                : 'var(--gw-text-muted, #a1a1aa)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {extraAction.label}
          </button>
        )}
        {extraAction && isConfirming && (
          <>
            <span
              style={{
                fontSize: 14,
                color: isIrreversible ? 'var(--gw-warning, #fbbf24)' : 'var(--gw-danger, #f87171)',
              }}
            >
              {isIrreversible
                ? STR.DELETE_UNTRACKED_CONFIRM_PROMPT
                : STR.DISCARD_TRACKED_CONFIRM_PROMPT}
            </span>
            <button
              data-testid={`${extraAction.testId}-confirm`}
              onClick={(e) => {
                e.stopPropagation()
                onConfirmAccept?.()
              }}
              style={{
                flexShrink: 0,
                padding: '2px 8px',
                background: isIrreversible
                  ? 'var(--gw-danger-bg, #450a0a)'
                  : 'var(--gw-danger-bg, #450a0a)',
                border: `1px solid ${isIrreversible ? 'var(--gw-danger-solid, #dc2626)' : 'var(--gw-danger-border, #991b1b)'}`,
                borderRadius: 3,
                color: 'var(--gw-danger, #f87171)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {isIrreversible ? STR.DELETE_UNTRACKED_CONFIRM_BTN : STR.DISCARD_TRACKED_CONFIRM_BTN}
            </button>
            <button
              data-testid={`${extraAction.testId}-cancel`}
              onClick={(e) => {
                e.stopPropagation()
                onConfirmCancel?.()
              }}
              style={{
                flexShrink: 0,
                padding: '2px 8px',
                background: 'none',
                border: '1px solid var(--gw-surface3, #3f3f46)',
                borderRadius: 3,
                color: 'var(--gw-text-muted, #a1a1aa)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {isIrreversible ? STR.DELETE_UNTRACKED_CANCEL_BTN : STR.DISCARD_TRACKED_CANCEL_BTN}
            </button>
          </>
        )}
      </div>
      {/* Irreversible-action warning banner shown when confirm is active */}
      {isConfirming && isIrreversible && (
        <div
          data-testid="clean-irreversible-warning"
          style={{
            padding: '6px 12px',
            background: 'var(--gw-warning-bg, #422006)',
            borderTop: '1px solid var(--gw-warning-border, #78350f)',
            fontSize: 14,
            color: 'var(--gw-warning, #fbbf24)',
          }}
        >
          {STR.DELETE_UNTRACKED_BODY}
        </div>
      )}
      {isConfirming && !isIrreversible && (
        <div
          data-testid="discard-warning"
          style={{
            padding: '6px 12px',
            background: 'var(--gw-surface2, #27272a)',
            borderTop: '1px solid var(--gw-border, #27272a)',
            fontSize: 14,
            color: 'var(--gw-text-muted, #a1a1aa)',
          }}
        >
          {STR.DISCARD_TRACKED_BODY}
        </div>
      )}
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
        background: 'var(--gw-surface, #18181b)',
        borderBottom: '1px solid var(--gw-border, #27272a)',
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: 'var(--gw-text-faint, #71717a)',
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 14, color: 'var(--gw-text-dim, #52525b)' }}>({count})</span>
      <div style={{ flex: 1 }} />
      {count > 0 && (
        <button
          data-testid={bulkTestId}
          onClick={onBulk}
          style={{
            padding: '2px 8px',
            background: 'none',
            border: '1px solid var(--gw-surface3, #3f3f46)',
            borderRadius: 3,
            color: 'var(--gw-text-muted, #a1a1aa)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          {bulkLabel}
        </button>
      )}
    </div>
  )
}

function DiffLine({ line }: { line: string }): React.ReactElement {
  let color = 'var(--gw-text-muted, #a1a1aa)'
  let bg = 'transparent'
  if (line.startsWith('+') && !line.startsWith('+++')) {
    color = 'var(--gw-success, #4ade80)'
    bg = 'var(--gw-success-bg, #052e16)'
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    color = 'var(--gw-danger, #f87171)'
    bg = 'var(--gw-danger-bg, #450a0a)'
  } else if (line.startsWith('@')) {
    color = 'var(--gw-accent-text, #a5b4fc)'
    bg = 'var(--gw-accent-soft, #1e1b4b)'
  } else if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('+++') ||
    line.startsWith('---')
  ) {
    color = 'var(--gw-text-faint, #71717a)'
  }
  return (
    <div
      style={{
        color,
        background: bg,
        padding: '0 12px',
        fontFamily: 'monospace',
        fontSize: 14,
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
          color: 'var(--gw-text-dim, #52525b)',
          fontSize: 14,
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
          borderBottom: '1px solid var(--gw-border, #27272a)',
          background: 'var(--gw-surface, #18181b)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            color: 'var(--gw-text-muted, #a1a1aa)',
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
                background: diffMode === 'staged' ? 'var(--gw-surface3, #3f3f46)' : 'none',
                border: '1px solid var(--gw-surface3, #3f3f46)',
                borderRadius: 3,
                color: canViewStaged ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-dim, #52525b)',
                cursor: canViewStaged ? 'pointer' : 'default',
                fontSize: 14,
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
                background: diffMode === 'unstaged' ? 'var(--gw-surface3, #3f3f46)' : 'none',
                border: '1px solid var(--gw-surface3, #3f3f46)',
                borderRadius: 3,
                color: canViewUnstaged ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-dim, #52525b)',
                cursor: canViewUnstaged ? 'pointer' : 'default',
                fontSize: 14,
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
          <div style={{ padding: 16, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}>
            Loading diff…
          </div>
        )}
        {!loading && isUntracked && (
          <div style={{ padding: 16, color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}>
            Untracked file — no diff available.
          </div>
        )}
        {!loading && !isUntracked && diff !== null && diff.length === 0 && (
          <div style={{ padding: 16, color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}>
            No diff in this view.
          </div>
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
  const activeRepo = useAppStore((s) => s.activeRepo)
  const { status, loading, error, loadStatus, stageFile, unstageFile, stageAll, unstageAll } =
    useStatusStore()

  const [opError, setOpError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null)
  const [diffMode, setDiffMode] = useState<'staged' | 'unstaged'>('unstaged')
  const [diff, setDiff] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  // Inline confirm state: path being confirmed, and whether it's a clean (irreversible) op
  const [confirmDiscardPath, setConfirmDiscardPath] = useState<string | null>(null)
  const [confirmCleanPath, setConfirmCleanPath] = useState<string | null>(null)

  useEffect(() => {
    setSelectedFile(null)
    setDiff(null)
    if (activeRepo) {
      void loadStatus(activeRepo.localPath)
    }
  }, [activeRepo, loadStatus])

  // Load diff whenever selected file or mode changes
  useEffect(() => {
    if (!activeRepo || !selectedFile) {
      setDiff(null)
      return
    }
    if (selectedFile.worktreeStatus === 'untracked') {
      setDiff(null)
      return
    }
    setDiffLoading(true)
    void window.api.git
      .getDiff(activeRepo.localPath, selectedFile.path, diffMode === 'staged')
      .then((res) => {
        setDiff(res.ok ? res.data : null)
        setDiffLoading(false)
      })
  }, [activeRepo, selectedFile, diffMode])

  async function act(fn: () => Promise<void>): Promise<void> {
    setOpError(null)
    try {
      await fn()
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err))
    }
  }

  async function doDiscardFile(filePath: string): Promise<void> {
    if (!activeRepo) return
    setConfirmDiscardPath(null)
    await act(async () => {
      const res = await window.api.git.discardFile(activeRepo.localPath, filePath)
      if (!res.ok) throw new Error(res.error)
      await loadStatus(activeRepo.localPath)
    })
  }

  async function doCleanFile(filePath: string): Promise<void> {
    if (!activeRepo) return
    setConfirmCleanPath(null)
    await act(async () => {
      const res = await window.api.git.cleanFile(activeRepo.localPath, filePath)
      if (!res.ok) throw new Error(res.error)
      await loadStatus(activeRepo.localPath)
    })
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
          borderBottom: '1px solid var(--gw-border, #27272a)',
          background: 'var(--gw-surface, #18181b)',
          flexShrink: 0,
        }}
      >
        {activeRepo && (
          <button
            data-testid="status-refresh"
            data-tooltip={STR.TT_STATUS_REFRESH}
            onClick={() => act(() => loadStatus(activeRepo.localPath))}
            disabled={loading}
            style={{
              padding: '4px 10px',
              background: 'none',
              border: '1px solid var(--gw-surface3, #3f3f46)',
              borderRadius: 4,
              color: 'var(--gw-text-muted, #a1a1aa)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 14,
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {!activeRepo && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gw-text-dim, #52525b)',
              fontSize: 14,
            }}
          >
            Add a repository to get started.
          </div>
        )}

        {activeRepo && (
          <ResizableMainSplit
            storageKey="gitwarden.layout.statusSplit.v1"
            resizeLabel={STR.STATUS_SPLIT_RESIZE_LABEL}
            handleTestId="status-main-resize-handle"
            startPaneTestId="status-changes-pane"
            endPaneTestId="status-diff-pane"
            defaultStartWidth={300}
            minStartWidth={180}
            maxStartWidth={480}
            minEndWidth={220}
            start={
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  borderRight: '1px solid var(--gw-border, #27272a)',
                  overflow: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {loading && !status && (
                  <div
                    data-testid="status-loading"
                    style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}
                  >
                    Loading…
                  </div>
                )}

                {(error || opError) && (
                  <div
                    data-testid="status-error"
                    style={{
                      padding: '10px 12px',
                      fontSize: 14,
                      color: 'var(--gw-danger, #f87171)',
                    }}
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
                          <div
                            style={{
                              padding: '8px 12px',
                              fontSize: 14,
                              color: 'var(--gw-text-dim, #52525b)',
                            }}
                          >
                            No staged changes
                          </div>
                        )}
                        {staged.map((f) => (
                          <FileRow
                            key={f.path}
                            file={f}
                            kindKey={f.indexStatus}
                            actionLabel="Unstage"
                            actionTooltip={STR.TT_STATUS_UNSTAGE}
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
                          <div
                            style={{
                              padding: '8px 12px',
                              fontSize: 14,
                              color: 'var(--gw-text-dim, #52525b)',
                            }}
                          >
                            No unstaged changes
                          </div>
                        )}
                        {unstaged.map((f) => (
                          <FileRow
                            key={f.path}
                            file={f}
                            kindKey={f.worktreeStatus}
                            actionLabel="Stage"
                            actionTooltip={STR.TT_STATUS_STAGE}
                            actionTestId="stage-btn"
                            rowTestId="unstaged-file-row"
                            onAction={(p) => act(() => stageFile(p))}
                            onSelect={() => selectFile(f, 'unstaged')}
                            selected={selectedFile?.path === f.path && diffMode === 'unstaged'}
                            extraAction={{
                              label: STR.DISCARD_TRACKED_LABEL,
                              testId: 'discard-btn',
                              tooltip: STR.TT_STATUS_DISCARD,
                              onClick: (p) => {
                                setConfirmCleanPath(null)
                                setConfirmDiscardPath(p)
                              },
                            }}
                            confirmKey={confirmDiscardPath}
                            onConfirmAccept={() => void doDiscardFile(f.path)}
                            onConfirmCancel={() => setConfirmDiscardPath(null)}
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
                          <div
                            style={{
                              padding: '8px 12px',
                              fontSize: 14,
                              color: 'var(--gw-text-dim, #52525b)',
                            }}
                          >
                            No untracked files
                          </div>
                        )}
                        {untracked.map((f) => (
                          <FileRow
                            key={f.path}
                            file={f}
                            kindKey="untracked"
                            actionLabel="Stage"
                            actionTooltip={STR.TT_STATUS_STAGE}
                            actionTestId="stage-btn"
                            rowTestId="untracked-file-row"
                            onAction={(p) => act(() => stageFile(p))}
                            onSelect={() => selectFile(f, 'unstaged')}
                            selected={selectedFile?.path === f.path}
                            extraAction={{
                              label: STR.DELETE_UNTRACKED_LABEL,
                              testId: 'clean-btn',
                              tooltip: STR.TT_STATUS_DELETE,
                              onClick: (p) => {
                                setConfirmDiscardPath(null)
                                setConfirmCleanPath(p)
                              },
                              danger: true,
                            }}
                            confirmKey={confirmCleanPath}
                            onConfirmAccept={() => void doCleanFile(f.path)}
                            onConfirmCancel={() => setConfirmCleanPath(null)}
                          />
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            }
            end={
              <div
                style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              >
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
            }
          />
        )}
      </div>
    </div>
  )
}
