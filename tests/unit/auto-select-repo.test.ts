import { describe, it, expect } from 'vitest'
import { pickAutoSelectedRepo } from '../../src/core/repos/autoSelectRepo.js'
import type { RepositoryRecord } from '../../src/core/types.js'

const repo = (id: string): RepositoryRecord => ({
  id,
  name: id,
  localPath: `/${id}`,
  isFavorite: false,
})

describe('pickAutoSelectedRepo', () => {
  it('picks repos[0] when nothing is active yet', () => {
    expect(pickAutoSelectedRepo([repo('a'), repo('b')], null)).toEqual(repo('a'))
  })

  it('re-picks repos[0] when the active id has vanished from the list', () => {
    expect(pickAutoSelectedRepo([repo('b'), repo('c')], 'a')).toEqual(repo('b'))
  })

  it('leaves the selection alone when the active id is still present', () => {
    expect(pickAutoSelectedRepo([repo('a'), repo('b')], 'b')).toBeUndefined()
  })

  it('leaves the selection alone on an unrelated re-render (list unchanged, same active id)', () => {
    const repos = [repo('a'), repo('b')]
    expect(pickAutoSelectedRepo(repos, 'a')).toBeUndefined()
    expect(pickAutoSelectedRepo(repos, 'a')).toBeUndefined()
  })

  it('clears the selection when the list becomes genuinely empty', () => {
    expect(pickAutoSelectedRepo([], 'a')).toBeNull()
  })

  it('makes no change when the list is empty and nothing was active', () => {
    expect(pickAutoSelectedRepo([], null)).toBeUndefined()
  })
})
