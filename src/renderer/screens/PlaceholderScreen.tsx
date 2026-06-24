import React from 'react'

interface Props {
  title: string
  description: string
}

export function PlaceholderScreen({ title, description }: Props): React.ReactElement {
  return (
    <div
      data-testid={`screen-${title.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 8,
        color: 'var(--gw-text-faint, #71717a)',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--gw-text-muted, #a1a1aa)' }}>
        {title}
      </div>
      <div style={{ fontSize: 13 }}>{description}</div>
    </div>
  )
}
