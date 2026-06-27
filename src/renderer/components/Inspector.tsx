import React from 'react'
import { useAppStore } from '../store/appStore'
import { useProfilesStore, profileColor } from '../store/profilesStore'
import { useHeaderGuardStore } from '../store/headerGuardStore'
import type { HeaderGuardState } from '../../core/safety/headerGuard'
import { STR } from '../strings'

// Same state→colour mapping as the header GuardBadge, at lower visual weight (softer text
// colours rather than solid fills). The header owns the refresh effect; the Inspector only
// reads the resulting state — single source of truth.
const GUARD_LABEL: Record<HeaderGuardState, string> = {
  ready: STR.GUARD_READY,
  review: STR.GUARD_REVIEW,
  blocked: STR.GUARD_BLOCKED,
  checking: STR.GUARD_CHECKING,
  'not-checked': STR.GUARD_NOT_CHECKED,
}

const GUARD_TEXT_COLOR: Record<HeaderGuardState, string> = {
  ready: 'var(--gw-success, #4ade80)',
  review: 'var(--gw-warning, #fbbf24)',
  blocked: 'var(--gw-danger, #f87171)',
  checking: 'var(--gw-text-muted, #a1a1aa)',
  'not-checked': 'var(--gw-text-muted, #a1a1aa)',
}

export default function Inspector(): React.ReactElement {
  const { activeRepo, currentBranch } = useAppStore()
  const guardState = useHeaderGuardStore((s) => s.state)
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null

  return (
    <div
      data-testid="inspector-panel"
      style={{
        height: '100%',
        padding: '12px',
        fontSize: 14,
        color: 'var(--gw-text-muted, #a1a1aa)',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
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
          <span style={{ color: 'var(--gw-text, #f4f4f5)', fontFamily: 'monospace', fontSize: 14 }}>
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

      <Section label="Guard">
        <span
          data-testid="inspector-guard-state"
          style={{
            color: GUARD_TEXT_COLOR[guardState],
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          {GUARD_LABEL[guardState].replace('Guard · ', '')}
        </span>
      </Section>
    </div>
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
          fontSize: 14,
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
