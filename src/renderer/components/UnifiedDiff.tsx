import React from 'react'

/**
 * One line of a unified diff, colored by its leading marker. Shared by Status (staged/
 * unstaged file diffs) and History (Phase 113, read-only commit patches) so the two
 * screens never drift in how they present the same underlying format.
 */
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

/** Renders a complete unparsed unified-diff/patch string as colored, monospaced lines. */
export default function UnifiedDiff({
  patch,
  testId = 'diff-panel',
}: {
  patch: string
  testId?: string
}): React.ReactElement {
  return (
    <div data-testid={testId} style={{ paddingBottom: 16 }}>
      {patch.split('\n').map((line, i) => (
        <DiffLine key={i} line={line} />
      ))}
    </div>
  )
}
