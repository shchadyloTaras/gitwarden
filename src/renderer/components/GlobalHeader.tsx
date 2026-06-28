import React, { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useProfilesStore, profileColor } from '../store/profilesStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useBranchStore } from '../store/branchStore'
import { useHeaderGuardStore } from '../store/headerGuardStore'
import type { HeaderGuardState } from '../../core/safety/headerGuard'
import Dropdown from './Dropdown'
import Logo from './Logo'
import { STR } from '../strings'

const GUARD_LABEL: Record<HeaderGuardState, string> = {
  ready: STR.GUARD_READY,
  review: STR.GUARD_REVIEW,
  blocked: STR.GUARD_BLOCKED,
  checking: STR.GUARD_CHECKING,
  'not-checked': STR.GUARD_NOT_CHECKED,
}

const NEUTRAL_GUARD_STYLE: React.CSSProperties = {
  background: 'var(--gw-surface3, #3f3f46)',
  color: 'var(--gw-text-muted, #a1a1aa)',
}

const GUARD_STYLE: Record<HeaderGuardState, React.CSSProperties> = {
  ready: { background: 'var(--gw-success-solid, #16a34a)', color: 'var(--gw-on-solid, #fff)' },
  review: { background: 'var(--gw-warning-solid, #ca8a04)', color: 'var(--gw-on-solid, #fff)' },
  blocked: { background: 'var(--gw-danger-solid, #dc2626)', color: 'var(--gw-on-solid, #fff)' },
  checking: NEUTRAL_GUARD_STYLE,
  'not-checked': NEUTRAL_GUARD_STYLE,
}

const SELECT_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--gw-text, #f4f4f5)',
  fontSize: 14,
  cursor: 'pointer',
  padding: '2px 4px',
  borderRadius: 4,
  maxWidth: 180,
}

const HEADER_ACTION_BUTTON_STYLE: React.CSSProperties = {
  width: 40,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: '1px solid var(--gw-surface3, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  cursor: 'pointer',
  padding: 0,
  fontSize: 14,
  lineHeight: 1,
  flexShrink: 0,
}

export default function GlobalHeader(): React.ReactElement {
  const { activeRepo, currentBranch, toggleInspector, openRightPanel, setActiveRepo, navigate } =
    useAppStore()
  const repos = useRepositoriesStore((s) => s.repos)
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null
  const { branches, load: loadBranches, doSwitch } = useBranchStore()

  const guardState = useHeaderGuardStore((s) => s.state)
  const guardIssueCount = useHeaderGuardStore((s) => s.issueCount)
  const refreshGuard = useHeaderGuardStore((s) => s.refresh)
  const resetGuard = useHeaderGuardStore((s) => s.reset)

  // Load branches whenever the active repo changes
  useEffect(() => {
    if (activeRepo) {
      void loadBranches(activeRepo.localPath, activeRepo)
    }
  }, [activeRepo, loadBranches])

  // The header is always mounted, so this effect gives the guard app-wide live updates on
  // every repo/profile change — mirrors SafetyCenterScreen's load effect.
  useEffect(() => {
    if (activeRepo) {
      void refreshGuard(activeRepo.localPath, activeRepo, activeProfile, profiles)
    } else {
      resetGuard()
    }
  }, [activeRepo, activeProfile, profiles, refreshGuard, resetGuard])

  const localBranches = branches.filter((b) => !b.isRemote)

  // aria-label carries the state, the issue count, and where a click goes (count is dynamic,
  // so it is composed here rather than stored). The leading "Guard · " prefix is dropped so
  // the spoken state reads naturally, e.g. "Guard status: Blocked, 2 issues. Open Safety Center."
  const guardStateWord = GUARD_LABEL[guardState].replace('Guard · ', '')
  const guardDestination = activeRepo ? STR.GUARD_OPEN_SAFETY_CENTER : STR.GUARD_OPEN_REPOSITORIES
  const guardAriaLabel = `Guard status: ${guardStateWord}, ${guardIssueCount} issue${
    guardIssueCount === 1 ? '' : 's'
  }. ${guardDestination}.`

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
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '-0.02em',
          marginRight: 8,
        }}
      >
        <Logo size={20} />
        {STR.APP_TITLE}
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
          <span style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}>on</span>
          <Dropdown
            testId="header-branch-select"
            ariaLabel="Current branch"
            monospace
            value={currentBranch ?? ''}
            options={localBranches.map((b) => {
              const checkedOutElsewhere = Boolean(
                !b.isCurrent && b.worktreePath && b.worktreePath !== activeRepo?.localPath
              )
              return {
                value: b.name,
                label: checkedOutElsewhere ? `${b.name} (worktree)` : b.name,
                disabled: checkedOutElsewhere,
              }
            })}
            onChange={(name) => void doSwitch(name)}
            triggerStyle={{
              ...SELECT_STYLE,
              fontSize: 14,
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
          <span style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}>on</span>
          <span
            data-testid="header-branch"
            style={{
              fontSize: 14,
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

      <button
        data-testid="header-guard-badge"
        aria-label={guardAriaLabel}
        onClick={() => navigate(activeRepo ? 'safety-center' : 'repositories')}
        style={{
          ...GUARD_STYLE[guardState],
          fontSize: 14,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 4,
          letterSpacing: '0.03em',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          lineHeight: 1.4,
        }}
      >
        {GUARD_LABEL[guardState]}
      </button>

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
          <span style={{ fontSize: 14, color: 'var(--gw-text, #f4f4f5)' }}>
            {activeProfile.displayName}
          </span>
        </div>
      )}

      <button
        data-testid="header-ai-chat"
        aria-label={STR.CHAT_OPEN_LABEL}
        onClick={() => openRightPanel('chat')}
        style={{
          ...HEADER_ACTION_BUTTON_STYLE,
          marginLeft: 4,
          fontWeight: 600,
        }}
      >
        AI
      </button>

      <button
        aria-label="Toggle inspector"
        onClick={toggleInspector}
        style={HEADER_ACTION_BUTTON_STYLE}
      >
        ⓘ
      </button>
    </header>
  )
}
