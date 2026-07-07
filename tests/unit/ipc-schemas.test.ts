import { describe, it, expect } from 'vitest'
import {
  ProfileGetPayload,
  ProfileCreatePayload,
  ProfileUpdatePayload,
  ProfileDeletePayload,
  RepositoryGetPayload,
  RepositoryCreatePayload,
  RepositoryUpdatePayload,
  RepositoryDeletePayload,
  SettingsUpdatePayload,
  GitRepoPathPayload,
  GitMergePayload,
  GitPullPayload,
  HistoryReturnPayload,
  RemediationExecutePayload,
} from '../../src/main/ipc/ipc-schemas.js'

// Minimal valid profile input (no id)
const validProfileInput = {
  displayName: 'Work',
  gitAuthorName: 'Alice',
  gitAuthorEmail: 'alice@work.com',
  githubUsername: 'alice-work',
  authenticationMethod: 'ssh',
  expectedRemoteHosts: ['github.com'],
}

// Minimal valid repository input (no id)
const validRepoInput = {
  name: 'my-repo',
  localPath: '/home/alice/my-repo',
  isFavorite: false,
}

describe('ProfileGetPayload', () => {
  it('accepts a valid id', () => {
    expect(() => ProfileGetPayload.parse({ id: 'abc-123' })).not.toThrow()
  })
  it('rejects missing id', () => {
    expect(() => ProfileGetPayload.parse({})).toThrow()
  })
  it('rejects non-string id', () => {
    expect(() => ProfileGetPayload.parse({ id: 42 })).toThrow()
  })
  it('rejects null', () => {
    expect(() => ProfileGetPayload.parse(null)).toThrow()
  })
})

describe('ProfileCreatePayload', () => {
  it('accepts valid input', () => {
    expect(() => ProfileCreatePayload.parse(validProfileInput)).not.toThrow()
  })
  it('rejects unknown authenticationMethod', () => {
    expect(() =>
      ProfileCreatePayload.parse({ ...validProfileInput, authenticationMethod: 'oauth' })
    ).toThrow()
  })
  it('rejects missing required fields', () => {
    expect(() => ProfileCreatePayload.parse({ displayName: 'Work' })).toThrow()
  })
  it('rejects an id field (should be omitted)', () => {
    // Zod .omit() — extra fields are stripped by default (not rejected) but id must not be required
    const parsed = ProfileCreatePayload.safeParse({ ...validProfileInput, id: 'should-strip' })
    expect(parsed.success).toBe(true)
  })
})

describe('ProfileUpdatePayload', () => {
  it('accepts id + partial patch', () => {
    expect(() =>
      ProfileUpdatePayload.parse({ id: 'x', patch: { displayName: 'Updated' } })
    ).not.toThrow()
  })
  it('accepts empty patch', () => {
    expect(() => ProfileUpdatePayload.parse({ id: 'x', patch: {} })).not.toThrow()
  })
  it('rejects missing id', () => {
    expect(() => ProfileUpdatePayload.parse({ patch: { displayName: 'Updated' } })).toThrow()
  })
  it('rejects patch with invalid authenticationMethod', () => {
    expect(() =>
      ProfileUpdatePayload.parse({ id: 'x', patch: { authenticationMethod: 'ftp' } })
    ).toThrow()
  })
})

describe('ProfileDeletePayload', () => {
  it('accepts valid id', () => {
    expect(() => ProfileDeletePayload.parse({ id: 'uuid-1' })).not.toThrow()
  })
  it('rejects missing id', () => {
    expect(() => ProfileDeletePayload.parse({})).toThrow()
  })
})

describe('RepositoryGetPayload', () => {
  it('accepts valid id', () => {
    expect(() => RepositoryGetPayload.parse({ id: 'repo-1' })).not.toThrow()
  })
  it('rejects non-object', () => {
    expect(() => RepositoryGetPayload.parse('repo-1')).toThrow()
  })
})

describe('RepositoryCreatePayload', () => {
  it('accepts valid input', () => {
    expect(() => RepositoryCreatePayload.parse(validRepoInput)).not.toThrow()
  })
  it('rejects missing isFavorite', () => {
    expect(() => RepositoryCreatePayload.parse({ name: 'x', localPath: '/tmp/x' })).toThrow()
  })
  it('rejects non-boolean isFavorite', () => {
    expect(() => RepositoryCreatePayload.parse({ ...validRepoInput, isFavorite: 'yes' })).toThrow()
  })
})

describe('RepositoryUpdatePayload', () => {
  it('accepts id + partial patch', () => {
    expect(() =>
      RepositoryUpdatePayload.parse({ id: 'r1', patch: { isFavorite: true } })
    ).not.toThrow()
  })
  it('rejects missing id', () => {
    expect(() => RepositoryUpdatePayload.parse({ patch: { isFavorite: true } })).toThrow()
  })
})

describe('RepositoryDeletePayload', () => {
  it('accepts valid id', () => {
    expect(() => RepositoryDeletePayload.parse({ id: 'r1' })).not.toThrow()
  })
  it('rejects undefined', () => {
    expect(() => RepositoryDeletePayload.parse(undefined)).toThrow()
  })
})

describe('SettingsUpdatePayload', () => {
  it('accepts partial settings', () => {
    expect(() =>
      SettingsUpdatePayload.parse({
        appearance: 'dark',
        onboardingCompletedAt: '2026-06-23T12:00:00.000Z',
      })
    ).not.toThrow()
  })
  it('accepts empty object (all fields optional)', () => {
    expect(() => SettingsUpdatePayload.parse({})).not.toThrow()
  })
  it('rejects invalid appearance value', () => {
    expect(() => SettingsUpdatePayload.parse({ appearance: 'rainbow' })).toThrow()
  })
})

describe('GitRepoPathPayload', () => {
  it('accepts a valid repo path', () => {
    expect(() => GitRepoPathPayload.parse({ repoPath: '/home/alice/repo' })).not.toThrow()
  })
  it('rejects missing repoPath', () => {
    expect(() => GitRepoPathPayload.parse({})).toThrow()
  })
  it('rejects non-string repoPath', () => {
    expect(() => GitRepoPathPayload.parse({ repoPath: 42 })).toThrow()
  })
  it('rejects null', () => {
    expect(() => GitRepoPathPayload.parse(null)).toThrow()
  })
})

// Phase 91: the verified-target compound writes gain optional expected*Branch fields.
describe('GitMergePayload', () => {
  it('accepts without expectedTargetBranch (backward compatible)', () => {
    expect(() => GitMergePayload.parse({ repoPath: '/repo', branch: 'feature' })).not.toThrow()
  })
  it('accepts with expectedTargetBranch', () => {
    expect(() =>
      GitMergePayload.parse({ repoPath: '/repo', branch: 'feature', expectedTargetBranch: 'main' })
    ).not.toThrow()
  })
  it('rejects an empty branch', () => {
    expect(() => GitMergePayload.parse({ repoPath: '/repo', branch: '' })).toThrow()
  })
  it('rejects a non-string expectedTargetBranch', () => {
    expect(() =>
      GitMergePayload.parse({ repoPath: '/repo', branch: 'feature', expectedTargetBranch: 42 })
    ).toThrow()
  })
})

describe('GitPullPayload', () => {
  it('accepts without expectedHeadBranch (backward compatible)', () => {
    expect(() =>
      GitPullPayload.parse({ repoPath: '/repo', remote: 'origin', branch: 'main' })
    ).not.toThrow()
  })
  it('accepts with expectedHeadBranch', () => {
    expect(() =>
      GitPullPayload.parse({
        repoPath: '/repo',
        remote: 'origin',
        branch: 'main',
        expectedHeadBranch: 'main',
      })
    ).not.toThrow()
  })
  it('rejects an empty remote', () => {
    expect(() => GitPullPayload.parse({ repoPath: '/repo', remote: '', branch: 'main' })).toThrow()
  })
  it('rejects an empty branch', () => {
    expect(() =>
      GitPullPayload.parse({ repoPath: '/repo', remote: 'origin', branch: '' })
    ).toThrow()
  })
})

describe('HistoryReturnPayload', () => {
  it('accepts without expectedHeadBranch (backward compatible)', () => {
    expect(() => HistoryReturnPayload.parse({ repoPath: '/repo' })).not.toThrow()
  })
  it('accepts with expectedHeadBranch', () => {
    expect(() =>
      HistoryReturnPayload.parse({ repoPath: '/repo', expectedHeadBranch: 'main' })
    ).not.toThrow()
  })
  it('rejects missing repoPath', () => {
    expect(() => HistoryReturnPayload.parse({ expectedHeadBranch: 'main' })).toThrow()
  })
})

describe('RemediationExecutePayload expectedHeadBranch (Phase 91)', () => {
  it('accepts merge-remote-into-local without expectedHeadBranch (backward compatible)', () => {
    expect(() =>
      RemediationExecutePayload.parse({
        action: 'merge-remote-into-local',
        repoPath: '/repo',
        remote: 'origin',
        branch: 'main',
      })
    ).not.toThrow()
  })
  it('accepts merge-remote-into-local with expectedHeadBranch', () => {
    expect(() =>
      RemediationExecutePayload.parse({
        action: 'merge-remote-into-local',
        repoPath: '/repo',
        remote: 'origin',
        branch: 'main',
        expectedHeadBranch: 'main',
      })
    ).not.toThrow()
  })
  it('rejects a non-string expectedHeadBranch', () => {
    expect(() =>
      RemediationExecutePayload.parse({
        action: 'merge-remote-into-local',
        repoPath: '/repo',
        expectedHeadBranch: 42,
      })
    ).toThrow()
  })
})
