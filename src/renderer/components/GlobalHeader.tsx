import React, { useEffect } from 'react'
import { useAppStore, SafetyBadge } from '../store/appStore'
import { useProfilesStore, profileColor } from '../store/profilesStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useBranchStore } from '../store/branchStore'

const BADGE_STYLE: Record<SafetyBadge, React.CSSProperties> = {
  safe: { background: '#16a34a', color: '#fff' },
  warning: { background: '#ca8a04', color: '#fff' },
  blocked: { background: '#dc2626', color: '#fff' },
}

const BADGE_LABEL: Record<SafetyBadge, string> = {
  safe: 'Safe',
  warning: 'Warning',
  blocked: 'Blocked',
}

const SELECT_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#e4e4e7',
  fontSize: 13,
  cursor: 'pointer',
  outline: 'none',
  padding: '2px 4px',
  borderRadius: 4,
  maxWidth: 180,
}

export default function GlobalHeader(): React.ReactElement {
  const { activeRepo, currentBranch, safetyBadge, toggleInspector, setActiveRepo } = useAppStore()
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
        background: '#18181b',
        borderBottom: '1px solid #27272a',
        color: '#f4f4f5',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', marginRight: 8 }}>
        GitWarden
      </span>

      <div style={{ width: 1, height: 20, background: '#3f3f46' }} />

      {/* Repo picker */}
      <select
        data-testid="header-repo-select"
        value={activeRepo?.id ?? ''}
        onChange={(e) => {
          const repo = repos.find((r) => r.id === e.target.value) ?? null
          setActiveRepo(repo)
        }}
        style={activeRepo ? SELECT_STYLE : { ...SELECT_STYLE, color: '#71717a' }}
      >
        {repos.length === 0 && <option value="">No repositories</option>}
        {repos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      {/* Branch picker */}
      {localBranches.length > 0 && (
        <>
          <span style={{ color: '#52525b', fontSize: 12 }}>on</span>
          <select
            data-testid="header-branch-select"
            value={currentBranch ?? ''}
            onChange={(e) => {
              void doSwitch(e.target.value)
            }}
            style={{
              ...SELECT_STYLE,
              fontSize: 12,
              fontFamily: 'monospace',
              background: '#27272a',
              padding: '2px 6px',
              maxWidth: 140,
            }}
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </>
      )}

      {/* Fallback: show branch text when branches not loaded yet */}
      {localBranches.length === 0 && currentBranch && (
        <>
          <span style={{ color: '#52525b', fontSize: 12 }}>on</span>
          <span
            data-testid="header-branch"
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              background: '#27272a',
              padding: '2px 6px',
              borderRadius: 4,
              color: '#a1a1aa',
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

      <div style={{ width: 1, height: 20, background: '#3f3f46' }} />

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
          <span style={{ fontSize: 13, color: '#e4e4e7' }}>{activeProfile.displayName}</span>
        </div>
      )}

      <button
        aria-label="Toggle inspector"
        onClick={toggleInspector}
        style={{
          marginLeft: 4,
          background: 'none',
          border: '1px solid #3f3f46',
          borderRadius: 4,
          color: '#a1a1aa',
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
