import type { RepositoryRecord } from '../types.js'

export interface ProfileRepositoryEntry {
  id: string
  name: string
  localPath: string
}

export interface ProfileRepositorySummary {
  profileId: string
  count: number
  repositories: ProfileRepositoryEntry[]
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function buildProfileRepositorySummary(
  profileId: string,
  repositories: readonly RepositoryRecord[]
): ProfileRepositorySummary {
  const assigned = repositories
    .filter((repository) => repository.assignedProfileId === profileId)
    .map(({ id, name, localPath }) => ({ id, name, localPath }))
    .sort((left, right) => {
      const nameOrder = compareText(left.name.toLowerCase(), right.name.toLowerCase())
      if (nameOrder !== 0) return nameOrder

      const pathOrder = compareText(left.localPath, right.localPath)
      if (pathOrder !== 0) return pathOrder

      return compareText(left.id, right.id)
    })

  return {
    profileId,
    count: assigned.length,
    repositories: assigned,
  }
}
