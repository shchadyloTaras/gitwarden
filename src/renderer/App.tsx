import React, { Suspense, useEffect } from 'react'
import GlobalHeader from './components/GlobalHeader'
import Sidebar from './components/Sidebar'
import Inspector from './components/Inspector'
import { useAppStore } from './store/appStore'
import { useProfilesStore } from './store/profilesStore'

import RepositoriesScreen from './screens/RepositoriesScreen'
import ProfilesScreen from './screens/ProfilesScreen'
import StatusScreen from './screens/StatusScreen'
import CommitScreen from './screens/CommitScreen'
import RemoteScreen from './screens/RemoteScreen'
import BranchesScreen from './screens/BranchesScreen'
import HistoryScreen from './screens/HistoryScreen'
import SafetyCenterScreen from './screens/SafetyCenterScreen'
import SettingsScreen from './screens/SettingsScreen'

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

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#09090b',
        color: '#f4f4f5',
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
          style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#09090b' }}
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
