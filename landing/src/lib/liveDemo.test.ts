import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy } from '../content/copy'
import {
  LIVE_DEMO_INITIAL_STATE,
  LIVE_DEMO_PROFILES,
  deriveLiveDemoView,
  reduceLiveDemo,
  type LiveDemoProfile,
  type LiveDemoState,
} from './liveDemo'

function select(profile: LiveDemoProfile, state: LiveDemoState = { ...LIVE_DEMO_INITIAL_STATE }) {
  return reduceLiveDemo(state, { type: 'select-profile', profile })
}

describe('live demo state model', () => {
  it('starts with Personal active, a blocked Guard, hidden issues, and no safe commit', () => {
    expect(LIVE_DEMO_INITIAL_STATE).toEqual({ activeProfile: 'Personal', outcome: 'idle' })
    expect(deriveLiveDemoView({ ...LIVE_DEMO_INITIAL_STATE })).toEqual({
      guard: 'blocked',
      issuesVisible: false,
      canCommit: false,
    })
  })

  it.each([
    ['Personal', 'idle', 'blocked', false],
    ['Work', 'idle', 'blocked', false],
    ['Client', 'ready', 'ready', true],
  ] as const)(
    'selecting %s clears stale outcomes and derives the expected Guard state',
    (profile, outcome, guard, canCommit) => {
      const state = select(profile, { activeProfile: 'Client', outcome: 'complete' })

      expect(state).toEqual({ activeProfile: profile, outcome })
      expect(deriveLiveDemoView(state)).toEqual({
        guard,
        issuesVisible: false,
        canCommit,
      })
    }
  )

  it.each(['Personal', 'Work'] as const)(
    'reveals blockers when attempting a commit with the %s profile',
    (profile) => {
      const attempted = reduceLiveDemo(select(profile), { type: 'attempt-commit' })

      expect(attempted).toEqual({ activeProfile: profile, outcome: 'blocked' })
      expect(deriveLiveDemoView(attempted)).toEqual({
        guard: 'blocked',
        issuesVisible: true,
        canCommit: false,
      })
    }
  )

  it('applies the one-click profile fix and clears the blocker outcome', () => {
    const blocked = reduceLiveDemo(select('Work'), { type: 'attempt-commit' })
    const fixed = reduceLiveDemo(blocked, { type: 'apply-profile-fix' })

    expect(fixed).toEqual({ activeProfile: 'Client', outcome: 'ready' })
    expect(deriveLiveDemoView(fixed)).toEqual({
      guard: 'ready',
      issuesVisible: false,
      canCommit: true,
    })
  })

  it('allows direct Client selection and completes only the scripted simulation', () => {
    const ready = select('Client')
    const complete = reduceLiveDemo(ready, { type: 'attempt-commit' })

    expect(ready).toEqual({ activeProfile: 'Client', outcome: 'ready' })
    expect(complete).toEqual({ activeProfile: 'Client', outcome: 'complete' })
    expect(deriveLiveDemoView(complete)).toEqual({
      guard: 'ready',
      issuesVisible: false,
      canCommit: false,
    })
  })

  it('clears a completed outcome when the visitor changes profile', () => {
    const complete = reduceLiveDemo(select('Client'), { type: 'attempt-commit' })

    expect(select('Personal', complete)).toEqual({ activeProfile: 'Personal', outcome: 'idle' })
  })

  it('keeps repeated actions deterministic', () => {
    const blocked = reduceLiveDemo(select('Personal'), { type: 'attempt-commit' })
    expect(reduceLiveDemo(blocked, { type: 'attempt-commit' })).toEqual(blocked)

    const fixed = reduceLiveDemo(blocked, { type: 'apply-profile-fix' })
    expect(reduceLiveDemo(fixed, { type: 'apply-profile-fix' })).toEqual(fixed)

    const complete = reduceLiveDemo(fixed, { type: 'attempt-commit' })
    expect(reduceLiveDemo(complete, { type: 'attempt-commit' })).toEqual(complete)
  })

  it('resets every state to a fresh copy of the initial state', () => {
    const reset = reduceLiveDemo(
      { activeProfile: 'Client', outcome: 'complete' },
      { type: 'reset' }
    )

    expect(reset).toEqual(LIVE_DEMO_INITIAL_STATE)
    expect(reset).not.toBe(LIVE_DEMO_INITIAL_STATE)
  })

  it('keeps the fixed profile inventory ordered for the controls', () => {
    expect(LIVE_DEMO_PROFILES).toEqual(['Personal', 'Work', 'Client'])
  })
})

describe('live demo copy contract', () => {
  it('pins every app-derived literal exactly', () => {
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
