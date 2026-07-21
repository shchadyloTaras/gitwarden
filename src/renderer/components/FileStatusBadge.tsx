import React from 'react'

export const KIND_COLOR: Record<string, string> = {
  added: 'var(--gw-success, #4ade80)',
  modified: 'var(--gw-info, #60a5fa)',
  deleted: 'var(--gw-danger, #f87171)',
  renamed: 'var(--gw-purple, #a78bfa)',
  copied: 'var(--gw-teal, #34d399)',
  conflicted: 'var(--gw-warning, #fbbf24)',
  untracked: 'var(--gw-code-muted, #94a3b8)',
  // History Commit Details (Phase 113): GitCommitFileStatus's two extra statuses.
  typeChanged: 'var(--gw-purple, #a78bfa)',
  unmerged: 'var(--gw-warning, #fbbf24)',
}

export const KIND_ABBREV: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  conflicted: '!',
  untracked: '?',
  unmodified: ' ',
  ignored: 'I',
  typeChanged: 'T',
  unmerged: '!',
}

export function FileStatusBadge({ kind }: { kind: string }): React.ReactElement {
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
