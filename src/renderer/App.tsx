import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import GlobalHeader from './components/GlobalHeader'
import Sidebar from './components/Sidebar'
import RightPanel from './components/RightPanel'
import OnboardingTour from './components/OnboardingTour'
import StartupLoader from './components/StartupLoader'
import TooltipLayer from './components/TooltipLayer'
import { useAppStore } from './store/appStore'
import { useProfilesStore } from './store/profilesStore'
import { useRepositoriesStore } from './store/repositoriesStore'
import { useSettingsStore } from './store/settingsStore'
import { useOnboardingStore } from './store/onboardingStore'
import { useUpdatesStore } from './store/updatesStore'
import { refreshActiveRepo } from './store/refreshActiveRepo'
import type { NavScreen } from './store/appStore'
import { pickAutoSelectedRepo } from '../core/repos/autoSelectRepo'

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

// Cmd/Ctrl+1–9 targets, kept in the sidebar's visual order (Profiles before
// Repositories — repos are assigned to profiles, so profiles come first).
const NAV_ORDER: NavScreen[] = [
  'profiles',
  'repositories',
  'status',
  'commit',
  'remote',
  'branches',
  'history',
  'safety-center',
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
const SIDEBAR_COLLAPSED_WIDTH = 52
const SIDEBAR_TRANSITION_MS = 200
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'gitwarden.layout.sidebarCollapsed.v1'
const STARTUP_LOADER_MIN_MS = 900
const STARTUP_LOADER_EXIT_MS = 220
/** Ignore extra focus/visibility events within this window of the last trigger —
 * mirrors ConnectGitHubModal's return-focus poke debounce (Phase 95, W4-cheap). */
const FOCUS_REFRESH_DEBOUNCE_MS = 2000

const COLLAPSE_TOGGLE_STYLE: React.CSSProperties = {
  width: 32,
  height: 28,
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

function readIsMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false

  return /mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent)
}

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

function readSavedSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false')
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
  const sidebarAnimationTimerRef = useRef<number | undefined>(undefined)
  const loaderStartedAt = useRef(Date.now())
  const load = useProfilesStore((s) => s.load)
  const loadRepos = useRepositoriesStore((s) => s.load)
  const repos = useRepositoriesStore((s) => s.repos)
  const reposError = useRepositoriesStore((s) => s.error)
  const loadSettings = useSettingsStore((s) => s.load)
  const checkForUpdates = useUpdatesStore((s) => s.check)
  const checkForUpdatesIfStale = useUpdatesStore((s) => s.checkIfStale)
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSavedSidebarCollapsed)
  const [sidebarAnimating, setSidebarAnimating] = useState(false)
  const [isMacTitlebar] = useState(readIsMacPlatform)

  const measureShellWidth = useCallback((): number => {
    return shellRef.current?.getBoundingClientRect().width ?? getViewportWidth()
  }, [])

  useEffect(() => {
    Promise.all([load(), loadRepos(), loadSettings()])
      .then(() => {
        // First-run landing: with no profiles yet, Repositories is locked, so start
        // the session on Profiles — the screen the user must visit first anyway.
        if (useProfilesStore.getState().profiles.length === 0) navigate('profiles')
        setStoresReady(true)
      })
      .catch((err: unknown) => console.error('[App] store init failed:', err))
  }, [load, loadRepos, loadSettings, navigate])

  // Background update check on launch — kept off the storesReady path so a slow network never
  // delays the shell. Skipped under Playwright (navigator.webdriver) so the e2e suite makes no
  // real GitHub call; the update spec drives the check explicitly through the fake service.
  useEffect(() => {
    if (!navigator.webdriver) void checkForUpdates()
  }, [checkForUpdates])

  // Cheapest layer of external-change detection (Phase 95, W4-cheap): a terminal
  // `git switch`/`commit`/`branch` while GitWarden sits in the background is
  // otherwise invisible until the user switches repos or tabs. Re-read the active
  // repo's data whenever the window regains focus or the tab becomes visible again
  // — mirrors ConnectGitHubModal's return-focus poke (same debounce pattern), so a
  // burst of focus/visibility events (alt-tabbing) triggers at most one refresh.
  // refreshActiveRepo() makes no network call, so it runs unthrottled by
  // navigator.webdriver — the e2e smoke test needs it to fire under Playwright too.
  // The update re-check DOES call GitHub in production, so it keeps the same
  // webdriver guard as the launch check, plus its own independent 24h throttle (W28).
  useEffect(() => {
    let debounced = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    function triggerFocusRevalidate(): void {
      if (debounced) return
      debounced = true
      debounceTimer = setTimeout(() => {
        debounced = false
      }, FOCUS_REFRESH_DEBOUNCE_MS)

      void refreshActiveRepo()
      if (!navigator.webdriver) void checkForUpdatesIfStale(Date.now())
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible') triggerFocusRevalidate()
    }

    window.addEventListener('focus', triggerFocusRevalidate)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', triggerFocusRevalidate)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [checkForUpdatesIfStale])

  // `.git` watcher (Phase 96, W4 full): watches ONLY the active repo, so the main
  // process watch must follow every repo switch exactly — start a new watch (which
  // itself always closes any previous one first) whenever the active repo changes,
  // and explicitly unwatch when there is no active repo (nothing to start a new
  // watch, so nothing else would close it) or the app unmounts.
  useEffect(() => {
    if (activeRepo) void window.api.repo.watch(activeRepo.localPath)
    return () => {
      void window.api.repo.unwatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on localPath, not the whole activeRepo object (matches GlobalHeader's loadBranches effect, W30)
  }, [activeRepo?.localPath])

  // Subscribed once, independent of which repo is active — main only ever pushes
  // events for whatever repo the watch effect above most recently asked it to
  // watch, so there is no repo-identity check to make here. `head`/`refs` (HEAD or
  // any ref moved) and `config` (an external identity/remote edit — Phase 101) all
  // get the full refresh (branch list + header guard + active screen) — a `config`
  // change needs the header guard's identity re-check just as much as a branch
  // move does, and there is no narrower path worth the added complexity (the
  // request guard makes a redundant refresh harmless). `index` (stage/unstage)
  // only needs Status/Commit, which the 'index' scope already narrows to.
  // Self-triggered churn (an in-app switch/commit also firing the watcher) is
  // tolerated: Phase 89's request guard makes a redundant refresh harmless, and it
  // always lands on fresh data regardless.
  useEffect(() => {
    return window.api.repo.onChanged((event) => {
      void refreshActiveRepo(event.kind === 'index' ? 'index' : 'full')
    })
  }, [])

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

  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => () => window.clearTimeout(sidebarAnimationTimerRef.current), [])

  const toggleSidebar = useCallback(() => {
    // Set the animation flag in the click event so StrictMode commits it with the width change.
    setSidebarAnimating(true)
    window.clearTimeout(sidebarAnimationTimerRef.current)
    sidebarAnimationTimerRef.current = window.setTimeout(
      () => setSidebarAnimating(false),
      SIDEBAR_TRANSITION_MS
    )
    setSidebarCollapsed((current) => !current)
  }, [])

  // Auto-select active repo: pick first available when none is active or active was
  // removed. Gated on storesReady so this never fires before profiles have loaded — an
  // early setActiveRepo would call syncProfileToRepo while profiles is still empty,
  // and nothing retries the sync afterward (W18). A failed repositories.list() must
  // not look like "zero repos" either — reposError blocks the clear-to-null branch
  // (#11, W32).
  useEffect(() => {
    if (!storesReady || reposError) return
    const next = pickAutoSelectedRepo(repos, activeRepo?.id ?? null)
    if (next !== undefined) setActiveRepo(next)
  }, [repos, activeRepo, setActiveRepo, reposError, storesReady])

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
        const target = NAV_ORDER[idx]
        // Repositories is locked until a profile exists — the shortcut stays inert
        // just like its disabled sidebar item.
        if (target === 'repositories' && useProfilesStore.getState().profiles.length === 0) return
        navigate(target)
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
  const effectiveLeftWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : panelWidths.left
  const rightPanelMax = getRightPanelMax(shellWidth, effectiveLeftWidth)
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
      <div
        className={`gw-window-titlebar${isMacTitlebar ? ' gw-window-titlebar--mac' : ''}`}
        data-testid="window-titlebar"
      >
        <div className="gw-window-titlebar-leading">
          <button
            className="gw-sidebar-collapse-toggle gw-titlebar-sidebar-toggle"
            data-testid="sidebar-collapse-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? STR.SIDEBAR_EXPAND : STR.SIDEBAR_COLLAPSE}
            data-tooltip={sidebarCollapsed ? STR.SIDEBAR_EXPAND : STR.SIDEBAR_COLLAPSE}
            data-tooltip-pos="bottom"
            style={COLLAPSE_TOGGLE_STYLE}
          >
            <span aria-hidden="true" style={COLLAPSE_ICON_STYLE}>
              <CollapseToggleIcon />
            </span>
          </button>
        </div>
      </div>

      <GlobalHeader />

      <div ref={shellRef} style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        <Sidebar
          width={effectiveLeftWidth}
          collapsed={sidebarCollapsed}
          animating={sidebarAnimating}
        />

        {!sidebarCollapsed && (
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
        )}

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

      <TooltipLayer />
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
