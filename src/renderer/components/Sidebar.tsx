import React from 'react'
import { NavScreen, useAppStore } from '../store/appStore'
import { useProfilesStore } from '../store/profilesStore'
import { useUpdatesStore } from '../store/updatesStore'
import { STR } from '../strings'

interface NavItem {
  screen: NavScreen
  label: string
  icon: string
  group?: 'git' | 'manage' | 'app'
}

// Profiles precede Repositories: a repo can only be assigned to an existing profile,
// so the sidebar mirrors the setup order (and Repositories stays locked until then).
const NAV_ITEMS: NavItem[] = [
  { screen: 'profiles', label: 'Profiles', icon: '◎', group: 'manage' },
  { screen: 'repositories', label: 'Repositories', icon: '⊟', group: 'manage' },
  { screen: 'status', label: 'Status', icon: '≡', group: 'git' },
  { screen: 'commit', label: 'Commit', icon: '✓', group: 'git' },
  { screen: 'remote', label: 'Remote', icon: '↑', group: 'git' },
  { screen: 'branches', label: 'Branches', icon: '⎇', group: 'git' },
  { screen: 'history', label: 'History', icon: '◷', group: 'git' },
  { screen: 'safety-center', label: 'Safety Center', icon: '⊛', group: 'git' },
  { screen: 'settings', label: 'Settings', icon: '⚙', group: 'app' },
]

const GROUP_LABELS: Record<string, string> = {
  manage: 'MANAGE',
  git: 'GIT',
  app: 'APP',
}

const SIDEBAR_TRANSITION_MS = 200

const NAV_BTN_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  borderRadius: 6,
  margin: '1px 6px',
  cursor: 'pointer',
  fontSize: 14,
  textAlign: 'left',
  fontFamily: 'inherit',
  minWidth: 0,
}

const NAV_LABEL_LINE_STYLE: React.CSSProperties = {
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const ICON_STYLE: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  lineHeight: 1,
  flexShrink: 0,
}

const GROUP_LABEL_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: 'var(--gw-text-dim, #52525b)',
}

const GROUP_HEADER_ROW_STYLE: React.CSSProperties = {
  minHeight: 28,
  display: 'flex',
  alignItems: 'center',
  padding: '7px 12px 8px',
}

const SECTION_DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: 'var(--gw-border, #27272a)',
  margin: '6px 12px 5px',
}

const SIDEBAR_FOOTER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  borderTop: '1px solid var(--gw-border, #27272a)',
  padding: '8px',
}

const UPDATE_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  height: 32,
  border: 'none',
  borderRadius: 6,
  background: 'var(--gw-accent, #6366f1)',
  color: 'var(--gw-on-solid, #fff)',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

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
        <div aria-hidden="true" style={SECTION_DIVIDER_STYLE} />
      ) : null
    }

    if (group === 'manage') {
      return (
        <div style={GROUP_HEADER_ROW_STYLE}>
          <span style={GROUP_LABEL_STYLE}>{GROUP_LABELS[group]}</span>
        </div>
      )
    }

    return (
      <div style={{ ...GROUP_LABEL_STYLE, padding: '10px 12px 2px' }}>{GROUP_LABELS[group]}</div>
    )
  }

  return (
    <nav
      className={`gw-sidebar${animating ? ' gw-sidebar--animated' : ''}`}
      data-testid="sidebar-nav"
      data-collapsed={collapsed ? 'true' : undefined}
      style={{
        width,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: width,
        minWidth: 0,
        background: 'var(--gw-surface, #18181b)',
        borderRight: '1px solid var(--gw-border, #27272a)',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 0',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
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
                onClick={() => navigate(item.screen)}
                disabled={locked}
                aria-label={collapsed ? collapsedTooltip : undefined}
                data-tooltip={collapsed ? collapsedTooltip : undefined}
                data-tooltip-pos="right"
                style={{
                  ...NAV_BTN_BASE,
                  gap: showExpandedLabels ? 8 : 0,
                  justifyContent: showExpandedLabels ? 'flex-start' : 'center',
                  padding: showExpandedLabels ? '7px 12px' : '8px 0',
                  // Soften the global button:disabled 0.4 so the locked hint stays legible;
                  // the dim color below already reads as inactive.
                  opacity: locked ? 0.85 : 1,
                  background: active ? 'var(--gw-surface2, #27272a)' : 'none',
                  color: locked
                    ? 'var(--gw-text-dim, #52525b)'
                    : active
                      ? 'var(--gw-text, #f4f4f5)'
                      : 'var(--gw-text-muted, #a1a1aa)',
                }}
              >
                <span style={ICON_STYLE}>{item.icon}</span>
                {showExpandedLabels && (
                  <span
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      opacity: collapsed ? 0 : 1,
                      transform: collapsed ? 'translateX(-4px)' : 'translateX(0)',
                      transition: 'opacity 0.14s ease, transform 0.14s cubic-bezier(0.2, 0, 0, 1)',
                    }}
                  >
                    <span style={NAV_LABEL_LINE_STYLE}>{item.label}</span>
                    {locked && (
                      <span
                        data-testid={`nav-${item.screen}-locked-hint`}
                        style={{
                          ...NAV_LABEL_LINE_STYLE,
                          fontSize: 11,
                          marginTop: 1,
                          color: 'var(--gw-text-dim, #52525b)',
                        }}
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
        <div style={SIDEBAR_FOOTER_STYLE}>
          <button
            data-testid="sidebar-update-button"
            onClick={() => void window.api.shell.openExternal(availableUpdate.url)}
            aria-label={STR.UPDATE_BUTTON_ARIA(availableUpdate.version)}
            data-tooltip={STR.UPDATE_AVAILABLE(availableUpdate.version)}
            data-tooltip-pos="right"
            style={{
              ...UPDATE_BUTTON_STYLE,
              justifyContent: showExpandedLabels ? 'flex-start' : 'center',
              padding: showExpandedLabels ? '0 12px' : '0',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>
              ↓
            </span>
            {showExpandedLabels && (
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {STR.UPDATE_BUTTON_LABEL}
              </span>
            )}
          </button>
        </div>
      )}
    </nav>
  )
}
