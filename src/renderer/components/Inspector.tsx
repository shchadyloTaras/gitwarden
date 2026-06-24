import React from 'react'
import { useAppStore } from '../store/appStore'
import { useProfilesStore, profileColor } from '../store/profilesStore'

export default function Inspector(): React.ReactElement {
  const { activeRepo, currentBranch, safetyBadge, inspectorOpen } = useAppStore()
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null

  if (!inspectorOpen) return <></>

  return (
    <aside
      data-testid="inspector-panel"
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--gw-surface, #18181b)',
        borderLeft: '1px solid var(--gw-border, #27272a)',
        padding: '12px',
        fontSize: 12,
        color: 'var(--gw-text-muted, #a1a1aa)',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: '0.06em',
          color: 'var(--gw-text-dim, #52525b)',
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
                background: profileColor(activeProfile.id),
              }}
            />
            <span style={{ color: 'var(--gw-text, #f4f4f5)' }}>{activeProfile.displayName}</span>
          </div>
        ) : (
          <Empty>None</Empty>
        )}
        {activeProfile && (
          <>
            <Row label="Name" value={activeProfile.gitAuthorName} />
            <Row label="Email" value={activeProfile.gitAuthorEmail} />
          </>
        )}
      </Section>

      <Section label="Repository">
        {activeRepo ? (
          <span style={{ color: 'var(--gw-text, #f4f4f5)', fontFamily: 'monospace', fontSize: 11 }}>
            {activeRepo.name}
          </span>
        ) : (
          <Empty>None selected</Empty>
        )}
      </Section>

      <Section label="Branch">
        {currentBranch ? (
          <span style={{ color: 'var(--gw-text, #f4f4f5)', fontFamily: 'monospace' }}>
            {currentBranch}
          </span>
        ) : (
          <Empty>—</Empty>
        )}
      </Section>

      <Section label="Safety">
        <span
          style={{
            color:
              safetyBadge === 'safe'
                ? 'var(--gw-success, #4ade80)'
                : safetyBadge === 'warning'
                  ? 'var(--gw-warning, #fbbf24)'
                  : 'var(--gw-danger, #f87171)',
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
          color: 'var(--gw-text-dim, #52525b)',
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
      <span style={{ color: 'var(--gw-text-dim, #52525b)' }}>{label}</span>
      <span
        style={{
          color: 'var(--gw-text-muted, #a1a1aa)',
          textAlign: 'right',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <span style={{ color: 'var(--gw-text-dim, #52525b)', fontStyle: 'italic' }}>{children}</span>
  )
}
