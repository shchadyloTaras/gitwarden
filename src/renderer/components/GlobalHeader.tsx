import React, { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import type { NavScreen } from '../store/appStore'
import { useProfilesStore, profileColor } from '../store/profilesStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { useBranchStore } from '../store/branchStore'
import { useHeaderGuardStore } from '../store/headerGuardStore'
import { useUpdatesStore } from '../store/updatesStore'
import { refreshActiveRepo } from '../store/refreshActiveRepo'
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
  const {
    activeRepo,
    currentBranch,
    inspectorOpen,
    toggleInspector,
    openRightPanel,
    setActiveRepo,
    navigate,
  } = useAppStore()
  const repos = useRepositoriesStore((s) => s.repos)
  const profiles = useProfilesStore((s) => s.profiles)
  const activeProfileId = useProfilesStore((s) => s.activeProfileId)
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null
  const {
    branches,
    loading: branchesLoading,
    load: loadBranches,
    doSwitch,
    doSwitchBringChanges,
    switching,
    switchError,
    clearSwitchError,
    clear: clearBranches,
  } = useBranchStore()

  const guardState = useHeaderGuardStore((s) => s.state)
  const guardIssueCount = useHeaderGuardStore((s) => s.issueCount)
  const refreshGuard = useHeaderGuardStore((s) => s.refresh)
  const resetGuard = useHeaderGuardStore((s) => s.reset)

  // Notifier: surface the Update button ONLY when a newer release has actually been published.
  const updateResult = useUpdatesStore((s) => s.result)
  const availableUpdate = updateResult?.status === 'update-available' ? updateResult.release : null

  // Load branches whenever the active repo changes; clear when no repo is selected.
  // Keyed on id/localPath, NOT the whole activeRepo object — a same-repo metadata save
  // (e.g. editing notes) constructs a fresh object that would otherwise blank and
  // refetch the picker on every save even though the branch list can't have changed
  // (W30).
  useEffect(() => {
    if (activeRepo) {
      void loadBranches(activeRepo.localPath, activeRepo)
    } else {
      clearBranches()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on id/localPath, not the whole activeRepo object (W30)
  }, [activeRepo?.id, activeRepo?.localPath, loadBranches, clearBranches])

  // The header is always mounted, so this effect gives the guard app-wide live updates on
  // every repo/profile change — mirrors SafetyCenterScreen's load effect. Keyed on
  // activeRepo's id/assignedProfileId (not the whole object) for the same reason as
  // above; activeProfile/profiles stay full dependencies since the guard genuinely
  // needs to recheck when either of those changes.
  useEffect(() => {
    if (activeRepo) {
      void refreshGuard(activeRepo.localPath, activeRepo, activeProfile, profiles)
    } else {
      resetGuard()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on id/assignedProfileId, not the whole activeRepo object (W30)
  }, [
    activeRepo?.id,
    activeRepo?.assignedProfileId,
    activeProfile,
    profiles,
    refreshGuard,
    resetGuard,
  ])

  const localBranches = branches.filter((b) => !b.isRemote)
  // Once branches have loaded (post Phase 92's unborn-HEAD synthesis in getBranches),
  // no local branch being isCurrent means detached HEAD — never a stale branch name.
  const detached =
    Boolean(activeRepo) && !branchesLoading && !localBranches.some((b) => b.isCurrent)

  // aria-label carries the state, the issue count, and where a click goes (count is dynamic,
  // so it is composed here rather than stored). The leading "Guard · " prefix is dropped so
  // the spoken state reads naturally, e.g. "Guard status: Blocked, 2 issues. Open Safety Center."
  const guardStateWord = GUARD_LABEL[guardState].replace('Guard · ', '')
  // With no active repo the guard routes to setup — Repositories normally, but Profiles
  // while none exist yet (Repositories is locked until the first profile is created).
  const guardFallbackScreen: NavScreen = profiles.length === 0 ? 'profiles' : 'repositories'
  const guardDestination = activeRepo
    ? STR.GUARD_OPEN_SAFETY_CENTER
    : guardFallbackScreen === 'profiles'
      ? STR.GUARD_OPEN_PROFILES
      : STR.GUARD_OPEN_REPOSITORIES
  const guardAriaLabel = `Guard status: ${guardStateWord}, ${guardIssueCount} issue${
    guardIssueCount === 1 ? '' : 's'
  }. ${guardDestination}.`

  return (
    <>
      <header
        className="gw-global-header"
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
          className="gw-header__brand"
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
          <span className="gw-header__brand-label">{STR.APP_TITLE}</span>
        </span>

        <div
          className="gw-header__divider"
          style={{ width: 1, height: 20, background: 'var(--gw-surface3, #3f3f46)' }}
        />

        {/* Repo picker */}
        <Dropdown
          testId="header-repo-select"
          ariaLabel={STR.HEADER_REPO_PICKER}
          tooltip={STR.HEADER_REPO_PICKER}
          tooltipPos="bottom"
          triggerClassName="gw-header__repo-trigger"
          placeholder="No repositories"
          value={activeRepo?.id ?? ''}
          options={repos.map((r) => ({ value: r.id, label: r.name }))}
          onChange={(id) => {
            const picked = repos.find((r) => r.id === id) ?? null
            // Re-selecting the SAME repo is a value-equal no-op for setActiveRepo (W30) —
            // route it through the explicit refresh seam instead of doing nothing (W14).
            if (picked && picked.id === activeRepo?.id) {
              void refreshActiveRepo()
            } else {
              setActiveRepo(picked)
            }
          }}
          triggerStyle={SELECT_STYLE}
        />

        {/* Detached HEAD pill (Phase 92): a distinct state, never a stale branch name */}
        {detached && (
          <>
            <span
              className="gw-header__context-label"
              style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}
            >
              {STR.HEADER_CHECKED_OUT}
            </span>
            <span
              data-testid="header-branch-detached"
              data-tooltip={STR.BRANCH_DETACHED_HINT}
              data-tooltip-pos="bottom"
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                background: 'var(--gw-warning-bg, #451a03)',
                border: '1px solid var(--gw-warning-solid, #d97706)',
                color: 'var(--gw-warning, #fbbf24)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {STR.BRANCH_DETACHED_PILL}
            </span>
          </>
        )}

        {/* Branch picker */}
        {!detached && localBranches.length > 0 && (
          <>
            <span
              className="gw-header__context-label"
              style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}
            >
              {STR.HEADER_CHECKED_OUT}
            </span>
            <Dropdown
              testId="header-branch-select"
              ariaLabel={STR.HEADER_BRANCH_PICKER}
              tooltip={STR.HEADER_BRANCH_PICKER}
              tooltipPos="bottom"
              triggerClassName="gw-header__branch-trigger"
              monospace
              value={currentBranch ?? ''}
              options={localBranches.map((b) => {
                const checkedOutElsewhere = Boolean(
                  !b.isCurrent && b.worktreePath && b.worktreePath !== activeRepo?.localPath
                )
                return {
                  value: b.name,
                  label: checkedOutElsewhere ? STR.BRANCH_LABEL_WORKTREE(b.name) : b.name,
                  disabled: checkedOutElsewhere,
                  title:
                    checkedOutElsewhere && b.worktreePath
                      ? STR.BRANCH_CHECKED_OUT_ELSEWHERE_HINT(b.worktreePath)
                      : undefined,
                }
              })}
              onChange={(name) => void doSwitch(name)}
              disabled={switching}
              triggerStyle={{
                ...SELECT_STYLE,
                fontSize: 14,
                background: 'var(--gw-surface2, #27272a)',
                padding: '2px 6px',
                maxWidth: 140,
              }}
              popupMinWidth={240}
            />
          </>
        )}

        {/* Fallback: show branch text when branches not loaded yet */}
        {!detached && localBranches.length === 0 && currentBranch && (
          <>
            <span
              className="gw-header__context-label"
              style={{ color: 'var(--gw-text-dim, #52525b)', fontSize: 14 }}
            >
              {STR.HEADER_CHECKED_OUT}
            </span>
            <span
              data-testid="header-branch"
              className="gw-header__branch-fallback"
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

        <div className="gw-header__spacer" style={{ flex: 1 }} />

        <button
          data-testid="header-guard-badge"
          className="gw-header__guard"
          aria-label={guardAriaLabel}
          data-tooltip={guardDestination}
          data-tooltip-pos="bottom"
          onClick={() => navigate(activeRepo ? 'safety-center' : guardFallbackScreen)}
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

        <div
          className="gw-header__divider gw-header__divider--trailing"
          style={{ width: 1, height: 20, background: 'var(--gw-surface3, #3f3f46)' }}
        />

        {activeProfile && (
          <div
            data-testid="header-profile"
            className="gw-header__profile"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
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

        {availableUpdate && (
          <button
            data-testid="header-update-button"
            className="gw-header__update"
            aria-label={STR.UPDATE_BUTTON_ARIA(availableUpdate.version)}
            data-tooltip={STR.UPDATE_AVAILABLE(availableUpdate.version)}
            data-tooltip-pos="bottom"
            onClick={() => void window.api.shell.openExternal(availableUpdate.url)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 32,
              padding: '0 10px',
              marginLeft: 4,
              background: 'var(--gw-accent, #6366f1)',
              color: 'var(--gw-on-solid, #fff)',
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>
              ↓
            </span>
            {STR.UPDATE_BUTTON_LABEL}
          </button>
        )}

        <button
          data-testid="header-ai-chat"
          className="gw-header__action"
          aria-label={STR.CHAT_OPEN_LABEL}
          aria-controls="gitwarden-right-panel"
          data-tooltip={STR.CHAT_OPEN_LABEL}
          data-tooltip-pos="bottom"
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
          className="gw-header__action"
          aria-label={STR.INSPECTOR_TOGGLE}
          aria-controls="gitwarden-right-panel"
          aria-expanded={inspectorOpen}
          data-tooltip={STR.INSPECTOR_TOGGLE}
          data-tooltip-pos="bottom"
          onClick={toggleInspector}
          style={HEADER_ACTION_BUTTON_STYLE}
        >
          ⓘ
        </button>
      </header>

      {/* Switch-failure banner (W3): stacks below the header via normal flex-column
          flow in App.tsx — no anchoring math needed. Tagged with the branch it's FOR
          so a superseded switch's error never lingers once a newer one lands (#13). */}
      {switchError && (
        <div
          data-testid="header-switch-error"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            background: 'var(--gw-danger-bg, #450a0a)',
            borderBottom: '1px solid var(--gw-danger-solid, #dc2626)',
            color: 'var(--gw-danger, #fca5a5)',
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <span style={{ flex: 1 }}>
            {STR.SWITCH_FAILED(switchError.branch, switchError.message)}
          </span>
          <button
            data-testid="header-switch-error-open-status"
            onClick={() => {
              clearSwitchError()
              navigate('status')
            }}
            style={{
              background: 'none',
              border: '1px solid var(--gw-danger-solid, #dc2626)',
              borderRadius: 4,
              color: 'inherit',
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {STR.SWITCH_ERROR_OPEN_STATUS}
          </button>
          <button
            data-testid="header-switch-error-bring-changes"
            onClick={() => void doSwitchBringChanges(switchError.branch)}
            style={{
              background: 'var(--gw-danger-solid, #dc2626)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--gw-on-solid, #fff)',
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {STR.SWITCH_ERROR_BRING_CHANGES}
          </button>
        </div>
      )}
    </>
  )
}
