import React, { Suspense, useCallback, useEffect, useState } from 'react'
import GlobalHeader from './components/GlobalHeader'
import Sidebar from './components/Sidebar'
import Inspector from './components/Inspector'
import OnboardingTour from './components/OnboardingTour'
import { useAppStore } from './store/appStore'
import { useProfilesStore } from './store/profilesStore'
import { useRepositoriesStore } from './store/repositoriesStore'
import { useSettingsStore } from './store/settingsStore'
import { useOnboardingStore } from './store/onboardingStore'
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
  const repos = useRepositoriesStore((s) => s.repos)
  const loadSettings = useSettingsStore((s) => s.load)
  const appearance = useSettingsStore((s) => s.appearance)
  const activeRepo = useAppStore((s) => s.activeRepo)
  const setActiveRepo = useAppStore((s) => s.setActiveRepo)
  const onboardingCompletedAt = useSettingsStore((s) => s.onboardingCompletedAt)
  const onboardingSkippedAt = useSettingsStore((s) => s.onboardingSkippedAt)
  const markOnboardingCompleted = useSettingsStore((s) => s.markOnboardingCompleted)
  const markOnboardingSkipped = useSettingsStore((s) => s.markOnboardingSkipped)
  const onboardingOpen = useOnboardingStore((s) => s.isOpen)
  const startOnboarding = useOnboardingStore((s) => s.start)
  const closeOnboarding = useOnboardingStore((s) => s.close)
  const navigate = useAppStore((s) => s.navigate)
  // Signal for tests: set to true once all initial store loads complete.
  const [storesReady, setStoresReady] = useState(false)
  const [autoOnboardingChecked, setAutoOnboardingChecked] = useState(false)

  useEffect(() => {
    Promise.all([load(), loadRepos(), loadSettings()])
      .then(() => setStoresReady(true))
      .catch((err: unknown) => console.error('[App] store init failed:', err))
  }, [load, loadRepos, loadSettings])

  // Auto-select active repo: pick first available when none is active or active was removed
  useEffect(() => {
    if (repos.length === 0) {
      if (activeRepo) setActiveRepo(null)
    } else if (!activeRepo || !repos.find((r) => r.id === activeRepo.id)) {
      setActiveRepo(repos[0])
    }
  }, [repos, activeRepo, setActiveRepo])

  useEffect(() => {
    if (autoOnboardingChecked || !storesReady || navigator.webdriver) return
    setAutoOnboardingChecked(true)
    if (!onboardingCompletedAt && !onboardingSkippedAt) startOnboarding()
  }, [
    autoOnboardingChecked,
    onboardingCompletedAt,
    onboardingSkippedAt,
    startOnboarding,
    storesReady,
  ])

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
      if (onboardingOpen) return
      if (!e.metaKey && !e.ctrlKey) return
      const idx = parseInt(e.key, 10) - 1
      if (idx >= 0 && idx < NAV_ORDER.length) {
        e.preventDefault()
        navigate(NAV_ORDER[idx])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, onboardingOpen])

  const handleOnboardingComplete = useCallback(() => {
    closeOnboarding()
    void markOnboardingCompleted()
  }, [closeOnboarding, markOnboardingCompleted])

  const handleOnboardingSkip = useCallback(() => {
    closeOnboarding()
    void markOnboardingSkipped()
  }, [closeOnboarding, markOnboardingSkipped])

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

      <OnboardingTour
        open={onboardingOpen}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    </div>
  )
}
