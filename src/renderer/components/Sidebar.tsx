import React from 'react'
import { NavScreen, useAppStore } from '../store/appStore'
import { STR } from '../strings'

interface NavItem {
  screen: NavScreen
  label: string
  icon: string
  group?: 'git' | 'manage' | 'app'
}

const NAV_ITEMS: NavItem[] = [
  { screen: 'repositories', label: 'Repositories', icon: '⊟', group: 'manage' },
  { screen: 'profiles', label: 'Profiles', icon: '◎', group: 'manage' },
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
  justifyContent: 'space-between',
  gap: 8,
  padding: '7px 8px 2px 12px',
}

const SECTION_DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: 'var(--gw-border, #27272a)',
  margin: '6px 12px 5px',
}

const COLLAPSE_TOGGLE_STYLE: React.CSSProperties = {
  width: 32,
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'var(--gw-text-faint, #71717a)',
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
  flexShrink: 0,
}

const COLLAPSE_ICON_STYLE: React.CSSProperties = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/** Two-pane "toggle sidebar" glyph — the divider sits left of center so the narrow
 * left pane reads as the rail being toggled, not as a perfectly split panel. */
function CollapseToggleIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="6.5" y1="2.5" x2="6.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export default function Sidebar({
  width,
  collapsed,
  onToggleCollapse,
}: {
  width: number
  collapsed: boolean
  onToggleCollapse: () => void
}): React.ReactElement {
  const { activeScreen, navigate } = useAppStore()
  const [labelsVisible, setLabelsVisible] = React.useState(!collapsed)

  // The width transition runs only when the user toggles collapse/expand — never
  // during a resize-drag, which changes `width` without ever touching `collapsed`.
  // The flag is set in the toggle's click handler rather than derived from a prop
  // change during render: a render-time derivation (mutating a ref to spot the flip)
  // is an impure render, so React StrictMode's dev double-invoke dropped it and the
  // `gw-sidebar--animated` class never reached the committed DOM — the sidebar
  // snapped in `npm run dev`. An event handler fires once and its setState batches
  // with the parent's collapse flip into one commit, so the class and the new width
  // land together, in dev and prod alike.
  const [animating, setAnimating] = React.useState(false)
  const animationTimerRef = React.useRef<number | undefined>(undefined)

  React.useEffect(() => () => window.clearTimeout(animationTimerRef.current), [])

  const handleToggleCollapse = React.useCallback(() => {
    setAnimating(true)
    window.clearTimeout(animationTimerRef.current)
    animationTimerRef.current = window.setTimeout(() => setAnimating(false), SIDEBAR_TRANSITION_MS)
    onToggleCollapse()
  }, [onToggleCollapse])

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

  const renderCollapseToggle = (): React.ReactElement => (
    <button
      className="gw-sidebar-collapse-toggle"
      data-testid="sidebar-collapse-toggle"
      onClick={handleToggleCollapse}
      aria-label={collapsed ? STR.SIDEBAR_EXPAND : STR.SIDEBAR_COLLAPSE}
      data-tooltip={collapsed ? STR.SIDEBAR_EXPAND : STR.SIDEBAR_COLLAPSE}
      data-tooltip-pos={collapsed ? 'right' : 'top'}
      style={COLLAPSE_TOGGLE_STYLE}
    >
      <span aria-hidden="true" style={COLLAPSE_ICON_STYLE}>
        <CollapseToggleIcon />
      </span>
    </button>
  )

  const renderGroupBoundary = (
    group: NavItem['group'],
    previousGroup?: string
  ): React.ReactNode => {
    if (!group) return null

    if (!showExpandedLabels) {
      if (group === 'manage') {
        return (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '2px 0 8px',
              }}
            >
              {renderCollapseToggle()}
            </div>
            <div aria-hidden="true" style={SECTION_DIVIDER_STYLE} />
          </>
        )
      }

      return previousGroup !== undefined ? (
        <div aria-hidden="true" style={SECTION_DIVIDER_STYLE} />
      ) : null
    }

    if (group === 'manage') {
      return (
        <>
          <div style={GROUP_HEADER_ROW_STYLE}>
            <span style={GROUP_LABEL_STYLE}>{GROUP_LABELS[group]}</span>
            {renderCollapseToggle()}
          </div>
          <div aria-hidden="true" style={SECTION_DIVIDER_STYLE} />
        </>
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

          return (
            <React.Fragment key={item.screen}>
              {showBoundary && renderGroupBoundary(item.group, prevGroup)}
              <button
                data-testid={`nav-${item.screen}`}
                onClick={() => navigate(item.screen)}
                aria-label={collapsed ? item.label : undefined}
                data-tooltip={collapsed ? item.label : undefined}
                data-tooltip-pos="right"
                style={{
                  ...NAV_BTN_BASE,
                  gap: showExpandedLabels ? 8 : 0,
                  justifyContent: showExpandedLabels ? 'flex-start' : 'center',
                  padding: showExpandedLabels ? '7px 12px' : '8px 0',
                  background: active ? 'var(--gw-surface2, #27272a)' : 'none',
                  color: active ? 'var(--gw-text, #f4f4f5)' : 'var(--gw-text-muted, #a1a1aa)',
                }}
              >
                <span style={ICON_STYLE}>{item.icon}</span>
                {showExpandedLabels && (
                  <span
                    style={{
                      minWidth: 0,
                      opacity: collapsed ? 0 : 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transform: collapsed ? 'translateX(-4px)' : 'translateX(0)',
                      transition: 'opacity 0.14s ease, transform 0.14s cubic-bezier(0.2, 0, 0, 1)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.label}
                  </span>
                )}
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </nav>
  )
}
