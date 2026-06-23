import React from 'react'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useHistoryStore } from '../store/historyStore'
import type { RepositoryRecord } from '../../core/types'

const ROW: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr 160px 110px',
  alignItems: 'baseline',
  gap: 12,
  padding: '7px 16px',
  borderBottom: '1px solid #27272a',
  fontSize: 13,
}

export default function HistoryScreen(): React.ReactElement {
  const repositories = useRepositoriesStore((s) => s.repos)
  const { repoPath, repository, commits, loading, loadingMore, error, hasMore, load, loadMore } =
    useHistoryStore()

  function handleRepoChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const repo = repositories.find((r: RepositoryRecord) => r.id === e.target.value)
    if (repo) void load(repo.localPath, repo)
  }

  return (
    <div
      data-testid="screen-history"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#e4e4e7' }}
    >
      {/* Header */}
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
        <span style={{ fontWeight: 600, fontSize: 14 }}>History</span>
        <select
          data-testid="history-repo-select"
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
        {repoPath && !loading && (
          <span style={{ fontSize: 12, color: '#71717a' }}>{commits.length} commits loaded</span>
        )}
      </div>

      {/* Body */}
      {!repoPath ? (
        <div
          data-testid="history-empty"
          style={{ padding: 24, color: '#71717a', fontSize: 13 }}
        >
          Select a repository to view its commit history.
        </div>
      ) : loading ? (
        <div style={{ padding: 24, color: '#71717a', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {error && (
            <div
              data-testid="history-error"
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

          {commits.length === 0 && !error && (
            <div style={{ padding: 24, color: '#71717a', fontSize: 13 }}>
              No commits found in this repository.
            </div>
          )}

          {/* Column headings */}
          {commits.length > 0 && (
            <div
              style={{
                ...ROW,
                fontSize: 11,
                color: '#52525b',
                borderBottom: '1px solid #3f3f46',
                background: '#18181b',
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
          <div data-testid="history-commit-list">
            {commits.map((c) => (
              <div key={c.fullHash} data-testid="history-commit-row" style={ROW}>
                <span
                  style={{ fontFamily: 'monospace', fontSize: 12, color: '#6366f1', flexShrink: 0 }}
                >
                  {c.shortHash}
                </span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#e4e4e7',
                  }}
                  title={c.message}
                >
                  {c.message}
                </span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#a1a1aa',
                    fontSize: 12,
                  }}
                  title={c.authorEmail}
                >
                  {c.authorName}
                </span>
                <span style={{ color: '#71717a', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {new Date(c.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div style={{ padding: '12px 16px', flexShrink: 0 }}>
              <button
                data-testid="history-load-more"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                style={{
                  fontSize: 13,
                  padding: '6px 16px',
                  borderRadius: 4,
                  border: '1px solid #3f3f46',
                  background: 'none',
                  color: loadingMore ? '#52525b' : '#a1a1aa',
                  cursor: loadingMore ? 'default' : 'pointer',
                }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
