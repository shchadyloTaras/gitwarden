import React, { useEffect, useState } from 'react'
import type { GitCommitDetails } from '../../core/types'
import { useHistoryStore } from '../store/historyStore'
import { useAppStore } from '../store/appStore'
import ResizableMainSplit from '../components/ResizableMainSplit'
import UnifiedDiff from '../components/UnifiedDiff'
import { FileStatusBadge } from '../components/FileStatusBadge'
import { STR } from '../strings'
import './dataScreens.css'

type ConfirmAction = 'last' | 'all' | null

const ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr 160px 110px',
  alignItems: 'baseline',
  gap: 12,
  padding: '7px 16px',
  borderBottom: '1px solid var(--gw-border, #27272a)',
  fontSize: 14,
}

function ReturnConfirm({
  action,
  onConfirm,
  onCancel,
  disabled,
}: {
  action: 'last' | 'all'
  onConfirm: () => void
  onCancel: () => void
  disabled: boolean
}): React.ReactElement {
  return (
    <div
      data-testid={`history-return-${action}-confirm-panel`}
      className="gw-history-confirm"
      style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <span style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}>
        {STR.HISTORY_RETURN_CONFIRM_PROMPT}
      </span>
      <span style={{ fontSize: 14, color: 'var(--gw-text-faint, #71717a)' }}>
        {STR.HISTORY_RETURN_REASSURANCE}
      </span>
      <button
        className="gw-button gw-button--compact gw-button--primary"
        data-testid={`history-return-${action}-confirm`}
        disabled={disabled}
        onClick={onConfirm}
        style={{
          flexShrink: 0,
          padding: '4px 12px',
          background: 'var(--gw-accent, #6366f1)',
          border: 'none',
          borderRadius: 4,
          color: '#fff',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {disabled ? 'Returning…' : STR.HISTORY_RETURN_CONFIRM_BTN}
      </button>
      <button
        className="gw-button gw-button--compact gw-button--secondary"
        data-testid={`history-return-${action}-cancel`}
        disabled={disabled}
        onClick={onCancel}
        style={{
          flexShrink: 0,
          padding: '4px 12px',
          background: 'none',
          border: '1px solid var(--gw-surface3, #3f3f46)',
          borderRadius: 4,
          color: 'var(--gw-text-muted, #a1a1aa)',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 14,
        }}
      >
        {STR.HISTORY_RETURN_CANCEL_BTN}
      </button>
    </div>
  )
}

function HistoryDetailPane({
  selectedHash,
  detail,
  loading,
  error,
}: {
  selectedHash: string | null
  detail: GitCommitDetails | null
  loading: boolean
  error: string | null
}): React.ReactElement {
  if (!selectedHash) {
    return (
      <div
        data-testid="history-detail-empty"
        className="gw-empty-state gw-history-detail-empty"
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          color: 'var(--gw-text-dim, #52525b)',
          fontSize: 14,
          textAlign: 'center',
        }}
      >
        {STR.HISTORY_DETAIL_EMPTY_STATE}
      </div>
    )
  }

  if (error) {
    return (
      <div
        data-testid="history-detail-error"
        className="gw-card gw-history-alert gw-history-alert--danger"
        style={{
          margin: 16,
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
    )
  }

  if (loading || !detail) {
    return (
      <div
        data-testid="history-detail-loading"
        className="gw-empty-state gw-history-detail-empty"
        style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}
      >
        {STR.HISTORY_DETAIL_LOADING}
      </div>
    )
  }

  const { commit, parentHashes, files, patch } = detail

  return (
    <div
      data-testid="history-detail-content"
      className="gw-history-detail"
      style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
    >
      <div className="gw-history-detail-meta" data-testid="history-detail-meta">
        <div className="gw-history-detail-subject" data-testid="history-detail-subject">
          {commit.message}
        </div>
        <div className="gw-history-detail-hash" data-testid="history-detail-hash">
          <span className="gw-history-detail-short-hash">{commit.shortHash}</span>
          <span className="gw-history-detail-full-hash">{commit.fullHash}</span>
        </div>
        <div className="gw-history-detail-author" data-testid="history-detail-author">
          {commit.authorName} &lt;{commit.authorEmail}&gt;
        </div>
        <div className="gw-history-detail-date" data-testid="history-detail-date">
          {new Date(commit.date).toLocaleString()}
        </div>
        {parentHashes.length === 0 && (
          <div className="gw-history-detail-parent-context" data-testid="history-detail-context">
            {STR.HISTORY_DETAIL_ROOT_CONTEXT}
          </div>
        )}
        {parentHashes.length >= 2 && (
          <div className="gw-history-detail-parent-context" data-testid="history-detail-context">
            {STR.HISTORY_DETAIL_MERGE_CONTEXT(parentHashes.length)}
          </div>
        )}
        <div className="gw-history-detail-file-count" data-testid="history-detail-file-count">
          {STR.HISTORY_DETAIL_FILE_COUNT(files.length)}
        </div>
      </div>

      {files.length === 0 ? (
        <div
          className="gw-empty-state"
          data-testid="history-detail-no-changes"
          style={{ padding: '16px', color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}
        >
          {STR.HISTORY_DETAIL_NO_CHANGES}
        </div>
      ) : (
        <div className="gw-history-detail-files" data-testid="history-detail-files">
          <div
            style={{
              padding: '8px 16px 4px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.065em',
              textTransform: 'uppercase',
              color: 'var(--gw-text-faint, #71717a)',
            }}
          >
            {STR.HISTORY_DETAIL_FILES_HEADING}
          </div>
          {files.map((f) => (
            <div
              key={f.previousPath ? `${f.previousPath}->${f.path}` : f.path}
              className="gw-history-detail-file-row"
              data-testid="history-detail-file-row"
            >
              <FileStatusBadge kind={f.status} />
              <span className="gw-history-detail-file-path">
                {f.previousPath ? `${f.previousPath} → ${f.path}` : f.path}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="gw-history-detail-patch" data-testid="history-detail-patch-wrapper">
        <div
          style={{
            padding: '8px 16px 4px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.065em',
            textTransform: 'uppercase',
            color: 'var(--gw-text-faint, #71717a)',
          }}
        >
          {STR.HISTORY_DETAIL_PATCH_HEADING}
        </div>
        <UnifiedDiff patch={patch} testId="history-diff-panel" />
      </div>
    </div>
  )
}

export default function HistoryScreen(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const {
    commits,
    loading,
    loadingMore,
    error,
    hasMore,
    eligibility,
    unpushedCount,
    returning,
    returnError,
    returnSuccessMessage,
    selectedHash,
    detail,
    detailLoading,
    detailError,
    load,
    loadMore,
    selectCommit,
    returnLast,
    returnAllUnpushed,
    clearReturnError,
  } = useHistoryStore()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  useEffect(() => {
    if (activeRepo) void load(activeRepo.localPath, activeRepo, currentBranch)
  }, [activeRepo, currentBranch, load])

  function startConfirm(action: 'last' | 'all'): void {
    clearReturnError()
    setConfirmAction(action)
  }

  async function confirmReturn(): Promise<void> {
    if (confirmAction === 'last') await returnLast()
    else if (confirmAction === 'all') await returnAllUnpushed()
    setConfirmAction(null)
  }

  const lastRefusal = eligibility?.refusals.last
  const allRefusal = eligibility?.refusals.all

  return (
    <div
      data-testid="screen-history"
      className="gw-page gw-history-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: 'var(--gw-text, #f4f4f5)',
      }}
    >
      {/* Header */}
      <div
        className="gw-toolbar gw-history-header"
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
        <h1 className="gw-history-title" style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
          {STR.NAV_HISTORY}
        </h1>
        {activeRepo && !loading && (
          <span style={{ fontSize: 14, color: 'var(--gw-text-faint, #71717a)' }}>
            {STR.HISTORY_LOADED_COUNT(commits.length)}
          </span>
        )}
      </div>

      {/* Body */}
      {!activeRepo ? (
        <div
          data-testid="history-empty"
          className="gw-empty-state gw-history-empty-state"
          style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}
        >
          {STR.HISTORY_NO_REPOSITORY}
        </div>
      ) : loading ? (
        <div
          className="gw-empty-state gw-history-empty-state"
          style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}
        >
          {STR.HISTORY_LOADING}
        </div>
      ) : (
        <ResizableMainSplit
          storageKey="gitwarden.layout.historySplit.v1"
          resizeLabel={STR.HISTORY_SPLIT_RESIZE_LABEL}
          handleTestId="history-main-resize-handle"
          startPaneTestId="history-list-pane"
          endPaneTestId="history-detail-pane"
          defaultStartWidth={460}
          minStartWidth={300}
          maxStartWidth={680}
          minEndWidth={320}
          start={
            <div data-testid="history-body" className="gw-history-body">
              {error && (
                <div
                  data-testid="history-error"
                  className="gw-card gw-history-alert gw-history-alert--danger"
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

              {returnError && (
                <div
                  data-testid="history-return-error"
                  className="gw-card gw-history-alert gw-history-alert--danger"
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
                  {returnError}
                </div>
              )}

              {/* Phase 102: an operation OUTCOME, not loaded data — survives a same-repo
              refresh, so it's still here if the user navigates back to History after
              landing on Status (where the auto-navigate takes them right after a
              successful return). */}
              {returnSuccessMessage && (
                <div
                  data-testid="history-return-success"
                  className="gw-card gw-history-alert gw-history-alert--success"
                  style={{
                    margin: '12px 16px',
                    padding: '8px 12px',
                    background: 'var(--gw-success-bg, #052e16)',
                    border: '1px solid var(--gw-success-border, #2d4a2d)',
                    borderRadius: 4,
                    fontSize: 14,
                    color: 'var(--gw-success, #4ade80)',
                  }}
                >
                  ✓ {returnSuccessMessage}
                </div>
              )}

              {/* Return-to-working-changes panel (Uncommit to Working Changes, Phase 79) */}
              {unpushedCount >= 1 && (
                <div
                  data-testid="history-return-panel"
                  className="gw-card gw-history-return-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    margin: '12px 16px',
                    padding: '10px 12px',
                    background: 'var(--gw-surface2, #27272a)',
                    border: '1px solid var(--gw-surface3, #3f3f46)',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--gw-text-faint, #71717a)',
                    }}
                  >
                    {STR.HISTORY_RETURN_PANEL_TITLE}
                  </div>
                  {confirmAction ? (
                    <ReturnConfirm
                      action={confirmAction}
                      disabled={returning}
                      onConfirm={() => void confirmReturn()}
                      onCancel={() => setConfirmAction(null)}
                    />
                  ) : (
                    <>
                      {eligibility?.canReturnLast ? (
                        <button
                          className="gw-button gw-button--compact gw-button--secondary"
                          data-testid="history-return-last"
                          onClick={() => startConfirm('last')}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '4px 12px',
                            background: 'none',
                            border: '1px solid var(--gw-surface3, #3f3f46)',
                            borderRadius: 4,
                            color: 'var(--gw-text, #f4f4f5)',
                            cursor: 'pointer',
                            fontSize: 14,
                          }}
                        >
                          {STR.HISTORY_RETURN_LAST_LABEL}
                        </button>
                      ) : (
                        lastRefusal && (
                          <span
                            data-testid="history-return-last-refusal"
                            style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}
                          >
                            {STR.HISTORY_REFUSAL[lastRefusal]}
                          </span>
                        )
                      )}

                      {unpushedCount > 1 &&
                        (eligibility?.canReturnAllUnpushed ? (
                          <button
                            className="gw-button gw-button--compact gw-button--secondary"
                            data-testid="history-return-all"
                            onClick={() => startConfirm('all')}
                            style={{
                              alignSelf: 'flex-start',
                              padding: '4px 12px',
                              background: 'none',
                              border: '1px solid var(--gw-surface3, #3f3f46)',
                              borderRadius: 4,
                              color: 'var(--gw-text, #f4f4f5)',
                              cursor: 'pointer',
                              fontSize: 14,
                            }}
                          >
                            {STR.HISTORY_RETURN_ALL_LABEL(unpushedCount)}
                          </button>
                        ) : (
                          allRefusal &&
                          allRefusal !== lastRefusal && (
                            <span
                              data-testid="history-return-all-refusal"
                              style={{ fontSize: 14, color: 'var(--gw-text-muted, #a1a1aa)' }}
                            >
                              {STR.HISTORY_REFUSAL[allRefusal]}
                            </span>
                          )
                        ))}
                    </>
                  )}
                </div>
              )}

              {commits.length === 0 && !error && (
                <div
                  className="gw-empty-state gw-history-empty-state"
                  style={{ padding: 24, color: 'var(--gw-text-faint, #71717a)', fontSize: 14 }}
                >
                  {STR.HISTORY_EMPTY_STATE}
                </div>
              )}

              {/* Column headings */}
              {commits.length > 0 && (
                <div
                  className="gw-history-grid gw-history-grid--header"
                  style={{
                    ...ROW,
                    fontSize: 14,
                    color: 'var(--gw-text-dim, #52525b)',
                    borderBottom: '1px solid var(--gw-surface3, #3f3f46)',
                    background: 'var(--gw-surface, #18181b)',
                    position: 'sticky',
                    top: 0,
                  }}
                >
                  <span>Hash</span>
                  <span>Message</span>
                  <span>Author</span>
                  <span>Date</span>
                </div>
              )}

              {/* Commit rows */}
              <div
                data-testid="history-commit-list"
                className="gw-history-commit-list"
                role="listbox"
                aria-label={STR.HISTORY_COMMIT_LIST_LABEL}
              >
                {commits.map((c, idx) => {
                  const isUnpushed = idx < unpushedCount
                  const isSelected = c.fullHash === selectedHash
                  return (
                    <div
                      key={c.fullHash}
                      data-testid="history-commit-row"
                      role="option"
                      tabIndex={0}
                      aria-selected={isSelected}
                      aria-label={STR.HISTORY_COMMIT_ROW_LABEL(c.message, c.shortHash)}
                      className={`gw-list-row gw-history-grid gw-history-commit-row${isUnpushed ? ' gw-history-commit-row--unpushed' : ''}${isSelected ? ' gw-history-commit-row--selected' : ''}`}
                      style={ROW}
                      onClick={() => void selectCommit(c.fullHash)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void selectCommit(c.fullHash)
                        }
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 14,
                          color: 'var(--gw-accent, #6366f1)',
                          flexShrink: 0,
                        }}
                      >
                        {c.shortHash}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          overflow: 'hidden',
                        }}
                      >
                        {isUnpushed && (
                          <span
                            data-testid="history-unpushed-marker"
                            style={{
                              flexShrink: 0,
                              fontSize: 14,
                              padding: '0 6px',
                              borderRadius: 3,
                              background: 'var(--gw-surface3, #3f3f46)',
                              color: 'var(--gw-text-muted, #a1a1aa)',
                            }}
                          >
                            {STR.HISTORY_UNPUSHED_MARKER}
                          </span>
                        )}
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--gw-text, #f4f4f5)',
                          }}
                          title={c.message}
                        >
                          {c.message}
                        </span>
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--gw-text-muted, #a1a1aa)',
                          fontSize: 14,
                        }}
                        title={c.authorEmail}
                      >
                        {c.authorName}
                      </span>
                      <span
                        style={{
                          color: 'var(--gw-text-faint, #71717a)',
                          fontSize: 14,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {new Date(c.date).toLocaleDateString()}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Sticky pagination footer (Phase 112): pinned to the bottom of the scroll
              pane so it stays reachable no matter how many pages have loaded, instead
              of receding to the physical end of an ever-growing list. */}
              {hasMore && (
                <div className="gw-history-load-more" data-testid="history-load-more-footer">
                  <button
                    data-testid="history-load-more"
                    className="gw-button gw-button--secondary"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                    style={{
                      fontSize: 14,
                      padding: '6px 16px',
                      borderRadius: 4,
                      border: '1px solid var(--gw-surface3, #3f3f46)',
                      background: 'none',
                      color: loadingMore
                        ? 'var(--gw-text-dim, #52525b)'
                        : 'var(--gw-text-muted, #a1a1aa)',
                      cursor: loadingMore ? 'default' : 'pointer',
                    }}
                  >
                    {loadingMore ? STR.HISTORY_LOADING_MORE : STR.HISTORY_LOAD_MORE}
                  </button>
                </div>
              )}
            </div>
          }
          end={
            <HistoryDetailPane
              selectedHash={selectedHash}
              detail={detail}
              loading={detailLoading}
              error={detailError}
            />
          }
        />
      )}
    </div>
  )
}
