import type { FileChange } from '../types'

function isChanged(status: FileChange['indexStatus']): boolean {
  return status !== 'unmodified' && status !== 'ignored'
}

/** Counts each changed path once, independent of its index and worktree presentation. */
export function countUniqueChangedFiles(files: readonly FileChange[]): number {
  const changedPaths = new Set<string>()

  for (const file of files) {
    if (isChanged(file.indexStatus) || isChanged(file.worktreeStatus)) {
      changedPaths.add(file.path)
    }
  }

  return changedPaths.size
}
