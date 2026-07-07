import { useAppStore } from './appStore'
import { useProfilesStore } from './profilesStore'
import { useBranchStore } from './branchStore'
import { useHeaderGuardStore } from './headerGuardStore'
import { useStatusStore } from './statusStore'
import { useCommitStore } from './commitStore'
import { useRemoteStore } from './remoteStore'
import { useHistoryStore } from './historyStore'
import { useSafetyCenterStore } from './safetyCenterStore'

/**
 * Explicitly reload everything the active repo drives: the branch list (and, through
 * it, appStore.currentBranch — branchStore is the sole owner), the always-mounted
 * header guard, and whichever screen's store is currently on-screen.
 *
 * This is the seam that makes re-selecting the SAME repo in the header picker actually
 * DO something — `setActiveRepo` now bails on a value-equal record (W30), so a
 * same-repo re-select is otherwise a silent no-op (W14). It is also the seam Phase 95
 * (focus revalidation) and Phase 96 (the `.git` watcher) reuse to force a refresh from
 * an external signal instead of a repo-identity change.
 */
export async function refreshActiveRepo(): Promise<void> {
  const { activeRepo, activeScreen } = useAppStore.getState()
  if (!activeRepo) return

  const { profiles, activeProfileId } = useProfilesStore.getState()
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null

  const tasks: Promise<unknown>[] = [
    useBranchStore.getState().load(activeRepo.localPath, activeRepo),
    useHeaderGuardStore
      .getState()
      .refresh(activeRepo.localPath, activeRepo, activeProfile, profiles),
  ]

  switch (activeScreen) {
    case 'status':
      tasks.push(useStatusStore.getState().loadStatus(activeRepo.localPath))
      break
    case 'commit':
      tasks.push(useCommitStore.getState().load(activeRepo.localPath, activeRepo))
      break
    case 'remote':
      tasks.push(useRemoteStore.getState().load(activeRepo.localPath, activeRepo))
      break
    case 'history':
      tasks.push(useHistoryStore.getState().load(activeRepo.localPath, activeRepo))
      break
    case 'safety-center':
      tasks.push(
        useSafetyCenterStore
          .getState()
          .load(activeRepo.localPath, activeRepo, activeProfile, profiles)
      )
      break
    default:
      // 'branches' is already covered by the branchStore.load() above; the remaining
      // screens (repositories, profiles, settings) have no active-repo-scoped store.
      break
  }

  await Promise.all(tasks)
}
