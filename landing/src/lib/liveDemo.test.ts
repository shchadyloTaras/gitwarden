import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy } from '../content/copy'
import {
  LIVE_DEMO_BRANCHES,
  LIVE_DEMO_INITIAL_STATE,
  LIVE_DEMO_PROFILES,
  LIVE_DEMO_SCREENS,
  deriveLiveDemoView,
  reduceLiveDemo,
  type LiveDemoState,
} from './liveDemo'

const fixed: LiveDemoState = { ...LIVE_DEMO_INITIAL_STATE, activeProfile: 'Client' }

describe('live demo state model', () => {
  it('starts blocked on the Commit & Push screen with Personal active', () => {
    expect(LIVE_DEMO_INITIAL_STATE).toEqual({
      activeProfile: 'Personal',
      screen: 'commit',
      branch: 'main',
      panelTab: 'context',
      panelOpen: true,
      completed: null,
    })
    expect(deriveLiveDemoView({ ...LIVE_DEMO_INITIAL_STATE })).toEqual({
      guard: 'blocked',
      issuesVisible: true,
      canCommit: false,
      completed: null,
      outcome: 'blocked',
    })
  })

  it('navigates between every screen without touching the scenario', () => {
    let state: LiveDemoState = { ...LIVE_DEMO_INITIAL_STATE }
    for (const screen of LIVE_DEMO_SCREENS) {
      state = reduceLiveDemo(state, { type: 'navigate', screen })
      expect(state.screen).toBe(screen)
      expect(state.activeProfile).toBe('Personal')
      expect(deriveLiveDemoView(state).guard).toBe('blocked')
    }
  })

  it.each([
    ['Personal', 'blocked', false],
    ['Work', 'blocked', false],
    ['Client', 'ready', true],
  ] as const)('setting the %s profile derives Guard %s', (profile, guard, canCommit) => {
    const state = reduceLiveDemo({ ...LIVE_DEMO_INITIAL_STATE }, { type: 'set-profile', profile })

    expect(state.activeProfile).toBe(profile)
    expect(deriveLiveDemoView(state)).toMatchObject({
      guard,
      canCommit,
      issuesVisible: guard === 'blocked',
    })
  })

  it('switches branches independently of the identity scenario', () => {
    const state = reduceLiveDemo(
      { ...LIVE_DEMO_INITIAL_STATE },
      { type: 'set-branch', branch: 'feature/access-rules' }
    )

    expect(state.branch).toBe('feature/access-rules')
    expect(deriveLiveDemoView(state).guard).toBe('blocked')
  })

  it('drives the right panel: tab selection re-opens a closed panel and ⓘ toggles it', () => {
    const closed = reduceLiveDemo({ ...LIVE_DEMO_INITIAL_STATE }, { type: 'toggle-panel' })
    expect(closed.panelOpen).toBe(false)

    const chat = reduceLiveDemo(closed, { type: 'set-panel-tab', tab: 'ai-chat' })
    expect(chat).toMatchObject({ panelTab: 'ai-chat', panelOpen: true })

    expect(reduceLiveDemo(chat, { type: 'toggle-panel' }).panelOpen).toBe(false)
  })

  it('never commits while blocked — mirrors the disabled buttons on the real screen', () => {
    const blocked = { ...LIVE_DEMO_INITIAL_STATE }

    expect(reduceLiveDemo(blocked, { type: 'commit' })).toEqual(blocked)
    expect(reduceLiveDemo(blocked, { type: 'commit-and-push' })).toEqual(blocked)
  })

  it('completes a simulated commit once fixed, and only once', () => {
    const committed = reduceLiveDemo(fixed, { type: 'commit' })

    expect(committed.completed).toBe('committed')
    expect(deriveLiveDemoView(committed)).toMatchObject({
      guard: 'ready',
      canCommit: false,
      completed: 'committed',
      outcome: 'committed',
    })
    expect(reduceLiveDemo(committed, { type: 'commit' })).toEqual(committed)
    expect(reduceLiveDemo(committed, { type: 'commit-and-push' })).toEqual(committed)
  })

  it('completes a simulated commit-and-push once fixed', () => {
    const pushed = reduceLiveDemo(fixed, { type: 'commit-and-push' })

    expect(pushed.completed).toBe('pushed')
    expect(deriveLiveDemoView(pushed)).toMatchObject({ completed: 'pushed', outcome: 'pushed' })
  })

  it('keeps a completed simulation while the visitor keeps exploring', () => {
    const committed = reduceLiveDemo(fixed, { type: 'commit' })
    const wandered = reduceLiveDemo(
      reduceLiveDemo(committed, { type: 'navigate', screen: 'history' }),
      { type: 'set-profile', profile: 'Personal' }
    )

    expect(wandered.completed).toBe('committed')
    expect(deriveLiveDemoView(wandered)).toMatchObject({
      guard: 'blocked',
      issuesVisible: true,
      canCommit: false,
      outcome: 'committed',
    })
  })

  it('resets every state to a fresh copy of the initial state', () => {
    const wandered: LiveDemoState = {
      activeProfile: 'Client',
      screen: 'history',
      branch: 'feature/access-rules',
      panelTab: 'ai-chat',
      panelOpen: false,
      completed: 'pushed',
    }
    const reset = reduceLiveDemo(wandered, { type: 'reset' })

    expect(reset).toEqual(LIVE_DEMO_INITIAL_STATE)
    expect(reset).not.toBe(LIVE_DEMO_INITIAL_STATE)
  })

  it('keeps the fixed inventories ordered for the UI', () => {
    expect(LIVE_DEMO_PROFILES).toEqual(['Personal', 'Work', 'Client'])
    expect(LIVE_DEMO_BRANCHES).toEqual(['main', 'feature/access-rules'])
    expect(LIVE_DEMO_SCREENS).toEqual([
      'profiles',
      'repositories',
      'status',
      'commit',
      'branches',
      'history',
      'safety-center',
      'settings',
    ])
  })
})

describe('live demo copy contract', () => {
  it('pins every app-derived literal exactly', () => {
    expect(copy.liveDemo.window.appName).toBe('Git Warden')
    expect(copy.liveDemo.window.navigation.commitPush).toBe('Commit & Push')
    expect(copy.liveDemo.window.stagedEmpty).toBe('No staged changes')
    expect(copy.liveDemo.window.aiButtonLabel).toBe('Open AI chat')
    expect(copy.liveDemo.window.infoButtonLabel).toBe('Toggle inspector')
    expect(copy.liveDemo.status.guardReady).toBe('Guard · Ready')
    expect(copy.liveDemo.status.guardBlocked).toBe('Guard · Blocked')
    expect(copy.liveDemo.issues.profileMismatch).toBe(
      'The active profile does not match this repository’s assigned profile.'
    )
    expect(copy.liveDemo.issues.nameMismatch).toBe(
      'Your Git author name does not match the active profile.'
    )
    expect(copy.liveDemo.issues.emailMismatch).toBe(
      'Your Git author email does not match the active profile.'
    )
    expect(copy.liveDemo.controls.quickFix).toBe('Switch to "Client"')
    expect(copy.liveDemo.controls.fixing).toBe('Fixing…')
    expect(copy.liveDemo.controls.commit).toBe('Commit Changes')
    expect(copy.liveDemo.controls.commitAndPush).toBe('Commit & Push')
    expect(copy.liveDemo.screens.profiles.setActive).toBe('Set Active')
    expect(copy.liveDemo.screens.profiles.activeBadge).toBe('Active')
    expect(copy.liveDemo.screens.status.workingCopyHeading).toBe('WORKING COPY')
    expect(copy.liveDemo.screens.status.clean).toBe('Working copy clean')
    expect(copy.liveDemo.screens.status.cleanDetail).toBe('No changes are waiting to commit.')
    expect(copy.liveDemo.screens.status.commitConnector).toBe('COMMIT →')
    expect(copy.liveDemo.screens.status.destinationHeading).toBe('DESTINATION BRANCH')
    expect(copy.liveDemo.screens.branches.currentBadge).toBe('Current branch')
    expect(copy.liveDemo.screens.branches.switch).toBe('Switch')
    expect(copy.liveDemo.screens.history.unpushedBadge).toBe('Unpushed')
    expect(copy.liveDemo.screens.safetyCenter.allClear).toBe(
      '✓ No identity issues detected. This repository is safe to commit and push.'
    )
    expect(copy.liveDemo.screens.settings.appearanceLabel).toBe('Appearance')
    expect(copy.liveDemo.screens.settings.appearanceValue).toBe('System')
    expect(copy.liveDemo.screens.settings.aiLabel).toBe('AI Assistant')
    expect(copy.liveDemo.screens.chat.you).toBe('You')
    expect(copy.liveDemo.screens.chat.assistant).toBe('Git Warden AI')
    expect(copy.liveDemo.screens.chat.placeholder).toBe('Ask about this repo, / for commands')
  })

  it('keeps the sidebar inventory in the real post-merge order (no Remote item)', () => {
    expect(Object.keys(copy.liveDemo.window.navigation)).toEqual([
      'manageGroup',
      'gitGroup',
      'appGroup',
      'profiles',
      'repositories',
      'status',
      'commitPush',
      'branches',
      'history',
      'safetyCenter',
      'settings',
    ])
  })
})

describe('live demo public-code boundary', () => {
  it('has no imports or references to desktop, core, Electron, preload, or IPC code', () => {
    const source = readFileSync(new URL('./liveDemo.ts', import.meta.url), 'utf8')
    const importSpecifiers = Array.from(
      source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g),
      (match) => match[1]
    )

    expect(importSpecifiers).toEqual([])
    expect(source).not.toMatch(/(?:\.\.\/)+src\//)
    expect(source).not.toMatch(/\b(?:electron|preload|ipc)\b/i)
  })

  it('keeps every live-demo import inside the public landing bundle', () => {
    const sources = [
      readFileSync(new URL('../components/LiveDemo.astro', import.meta.url), 'utf8'),
      readFileSync(new URL('../components/LiveDemoIcon.astro', import.meta.url), 'utf8'),
      readFileSync(new URL('../content/copy.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../styles/global.css', import.meta.url), 'utf8'),
    ]

    const importSpecifiers = sources.flatMap((source) =>
      Array.from(
        source.matchAll(/(?:from\s+|import\s*(?:\(|))['"]([^'"]+)['"]/g),
        (match) => match[1]
      )
    )

    expect(importSpecifiers).not.toContainEqual(
      expect.stringMatching(/(?:^|\/)src\/(?:core|renderer)(?:\/|$)/)
    )
    expect(sources.join('\n')).not.toMatch(/(?:\.\.\/)+src\/(?:core|renderer)(?:\/|$)/)
  })
})
