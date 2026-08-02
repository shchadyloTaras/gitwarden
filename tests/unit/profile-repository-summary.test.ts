import { describe, expect, it } from 'vitest'
import { buildProfileRepositorySummary } from '../../src/core/profiles/profileRepositorySummary.js'
import type { RepositoryRecord } from '../../src/core/types.js'

function makeRepository(
  id: string,
  assignedProfileId?: string,
  overrides: Partial<RepositoryRecord> = {}
): RepositoryRecord {
  return {
    id,
    name: id,
    localPath: `/work/${id}`,
    assignedProfileId,
    isFavorite: false,
    ...overrides,
  }
}

describe('buildProfileRepositorySummary', () => {
  it.each([
    { label: 'an empty repository set', repositories: [] },
    {
      label: 'only unassigned repositories',
      repositories: [makeRepository('unassigned')],
    },
    {
      label: 'only repositories assigned to other profiles',
      repositories: [
        makeRepository('other', 'profile-other'),
        makeRepository('ghost', 'profile-that-does-not-exist'),
      ],
    },
  ])('returns an empty summary for $label', ({ repositories }) => {
    expect(buildProfileRepositorySummary('profile-work', repositories)).toEqual({
      profileId: 'profile-work',
      count: 0,
      repositories: [],
    })
  })

  it('includes one assigned repository and exposes only renderer summary fields', () => {
    const repository = makeRepository('repo-1', 'profile-work', {
      name: 'Website',
      localPath: '/work/client/website',
      remoteUrl: 'git@github.com:client/website.git',
      notes: 'not part of the summary',
      isFavorite: true,
    })

    expect(buildProfileRepositorySummary('profile-work', [repository])).toEqual({
      profileId: 'profile-work',
      count: 1,
      repositories: [
        {
          id: 'repo-1',
          name: 'Website',
          localPath: '/work/client/website',
        },
      ],
    })
  })

  it('counts records rather than deduplicating duplicate names or remotes', () => {
    const repositories = [
      makeRepository('repo-b', 'profile-work', {
        name: 'Shared app',
        localPath: '/work/copy-b',
        remoteUrl: 'git@github.com:team/shared.git',
      }),
      makeRepository('repo-a', 'profile-work', {
        name: 'Shared app',
        localPath: '/work/copy-a',
        remoteUrl: 'git@github.com:team/shared.git',
      }),
      makeRepository('unassigned-copy', undefined, {
        name: 'Shared app',
        localPath: '/work/copy-c',
        remoteUrl: 'git@github.com:team/shared.git',
      }),
    ]

    const summary = buildProfileRepositorySummary('profile-work', repositories)

    expect(summary.count).toBe(2)
    expect(summary.repositories).toEqual([
      { id: 'repo-a', name: 'Shared app', localPath: '/work/copy-a' },
      { id: 'repo-b', name: 'Shared app', localPath: '/work/copy-b' },
    ])
    expect(summary.count).toBe(summary.repositories.length)
  })

  it('sorts by case-insensitive name, then local path, then id', () => {
    const repositories = [
      makeRepository('z-id', 'profile-work', { name: 'beta', localPath: '/work/z' }),
      makeRepository('b-id', 'profile-work', { name: 'ALPHA', localPath: '/work/same' }),
      makeRepository('a-id', 'profile-work', { name: 'alpha', localPath: '/work/same' }),
      makeRepository('path-first', 'profile-work', { name: 'Alpha', localPath: '/work/a' }),
      makeRepository('other-profile', 'profile-other', { name: 'Aardvark' }),
    ]

    expect(
      buildProfileRepositorySummary('profile-work', repositories).repositories.map(
        (repository) => repository.id
      )
    ).toEqual(['path-first', 'a-id', 'b-id', 'z-id'])
  })

  it('does not mutate the input array or its records', () => {
    const first = Object.freeze(
      makeRepository('second', 'profile-work', { name: 'Zulu', localPath: '/work/zulu' })
    )
    const second = Object.freeze(
      makeRepository('first', 'profile-work', { name: 'Alpha', localPath: '/work/alpha' })
    )
    const repositories = Object.freeze([first, second])
    const before = repositories.map((repository) => ({ ...repository }))

    const summary = buildProfileRepositorySummary('profile-work', repositories)

    expect(summary.repositories.map((repository) => repository.id)).toEqual(['first', 'second'])
    expect(repositories).toEqual(before)
    expect(repositories[0]).toBe(first)
    expect(repositories[1]).toBe(second)
  })
})
