import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import GlobalHeader from './components/GlobalHeader'
import Sidebar from './components/Sidebar'
import RightPanel from './components/RightPanel'
import OnboardingTour from './components/OnboardingTour'
import StartupLoader from './components/StartupLoader'
import { useAppStore } from './store/appStore'
import { useProfilesStore } from './store/profilesStore'
import { useRepositoriesStore } from './store/repositoriesStore'
import { useSettingsStore } from './store/settingsStore'
import { useOnboardingStore } from './store/onboardingStore'
import { useUpdatesStore } from './store/updatesStore'
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
import { STR } from './strings'

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

type PanelSide = 'left' | 'right'

interface PanelWidths {
  left: number
  right: number
}

const PANEL_WIDTH_STORAGE_KEY = 'gitwarden.layout.panelWidths.v1'
const PANEL_RESIZE_HANDLE_WIDTH = 8
const MIN_MAIN_CONTENT_WIDTH = 360
const PANEL_RESIZE_STEP = 16
const DEFAULT_PANEL_WIDTHS: PanelWidths = { left: 180, right: 300 }
const LEFT_PANEL_MIN_WIDTH = 160
const LEFT_PANEL_MAX_WIDTH = 320
const RIGHT_PANEL_MIN_WIDTH = 260
const RIGHT_PANEL_MAX_WIDTH = 520
const STARTUP_LOADER_MIN_MS = 900
const STARTUP_LOADER_EXIT_MS = 220

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

function getViewportWidth(): number {
  return typeof window === 'undefined' ? 1200 : window.innerWidth
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function handleSpace(rightPanelOpen: boolean): number {
  return (rightPanelOpen ? 2 : 1) * PANEL_RESIZE_HANDLE_WIDTH
}

function getLeftPanelMax(shellWidth: number, rightWidth: number, rightPanelOpen: boolean): number {
  const reservedRightWidth = rightPanelOpen ? rightWidth : 0
  const available =
    shellWidth - reservedRightWidth - handleSpace(rightPanelOpen) - MIN_MAIN_CONTENT_WIDTH
  return Math.floor(Math.min(LEFT_PANEL_MAX_WIDTH, Math.max(LEFT_PANEL_MIN_WIDTH, available)))
}

function getRightPanelMax(shellWidth: number, leftWidth: number): number {
  const available = shellWidth - leftWidth - handleSpace(true) - MIN_MAIN_CONTENT_WIDTH
  return Math.floor(Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, available)))
}

function samePanelWidths(a: PanelWidths, b: PanelWidths): boolean {
  return a.left === b.left && a.right === b.right
}

function clampPanelWidths(
  widths: PanelWidths,
  shellWidth: number,
  rightPanelOpen: boolean
): PanelWidths {
  let left = clampNumber(widths.left, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH)
  let right = clampNumber(widths.right, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH)

  if (rightPanelOpen) {
    const availablePanelSpace = shellWidth - handleSpace(true) - MIN_MAIN_CONTENT_WIDTH
    const minimumPanelSpace = LEFT_PANEL_MIN_WIDTH + RIGHT_PANEL_MIN_WIDTH
    if (availablePanelSpace >= minimumPanelSpace && left + right > availablePanelSpace) {
      let excess = left + right - availablePanelSpace
      const rightReduction = Math.min(right - RIGHT_PANEL_MIN_WIDTH, excess)
      right -= rightReduction
      excess -= rightReduction
      if (excess > 0) {
        left -= Math.min(left - LEFT_PANEL_MIN_WIDTH, excess)
      }
    }
  } else {
    left = clampNumber(left, LEFT_PANEL_MIN_WIDTH, getLeftPanelMax(shellWidth, right, false))
  }

  return { left: Math.round(left), right: Math.round(right) }
}

function readSavedPanelWidths(): PanelWidths {
  if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTHS

  try {
    const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
    if (!raw) return DEFAULT_PANEL_WIDTHS

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PANEL_WIDTHS

    const candidate = parsed as Record<string, unknown>
    return {
      left:
        typeof candidate.left === 'number' && Number.isFinite(candidate.left)
          ? candidate.left
          : DEFAULT_PANEL_WIDTHS.left,
      right:
        typeof candidate.right === 'number' && Number.isFinite(candidate.right)
          ? candidate.right
          : DEFAULT_PANEL_WIDTHS.right,
    }
  } catch {
    return DEFAULT_PANEL_WIDTHS
  }
}

function savePanelWidths(widths: PanelWidths): void {
  try {
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // Layout preference persistence is best-effort.
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
  const shellRef = useRef<HTMLDivElement | null>(null)
  const loaderStartedAt = useRef(Date.now())
  const load = useProfilesStore((s) => s.load)
  const loadRepos = useRepositoriesStore((s) => s.load)
  const repos = useRepositoriesStore((s) => s.repos)
  const loadSettings = useSettingsStore((s) => s.load)
  const checkForUpdates = useUpdatesStore((s) => s.check)
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
  const openRightPanel = useAppStore((s) => s.openRightPanel)
  const requestChatFocus = useAppStore((s) => s.requestChatFocus)
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  // Signal for tests: set to true once all initial store loads complete.
  const [storesReady, setStoresReady] = useState(false)
  const [startupLoaderVisible, setStartupLoaderVisible] = useState(true)
  const [startupLoaderExiting, setStartupLoaderExiting] = useState(false)
  const [autoOnboardingChecked, setAutoOnboardingChecked] = useState(false)
  const [shellWidth, setShellWidth] = useState(getViewportWidth)
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null)
  const [panelWidths, setPanelWidths] = useState<PanelWidths>(() =>
    clampPanelWidths(readSavedPanelWidths(), getViewportWidth(), inspectorOpen)
  )

  const measureShellWidth = useCallback((): number => {
    return shellRef.current?.getBoundingClientRect().width ?? getViewportWidth()
  }, [])

  useEffect(() => {
    Promise.all([load(), loadRepos(), loadSettings()])
      .then(() => setStoresReady(true))
      .catch((err: unknown) => console.error('[App] store init failed:', err))
  }, [load, loadRepos, loadSettings])

  // Background update check on launch — kept off the storesReady path so a slow network never
  // delays the shell. Skipped under Playwright (navigator.webdriver) so the e2e suite makes no
  // real GitHub call; the update spec drives the check explicitly through the fake service.
  useEffect(() => {
    if (!navigator.webdriver) void checkForUpdates()
  }, [checkForUpdates])

  useEffect(() => {
    if (!storesReady || !startupLoaderVisible) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const skipAnimationDelay = prefersReducedMotion || navigator.webdriver
    const minVisibleMs = skipAnimationDelay ? 0 : STARTUP_LOADER_MIN_MS
    const exitMs = skipAnimationDelay ? 0 : STARTUP_LOADER_EXIT_MS
    const elapsedMs = Date.now() - loaderStartedAt.current
    const exitDelayMs = Math.max(0, minVisibleMs - elapsedMs)
    let hideTimer: number | undefined

    const exitTimer = window.setTimeout(() => {
      setStartupLoaderExiting(true)
      hideTimer = window.setTimeout(() => setStartupLoaderVisible(false), exitMs)
    }, exitDelayMs)

    return () => {
      window.clearTimeout(exitTimer)
      if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    }
  }, [startupLoaderVisible, storesReady])

  useEffect(() => {
    const updateShellWidth = (): void => {
      setShellWidth(Math.round(measureShellWidth()))
    }

    updateShellWidth()
    window.addEventListener('resize', updateShellWidth)
    return () => window.removeEventListener('resize', updateShellWidth)
  }, [measureShellWidth])

  useEffect(() => {
    setPanelWidths((current) => {
      const next = clampPanelWidths(current, shellWidth, inspectorOpen)
      return samePanelWidths(current, next) ? current : next
    })
  }, [inspectorOpen, shellWidth])

  useEffect(() => {
    savePanelWidths(panelWidths)
  }, [panelWidths])

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
      if (e.key.toLowerCase() === 'l') {
        e.preventDefault()
        openRightPanel('chat')
        requestChatFocus()
        return
      }
      const idx = parseInt(e.key, 10) - 1
      if (idx >= 0 && idx < NAV_ORDER.length) {
        e.preventDefault()
        navigate(NAV_ORDER[idx])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, openRightPanel, requestChatFocus, onboardingOpen])

  const handleOnboardingComplete = useCallback(() => {
    closeOnboarding()
    void markOnboardingCompleted()
  }, [closeOnboarding, markOnboardingCompleted])

  const handleOnboardingSkip = useCallback(() => {
    closeOnboarding()
    void markOnboardingSkipped()
  }, [closeOnboarding, markOnboardingSkipped])

  const setPanelWidth = useCallback(
    (side: PanelSide, width: number): void => {
      setPanelWidths((current) => {
        if (side === 'left') {
          const next = {
            ...current,
            left: Math.round(
              clampNumber(
                width,
                LEFT_PANEL_MIN_WIDTH,
                getLeftPanelMax(shellWidth, current.right, inspectorOpen)
              )
            ),
          }
          return samePanelWidths(current, next) ? current : next
        }

        const next = {
          ...current,
          right: Math.round(
            clampNumber(width, RIGHT_PANEL_MIN_WIDTH, getRightPanelMax(shellWidth, current.left))
          ),
        }
        return samePanelWidths(current, next) ? current : next
      })
    },
    [inspectorOpen, shellWidth]
  )

  const beginPanelResize = useCallback(
    (side: PanelSide, event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

      const startX = event.clientX
      const startWidths = panelWidths
      const startShellWidth = measureShellWidth()
      const previousBodyCursor = document.body.style.cursor
      const previousBodyUserSelect = document.body.style.userSelect
      const previousRootCursor = document.documentElement.style.cursor

      setResizingPanel(side)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.documentElement.style.cursor = 'col-resize'

      const handlePointerMove = (moveEvent: PointerEvent): void => {
        moveEvent.preventDefault()
        const deltaX = moveEvent.clientX - startX

        setPanelWidths((current) => {
          if (side === 'left') {
            const max = getLeftPanelMax(startShellWidth, startWidths.right, inspectorOpen)
            const next = {
              ...current,
              left: Math.round(clampNumber(startWidths.left + deltaX, LEFT_PANEL_MIN_WIDTH, max)),
            }
            return samePanelWidths(current, next) ? current : next
          }

          const max = getRightPanelMax(startShellWidth, startWidths.left)
          const next = {
            ...current,
            right: Math.round(clampNumber(startWidths.right - deltaX, RIGHT_PANEL_MIN_WIDTH, max)),
          }
          return samePanelWidths(current, next) ? current : next
        })
      }

      const finishResize = (): void => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', finishResize)
        window.removeEventListener('pointercancel', finishResize)
        document.body.style.cursor = previousBodyCursor
        document.body.style.userSelect = previousBodyUserSelect
        document.documentElement.style.cursor = previousRootCursor
        setResizingPanel(null)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', finishResize)
      window.addEventListener('pointercancel', finishResize)
    },
    [inspectorOpen, measureShellWidth, panelWidths]
  )

  const handleResizeKeyDown = useCallback(
    (side: PanelSide, event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setPanelWidth(
          side,
          side === 'left'
            ? panelWidths.left - PANEL_RESIZE_STEP
            : panelWidths.right + PANEL_RESIZE_STEP
        )
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setPanelWidth(
          side,
          side === 'left'
            ? panelWidths.left + PANEL_RESIZE_STEP
            : panelWidths.right - PANEL_RESIZE_STEP
        )
      } else if (event.key === 'Home') {
        event.preventDefault()
        setPanelWidth(side, side === 'left' ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH)
      } else if (event.key === 'End') {
        event.preventDefault()
        setPanelWidth(
          side,
          side === 'left'
            ? getLeftPanelMax(shellWidth, panelWidths.right, inspectorOpen)
            : getRightPanelMax(shellWidth, panelWidths.left)
        )
      }
    },
    [inspectorOpen, panelWidths, setPanelWidth, shellWidth]
  )

  const leftPanelMax = getLeftPanelMax(shellWidth, panelWidths.right, inspectorOpen)
  const rightPanelMax = getRightPanelMax(shellWidth, panelWidths.left)
  const appReady = storesReady && !startupLoaderVisible

  return (
    <div
      data-testid="app-root"
      data-ready={appReady ? 'true' : undefined}
      aria-busy={!appReady}
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

      <div ref={shellRef} style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        <Sidebar width={panelWidths.left} />

        <PanelResizeHandle
          side="left"
          label={STR.LEFT_PANEL_RESIZE_LABEL}
          testId="left-panel-resize-handle"
          value={panelWidths.left}
          min={LEFT_PANEL_MIN_WIDTH}
          max={leftPanelMax}
          active={resizingPanel === 'left'}
          onPointerDown={beginPanelResize}
          onKeyDown={handleResizeKeyDown}
        />

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

        {inspectorOpen && (
          <PanelResizeHandle
            side="right"
            label={STR.RIGHT_PANEL_RESIZE_LABEL}
            testId="right-panel-resize-handle"
            value={panelWidths.right}
            min={RIGHT_PANEL_MIN_WIDTH}
            max={rightPanelMax}
            active={resizingPanel === 'right'}
            onPointerDown={beginPanelResize}
            onKeyDown={handleResizeKeyDown}
          />
        )}

        <RightPanel width={panelWidths.right} />
      </div>

      <OnboardingTour
        open={onboardingOpen}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />

      {startupLoaderVisible && <StartupLoader exiting={startupLoaderExiting} />}
    </div>
  )
}

function PanelResizeHandle({
  side,
  label,
  testId,
  value,
  min,
  max,
  active,
  onPointerDown,
  onKeyDown,
}: {
  side: PanelSide
  label: string
  testId: string
  value: number
  min: number
  max: number
  active: boolean
  onPointerDown: (side: PanelSide, event: React.PointerEvent<HTMLDivElement>) => void
  onKeyDown: (side: PanelSide, event: React.KeyboardEvent<HTMLDivElement>) => void
}): React.ReactElement {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`gw-resize-handle gw-resize-handle--${side}${active ? ' gw-resize-handle--active' : ''}`}
      data-testid={testId}
      tabIndex={0}
      onPointerDown={(event) => onPointerDown(side, event)}
      onKeyDown={(event) => onKeyDown(side, event)}
    />
  )
}
