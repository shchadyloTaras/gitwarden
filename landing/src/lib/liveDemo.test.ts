import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy } from '../content/copy'
import {
  LIVE_DEMO_INITIAL_STATE,
  deriveLiveDemoView,
  reduceLiveDemo,
  type LiveDemoState,
} from './liveDemo'

const fixed: LiveDemoState = { activeProfile: 'Client', outcome: 'ready' }

describe('live demo state model', () => {
  it('starts blocked with Personal active — issues visible, committing locked', () => {
    expect(LIVE_DEMO_INITIAL_STATE).toEqual({ activeProfile: 'Personal', outcome: 'blocked' })
    expect(deriveLiveDemoView({ ...LIVE_DEMO_INITIAL_STATE })).toEqual({
      guard: 'blocked',
      issuesVisible: true,
      canCommit: false,
      completed: null,
    })
  })

  it('applies the one-click profile fix and unlocks both commit actions', () => {
    const state = reduceLiveDemo({ ...LIVE_DEMO_INITIAL_STATE }, { type: 'apply-profile-fix' })

    expect(state).toEqual(fixed)
    expect(deriveLiveDemoView(state)).toEqual({
      guard: 'ready',
      issuesVisible: false,
      canCommit: true,
      completed: null,
    })
  })

  it('never commits while blocked — mirrors the disabled buttons on the real screen', () => {
    const blocked = { ...LIVE_DEMO_INITIAL_STATE }

    expect(reduceLiveDemo(blocked, { type: 'commit' })).toEqual(blocked)
    expect(reduceLiveDemo(blocked, { type: 'commit-and-push' })).toEqual(blocked)
  })

  it('completes a simulated commit once fixed', () => {
    const state = reduceLiveDemo(fixed, { type: 'commit' })

    expect(state).toEqual({ activeProfile: 'Client', outcome: 'committed' })
    expect(deriveLiveDemoView(state)).toEqual({
      guard: 'ready',
      issuesVisible: false,
      canCommit: false,
      completed: 'committed',
    })
  })

  it('completes a simulated commit-and-push once fixed', () => {
    const state = reduceLiveDemo(fixed, { type: 'commit-and-push' })

    expect(state).toEqual({ activeProfile: 'Client', outcome: 'pushed' })
    expect(deriveLiveDemoView(state)).toEqual({
      guard: 'ready',
      issuesVisible: false,
      canCommit: false,
      completed: 'pushed',
    })
  })

  it('keeps repeated actions deterministic', () => {
    const ready = reduceLiveDemo({ ...LIVE_DEMO_INITIAL_STATE }, { type: 'apply-profile-fix' })
    expect(reduceLiveDemo(ready, { type: 'apply-profile-fix' })).toEqual(ready)

    const committed = reduceLiveDemo(ready, { type: 'commit' })
    expect(reduceLiveDemo(committed, { type: 'commit' })).toEqual(committed)
    expect(reduceLiveDemo(committed, { type: 'commit-and-push' })).toEqual(committed)
    expect(reduceLiveDemo(committed, { type: 'apply-profile-fix' })).toEqual(committed)
  })

  it('resets every state to a fresh copy of the initial state', () => {
    const reset = reduceLiveDemo({ activeProfile: 'Client', outcome: 'pushed' }, { type: 'reset' })

    expect(reset).toEqual(LIVE_DEMO_INITIAL_STATE)
    expect(reset).not.toBe(LIVE_DEMO_INITIAL_STATE)
  })
})

describe('live demo copy contract', () => {
  it('pins every app-derived literal exactly', () => {
    expect(copy.liveDemo.window.appName).toBe('Git Warden')
    expect(copy.liveDemo.window.navigation.commitPush).toBe('Commit & Push')
    expect(copy.liveDemo.window.stagedEmpty).toBe('No staged changes')
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
