import React from 'react'
import { useAppStore, type NavScreen } from '../store/appStore'
import { useProfilesStore } from '../store/profilesStore'
import { useUpdatesStore } from '../store/updatesStore'
import { STR } from '../strings'
import SidebarIcon, { type SidebarIconName } from './SidebarIcon'

interface NavItem {
  screen: NavScreen
  label: string
  icon: SidebarIconName
  group?: 'git' | 'manage' | 'app'
}

// Profiles precede Repositories: a repo can only be assigned to an existing profile,
// so the sidebar mirrors the setup order (and Repositories stays locked until then).
const NAV_ITEMS: NavItem[] = [
  { screen: 'profiles', label: STR.NAV_PROFILES, icon: 'profiles', group: 'manage' },
  {
    screen: 'repositories',
    label: STR.NAV_REPOSITORIES,
    icon: 'repositories',
    group: 'manage',
  },
  { screen: 'status', label: STR.NAV_STATUS, icon: 'status', group: 'git' },
  { screen: 'commit', label: STR.NAV_COMMIT_PUSH, icon: 'commit', group: 'git' },
  { screen: 'branches', label: STR.NAV_BRANCHES, icon: 'branches', group: 'git' },
  { screen: 'history', label: STR.NAV_HISTORY, icon: 'history', group: 'git' },
  {
    screen: 'safety-center',
    label: STR.NAV_SAFETY_CENTER,
    icon: 'safety-center',
    group: 'git',
  },
  { screen: 'settings', label: STR.NAV_SETTINGS, icon: 'settings', group: 'app' },
]

const GROUP_LABELS: Record<string, string> = {
  manage: 'MANAGE',
  git: 'GIT',
  app: 'APP',
}

const SIDEBAR_TRANSITION_MS = 200

export default function Sidebar({
  width,
  collapsed,
  animating,
}: {
  width: number
  collapsed: boolean
  animating: boolean
}): React.ReactElement {
  const { activeScreen, navigate } = useAppStore()
  const hasProfiles = useProfilesStore((s) => s.profiles.length > 0)
  const [labelsVisible, setLabelsVisible] = React.useState(!collapsed)
  const updateResult = useUpdatesStore((s) => s.result)
  const availableUpdate = updateResult?.status === 'update-available' ? updateResult.release : null

  let lastGroup: string | undefined
  const showExpandedLabels = !collapsed || labelsVisible

  React.useEffect(() => {
    if (!collapsed) {
      setLabelsVisible(true)
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setLabelsVisible(false)
      return
    }

    const timer = window.setTimeout(() => setLabelsVisible(false), SIDEBAR_TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [collapsed])

  const renderGroupBoundary = (
    group: NavItem['group'],
    previousGroup?: string
  ): React.ReactNode => {
    if (!group) return null

    if (!showExpandedLabels) {
      return previousGroup !== undefined ? (
        <div aria-hidden="true" className="gw-sidebar__divider" />
      ) : null
    }

    if (group === 'manage') {
      return (
        <div className="gw-sidebar__group-row">
          <span className="gw-sidebar__group-label">{GROUP_LABELS[group]}</span>
        </div>
      )
    }

    return <div className="gw-sidebar__group-label">{GROUP_LABELS[group]}</div>
  }

  return (
    <nav
      className={`gw-sidebar${animating ? ' gw-sidebar--animated' : ''}`}
      data-testid="sidebar-nav"
      data-collapsed={collapsed ? 'true' : undefined}
      aria-label={STR.ONBOARDING_STEP_NAV_TITLE}
      style={{
        width,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: width,
      }}
    >
      <div className="gw-sidebar__scroll">
        {NAV_ITEMS.map((item) => {
          const prevGroup = lastGroup
          const showBoundary = Boolean(item.group && item.group !== lastGroup)
          if (item.group) lastGroup = item.group
          const active = activeScreen === item.screen
          // Repositories stays inert until the first profile exists — every repo needs
          // a profile to be assigned to, so the sidebar walks the user to Profiles first.
          const locked = item.screen === 'repositories' && !hasProfiles
          const collapsedTooltip = locked
            ? `${item.label} — ${STR.NAV_REPOSITORIES_LOCKED_HINT}`
            : item.label

          return (
            <React.Fragment key={item.screen}>
              {showBoundary && renderGroupBoundary(item.group, prevGroup)}
              <button
                data-testid={`nav-${item.screen}`}
                className="gw-sidebar__nav-item"
                onClick={() => navigate(item.screen)}
                disabled={locked}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? collapsedTooltip : undefined}
                data-tooltip={collapsed ? collapsedTooltip : undefined}
                data-tooltip-pos="right"
                style={{
                  gap: showExpandedLabels ? 8 : 0,
                  justifyContent: showExpandedLabels ? 'flex-start' : 'center',
                  padding: showExpandedLabels ? '7px 12px' : '8px 0',
                  // Soften the global button:disabled 0.4 so the locked hint stays legible;
                  // the dim color below already reads as inactive.
                  opacity: locked ? 0.85 : 1,
                }}
              >
                <span className="gw-sidebar__nav-icon">
                  <SidebarIcon name={item.icon} />
                </span>
                {showExpandedLabels && (
                  <span
                    className="gw-sidebar__nav-copy"
                    style={{
                      opacity: collapsed ? 0 : 1,
                      transform: collapsed ? 'translateX(-4px)' : 'translateX(0)',
                    }}
                  >
                    <span className="gw-sidebar__label-line">{item.label}</span>
                    {locked && (
                      <span
                        data-testid={`nav-${item.screen}-locked-hint`}
                        className="gw-sidebar__locked-hint"
                      >
                        {STR.NAV_REPOSITORIES_LOCKED_HINT}
                      </span>
                    )}
                  </span>
                )}
              </button>
            </React.Fragment>
          )
        })}
      </div>
      {availableUpdate && (
        <div className="gw-sidebar__footer">
          <button
            data-testid="sidebar-update-button"
            className={`gw-sidebar__update-button${
              showExpandedLabels ? ' gw-sidebar__update-button--expanded' : ''
            }`}
            onClick={() => void window.api.shell.openExternal(availableUpdate.url)}
            aria-label={STR.UPDATE_BUTTON_ARIA(availableUpdate.version)}
            data-tooltip={STR.UPDATE_AVAILABLE(availableUpdate.version)}
            data-tooltip-pos="right"
          >
            <span className="gw-sidebar__update-icon">
              <SidebarIcon name="update" size={16} />
            </span>
            {showExpandedLabels && (
              <span className="gw-sidebar__label-line">{STR.UPDATE_BUTTON_LABEL}</span>
            )}
          </button>
        </div>
      )}
    </nav>
  )
}
