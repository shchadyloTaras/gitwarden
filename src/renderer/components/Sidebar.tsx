import React from 'react'
import { NavScreen, useAppStore } from '../store/appStore'

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

export default function Sidebar({ width }: { width: number }): React.ReactElement {
  const { activeScreen, navigate } = useAppStore()

  let lastGroup: string | undefined

  return (
    <nav
      data-testid="sidebar-nav"
      style={{
        width,
        flex: `0 0 ${width}px`,
        minWidth: 0,
        background: 'var(--gw-surface, #18181b)',
        borderRight: '1px solid var(--gw-border, #27272a)',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 0',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const showGroupLabel = item.group && item.group !== lastGroup
        if (item.group) lastGroup = item.group

        return (
          <React.Fragment key={item.screen}>
            {showGroupLabel && (
              <div
                style={{
                  padding: '10px 12px 2px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--gw-text-dim, #52525b)',
                }}
              >
                {GROUP_LABELS[item.group!]}
              </div>
            )}
            <button
              data-testid={`nav-${item.screen}`}
              onClick={() => navigate(item.screen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: activeScreen === item.screen ? 'var(--gw-surface2, #27272a)' : 'none',
                border: 'none',
                borderRadius: 6,
                margin: '1px 6px',
                cursor: 'pointer',
                color:
                  activeScreen === item.screen
                    ? 'var(--gw-text, #f4f4f5)'
                    : 'var(--gw-text-muted, #a1a1aa)',
                fontSize: 13,
                textAlign: 'left',
                fontFamily: 'inherit',
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{item.icon}</span>
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </span>
            </button>
          </React.Fragment>
        )
      })}
    </nav>
  )
}
