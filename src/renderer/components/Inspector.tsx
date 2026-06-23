import React from 'react'
import { useAppStore } from '../store/appStore'

export default function Inspector(): React.ReactElement {
  const { activeProfile, activeRepo, currentBranch, safetyBadge, inspectorOpen } = useAppStore()

  if (!inspectorOpen) return <></>

  return (
    <aside
      data-testid="inspector-panel"
      style={{
        width: 220,
        flexShrink: 0,
        background: '#18181b',
        borderLeft: '1px solid #27272a',
        padding: '12px',
        fontSize: 12,
        color: '#a1a1aa',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.06em',
          color: '#52525b',
          marginBottom: 10,
        }}
      >
        CONTEXT
      </div>

      <Section label="Profile">
        {activeProfile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: activeProfile.color,
              }}
            />
            <span style={{ color: '#e4e4e7' }}>{activeProfile.name}</span>
          </div>
        ) : (
          <Empty>None</Empty>
        )}
        {activeProfile && (
          <>
            <Row label="Name" value={activeProfile.gitName} />
            <Row label="Email" value={activeProfile.gitEmail} />
          </>
        )}
      </Section>

      <Section label="Repository">
        {activeRepo ? (
          <span style={{ color: '#e4e4e7', fontFamily: 'monospace', fontSize: 11 }}>
            {activeRepo.name}
          </span>
        ) : (
          <Empty>None selected</Empty>
        )}
      </Section>

      <Section label="Branch">
        {currentBranch ? (
          <span style={{ color: '#e4e4e7', fontFamily: 'monospace' }}>{currentBranch}</span>
        ) : (
          <Empty>—</Empty>
        )}
      </Section>

      <Section label="Safety">
        <span
          style={{
            color:
              safetyBadge === 'safe'
                ? '#4ade80'
                : safetyBadge === 'warning'
                  ? '#facc15'
                  : '#f87171',
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          {safetyBadge}
        </span>
      </Section>
    </aside>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#52525b',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
      <span style={{ color: '#52525b' }}>{label}</span>
      <span style={{ color: '#a1a1aa', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span style={{ color: '#52525b', fontStyle: 'italic' }}>{children}</span>
}
