import React, { Suspense, useEffect, useState } from 'react'
import GlobalHeader from './components/GlobalHeader'
import Sidebar from './components/Sidebar'
import Inspector from './components/Inspector'
import { useAppStore } from './store/appStore'
import { useProfilesStore } from './store/profilesStore'
import { useRepositoriesStore } from './store/repositoriesStore'
import { useSettingsStore } from './store/settingsStore'
import type { NavScreen } from './store/appStore'

import RepositoriesScreen from './screens/RepositoriesScreen'
import ProfilesScreen from './screens/ProfilesScreen'
import StatusScreen from './screens/StatusScreen'
import CommitScreen from './screens/CommitScreen'
import RemoteScreen from './screens/RemoteScreen'
import BranchesScreen from './screens/BranchesScreen'
import HistoryScreen from './screens/HistoryScreen'
import SafetyCenterScreen from './screens/SafetyCenterScreen'
import SettingsScreen from './screens/SettingsScreen'

const NAV_ORDER: NavScreen[] = [
  'repositories',
  'status',
  'commit',
  'remote',
  'branches',
  'history',
  'safety-center',
  'profiles',
  'settings',
]

function applyTheme(appearance: string): void {
  const root = document.documentElement
  if (appearance === 'light') {
    root.setAttribute('data-theme', 'light')
  } else if (appearance === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else {
    // system — follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  }
}

function MainContent(): React.ReactElement {
  const screen = useAppStore((s) => s.activeScreen)

  switch (screen) {
    case 'repositories':
      return <RepositoriesScreen />
    case 'profiles':
      return <ProfilesScreen />
    case 'status':
      return <StatusScreen />
    case 'commit':
      return <CommitScreen />
    case 'remote':
      return <RemoteScreen />
    case 'branches':
      return <BranchesScreen />
    case 'history':
      return <HistoryScreen />
    case 'safety-center':
      return <SafetyCenterScreen />
    case 'settings':
      return <SettingsScreen />
    default:
      return <RepositoriesScreen />
  }
}

export default function App(): React.ReactElement {
  const load = useProfilesStore((s) => s.load)
  const loadRepos = useRepositoriesStore((s) => s.load)
  const loadSettings = useSettingsStore((s) => s.load)
  const appearance = useSettingsStore((s) => s.appearance)
  const navigate = useAppStore((s) => s.navigate)
  // Signal for tests: set to true once all initial store loads complete.
  const [storesReady, setStoresReady] = useState(false)

  useEffect(() => {
    void Promise.all([load(), loadRepos(), loadSettings()]).then(() => setStoresReady(true))
  }, [load, loadRepos, loadSettings])

  // Apply theme whenever appearance setting changes
  useEffect(() => {
    applyTheme(appearance)
    // Re-apply if OS preference changes (relevant in 'system' mode)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => {
      if (appearance === 'system') applyTheme('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [appearance])

  // Keyboard navigation: Cmd/Ctrl + 1-9 to jump to screens
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.metaKey && !e.ctrlKey) return
      const idx = parseInt(e.key, 10) - 1
      if (idx >= 0 && idx < NAV_ORDER.length) {
        e.preventDefault()
        navigate(NAV_ORDER[idx])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  return (
    <div
      data-testid="app-root"
      data-ready={storesReady ? 'true' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--gw-bg, #09090b)',
        color: 'var(--gw-text, #f4f4f5)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      <GlobalHeader />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />

        <main
          data-testid="main-content"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            background: 'var(--gw-bg, #09090b)',
          }}
        >
          <Suspense fallback={null}>
            <MainContent />
          </Suspense>
        </main>

        <Inspector />
      </div>
    </div>
  )
}
