import type { Profile } from '../../src/core/types'

export type ProfileInput = Omit<Profile, 'id'>

export type ProfileFixtureKey =
  | 'personal'
  | 'work'
  | 'client'
  | 'alice'
  | 'octoToken'
  | 'githubTest'

export const PROFILE_FIXTURES: Record<ProfileFixtureKey, ProfileInput> = {
  personal: {
    displayName: 'Personal',
    gitAuthorName: 'Jane Personal',
    gitAuthorEmail: 'jane@personal.dev',
    githubUsername: 'janepersonal',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: [],
  },
  work: {
    displayName: 'Work',
    gitAuthorName: 'Jane Work',
    gitAuthorEmail: 'jane@work.com',
    githubUsername: 'janework',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: [],
  },
  client: {
    displayName: 'Client',
    gitAuthorName: 'Jane Client',
    gitAuthorEmail: 'jane@client.dev',
    githubUsername: 'janeclient',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: [],
  },
  alice: {
    displayName: 'Alice',
    gitAuthorName: 'Alice Dev',
    gitAuthorEmail: 'alice@example.com',
    githubUsername: 'alice',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: [],
  },
  octoToken: {
    displayName: 'Octo',
    gitAuthorName: 'Octo Dev',
    gitAuthorEmail: 'octo@example.com',
    githubUsername: 'octocat',
    authenticationMethod: 'token',
    expectedRemoteHosts: ['github.com'],
  },
  githubTest: {
    displayName: 'GitHub Test',
    gitAuthorName: 'Test User',
    gitAuthorEmail: 'test@example.com',
    githubUsername: '',
    authenticationMethod: 'ssh',
    expectedRemoteHosts: ['github.com'],
  },
}

export function profileFixture(
  key: ProfileFixtureKey,
  patch: Partial<ProfileInput> = {}
): ProfileInput {
  const base = PROFILE_FIXTURES[key]
  const expectedRemoteHosts = patch.expectedRemoteHosts ?? base.expectedRemoteHosts
  const linkedGitHub = patch.linkedGitHub ?? base.linkedGitHub
  const input: ProfileInput = {
    ...base,
    ...patch,
    expectedRemoteHosts: [...expectedRemoteHosts],
  }

  if (linkedGitHub) {
    input.linkedGitHub = {
      ...linkedGitHub,
      scopes: [...linkedGitHub.scopes],
    }
  } else {
    delete input.linkedGitHub
  }

  return input
}
