import { describe, it, expect } from 'vitest'
import {
  reduceCommitAndPushFlow,
  type CommitAndPushFlowState,
  type CommitAndPushFlowEvent,
} from '../../../src/core/commitAndPush/flow.js'

const IDLE: CommitAndPushFlowState = { stage: 'idle' }
const CONFIRMING: CommitAndPushFlowState = { stage: 'confirming', remoteName: 'origin' }
const COMMITTING: CommitAndPushFlowState = { stage: 'committing', remoteName: 'origin' }
const PUSHING: CommitAndPushFlowState = {
  stage: 'pushing',
  remoteName: 'origin',
  committedHash: 'abc123',
}
const DONE: CommitAndPushFlowState = {
  stage: 'done',
  remoteName: 'origin',
  committedHash: 'abc123',
}
const COMMIT_FAILED: CommitAndPushFlowState = { stage: 'commit-failed', message: 'boom' }
const PUSH_FAILED: CommitAndPushFlowState = {
  stage: 'push-failed',
  remoteName: 'origin',
  committedHash: 'abc123',
  message: 'non-fast-forward',
}

describe('reduceCommitAndPushFlow — legal transitions', () => {
  it('idle + open → confirming', () => {
    expect(reduceCommitAndPushFlow(IDLE, { type: 'open', remoteName: 'origin' })).toEqual(
      CONFIRMING
    )
  })

  it('confirming + cancel → idle', () => {
    expect(reduceCommitAndPushFlow(CONFIRMING, { type: 'cancel' })).toEqual(IDLE)
  })

  it('confirming + confirm → committing', () => {
    expect(reduceCommitAndPushFlow(CONFIRMING, { type: 'confirm' })).toEqual(COMMITTING)
  })

  it('committing + commit-succeeded → pushing (pushing is reachable only via committing)', () => {
    expect(
      reduceCommitAndPushFlow(COMMITTING, { type: 'commit-succeeded', hash: 'abc123' })
    ).toEqual(PUSHING)
  })

  it('committing + commit-failed → commit-failed', () => {
    expect(reduceCommitAndPushFlow(COMMITTING, { type: 'commit-failed', message: 'boom' })).toEqual(
      COMMIT_FAILED
    )
  })

  it('pushing + push-succeeded → done, retaining committedHash', () => {
    expect(reduceCommitAndPushFlow(PUSHING, { type: 'push-succeeded' })).toEqual(DONE)
  })

  it('pushing + push-failed → push-failed, retaining committedHash', () => {
    expect(
      reduceCommitAndPushFlow(PUSHING, { type: 'push-failed', message: 'non-fast-forward' })
    ).toEqual(PUSH_FAILED)
  })

  it.each([
    ['done', DONE],
    ['commit-failed', COMMIT_FAILED],
    ['push-failed', PUSH_FAILED],
  ])('%s + dismiss → idle', (_name, state) => {
    expect(reduceCommitAndPushFlow(state, { type: 'dismiss' })).toEqual(IDLE)
  })
})

describe('reduceCommitAndPushFlow — cancel is a no-op outside confirming', () => {
  it.each([
    ['idle', IDLE],
    ['committing', COMMITTING],
    ['pushing', PUSHING],
    ['done', DONE],
    ['commit-failed', COMMIT_FAILED],
    ['push-failed', PUSH_FAILED],
  ])('%s + cancel → unchanged', (_name, state) => {
    expect(reduceCommitAndPushFlow(state, { type: 'cancel' })).toEqual(state)
  })
})

describe('reduceCommitAndPushFlow — illegal events leave state unchanged', () => {
  const allStates: [string, CommitAndPushFlowState][] = [
    ['idle', IDLE],
    ['confirming', CONFIRMING],
    ['committing', COMMITTING],
    ['pushing', PUSHING],
    ['done', DONE],
    ['commit-failed', COMMIT_FAILED],
    ['push-failed', PUSH_FAILED],
  ]
  const allEvents: [string, CommitAndPushFlowEvent][] = [
    ['open', { type: 'open', remoteName: 'origin' }],
    ['confirm', { type: 'confirm' }],
    ['commit-succeeded', { type: 'commit-succeeded', hash: 'xyz' }],
    ['commit-failed', { type: 'commit-failed', message: 'boom' }],
    ['push-succeeded', { type: 'push-succeeded' }],
    ['push-failed', { type: 'push-failed', message: 'boom' }],
    ['dismiss', { type: 'dismiss' }],
  ]

  // The legal (state, event) pairs proven above — every other combination must be a no-op.
  const legalPairs = new Set([
    'idle:open',
    'confirming:confirm',
    'committing:commit-succeeded',
    'committing:commit-failed',
    'pushing:push-succeeded',
    'pushing:push-failed',
    'done:dismiss',
    'commit-failed:dismiss',
    'push-failed:dismiss',
  ])

  for (const [stateName, state] of allStates) {
    for (const [eventName, event] of allEvents) {
      const key = `${stateName}:${eventName}`
      if (legalPairs.has(key)) continue
      it(`${key} → unchanged`, () => {
        expect(reduceCommitAndPushFlow(state, event)).toEqual(state)
      })
    }
  }
})
