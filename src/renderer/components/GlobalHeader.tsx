import React, { useEffect } from 'react'
import { useAppStore, SafetyBadge } from '../store/appStore'
import { useProfilesStore, profileColor } from '../store/profilesStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useBranchStore } from '../store/branchStore'
import Dropdown from './Dropdown'
import { STR } from '../strings'

const BADGE_STYLE: Record<SafetyBadge, React.CSSProperties> = {
  safe: { background: 'var(--gw-success-solid, #16a34a)', color: 'var(--gw-on-solid, #fff)' },
  warning: { background: 'var(--gw-warning-solid, #ca8a04)', color: 'var(--gw-on-solid, #fff)' },
  blocked: { background: 'var(--gw-danger-solid, #dc2626)', color: 'var(--gw-on-solid, #fff)' },
}

const BADGE_LABEL: Record<SafetyBadge, string> = {
  safe: 'Safe',
  warning: 'Warning',
  blocked: 'Blocked',
}

const SELECT_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--gw-text, #f4f4f5)',
  fontSize: 13,
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: 4,
  maxWidth: 180,
}

export default function GlobalHeader(): React.ReactElement {
  const { activeRepo, currentBranch, safetyBadge, toggleInspector, openRightPanel, setActiveRepo } =
    useAppStore()
  const repos = useRepositoriesStore((s) => s.repos)
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null
  const { branches, load: loadBranches, doSwitch } = useBranchStore()

  // Load branches whenever the active repo changes
  useEffect(() => {
    if (activeRepo) {
      void loadBranches(activeRepo.localPath, activeRepo)
    }
  }, [activeRepo, loadBranches])

  const localBranches = branches.filter((b) => !b.isRemote)

  return (
    <header
      data-testid="global-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 1rem',
        height: 48,
        background: 'var(--gw-surface, #18181b)',
        borderBottom: '1px solid var(--gw-border, #27272a)',
        color: 'var(--gw-text, #f4f4f5)',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', marginRight: 8 }}>
        GitWarden
      </span>

      <div style={{ width: 1, height: 20, background: 'var(--gw-surface3, #3f3f46)' }} />

      {/* Repo picker */}
      <Dropdown
        testId="header-repo-select"
        ariaLabel="Active repository"
        placeholder="No repositories"
        value={activeRepo?.id ?? ''}
        options={repos.map((r) => ({ value: r.id, label: r.name }))}
        onChange={(id) => setActiveRepo(repos.find((r) => r.id === id) ?? null)}
        triggerStyle={SELECT_STYLE}
      />

      {/* Branch picker */}
      {localBranches.length > 0 && (
        <>
          <span style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 12 }}>on</span>
          <Dropdown
            testId="header-branch-select"
            ariaLabel="Current branch"
            monospace
            value={currentBranch ?? ''}
            options={localBranches.map((b) => ({ value: b.name, label: b.name }))}
            onChange={(name) => void doSwitch(name)}
            triggerStyle={{
              ...SELECT_STYLE,
              fontSize: 12,
              background: 'var(--gw-surface2, #27272a)',
              padding: '2px 6px',
              maxWidth: 140,
            }}
          />
        </>
      )}

      {/* Fallback: show branch text when branches not loaded yet */}
      {localBranches.length === 0 && currentBranch && (
        <>
          <span style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 12 }}>on</span>
          <span
            data-testid="header-branch"
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              background: 'var(--gw-surface2, #27272a)',
              padding: '2px 6px',
              borderRadius: 4,
              color: 'var(--gw-text-muted, #a1a1aa)',
            }}
          >
            {currentBranch}
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      <span
        data-testid="header-safety-badge"
        style={{
          ...BADGE_STYLE[safetyBadge],
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 4,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        {BADGE_LABEL[safetyBadge]}
      </span>

      <div style={{ width: 1, height: 20, background: 'var(--gw-surface3, #3f3f46)' }} />

      {activeProfile && (
        <div data-testid="header-profile" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: profileColor(activeProfile.id),
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--gw-text, #f4f4f5)' }}>
            {activeProfile.displayName}
          </span>
        </div>
      )}

      <button
        data-testid="header-ai-chat"
        aria-label={STR.CHAT_OPEN_LABEL}
        onClick={() => openRightPanel('chat')}
        style={{
          marginLeft: 4,
          background: 'none',
          border: '1px solid var(--gw-surface3, #3f3f46)',
          borderRadius: 4,
          color: 'var(--gw-text-muted, #a1a1aa)',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        AI
      </button>

      <button
        aria-label="Toggle inspector"
        onClick={toggleInspector}
        style={{
          background: 'none',
          border: '1px solid var(--gw-surface3, #3f3f46)',
          borderRadius: 4,
          color: 'var(--gw-text-muted, #a1a1aa)',
          cursor: 'pointer',
          padding: '2px 6px',
          fontSize: 12,
        }}
      >
        ⓘ
      </button>
    </header>
  )
}
