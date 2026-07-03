// Initialize Repository (Phase 86): the git:initializeRepository channel's core logic,
// kept OUT of ipc-handlers.ts (which imports Electron) so it's unit-testable under plain
// Vitest, mirroring gitMergeHandler.ts. Order is nested-check -> init -> local identity ->
// optional remote add. A nested-repo hit throws BEFORE `git init` ever runs (repoPath is
// not yet a repo, so `findEnclosingToplevel` walks up to any enclosing one). A remote-add
// failure is captured and returned as `remoteError` — the init is never rolled back.

import { realpath } from 'node:fs/promises'
import path from 'node:path'
import type { GitService } from '../services/GitService.js'

export interface GitInitializeDeps {
  git: Pick<
    GitService,
    'findEnclosingToplevel' | 'initRepository' | 'setLocalIdentity' | 'addRemote'
  >
}

export interface GitInitializeResult {
  name: string
  remoteUrl?: string
  remoteError?: string
}

export async function runGitInitialize(
  deps: GitInitializeDeps,
  repoPath: string,
  remoteUrl: string | undefined,
  identityName: string,
  identityEmail: string
): Promise<GitInitializeResult> {
  const enclosingToplevel = await deps.git.findEnclosingToplevel(repoPath)
  if (enclosingToplevel !== null) {
    const [canonicalEnclosing, canonicalTarget] = await Promise.all([
      realpath(enclosingToplevel),
      realpath(repoPath),
    ])
    if (canonicalEnclosing !== canonicalTarget) {
      throw new Error(
        `This folder is already inside a Git repository at "${canonicalEnclosing}". Choose a folder outside an existing repository.`
      )
    }
  }

  await deps.git.initRepository(repoPath)
  await deps.git.setLocalIdentity(repoPath, identityName, identityEmail)

  const result: GitInitializeResult = { name: path.basename(repoPath) }
  if (remoteUrl) {
    try {
      await deps.git.addRemote(repoPath, 'origin', remoteUrl)
      result.remoteUrl = remoteUrl
    } catch (err) {
      result.remoteError = err instanceof Error ? err.message : String(err)
    }
  }
  return result
}
