// Reconcile a repo's `--local` SSH remote host to its assigned profile's declared
// `sshKeyAlias` (ADR 0009). This makes the assigned profile actually govern which key
// authenticates a push, instead of leaving key choice to the ambient ssh-agent.
//
// Deliberately Electron-free and dependency-injected (a minimal `RemoteReconcileDeps`),
// so it runs headlessly under Vitest against real temp git fixtures — mirroring the
// Phase 65 remediation executor. Imports only types + the pure remoteAlias helpers.

import type { RepositoryRecord, Profile } from '../../core/types.js'
import type { GitService } from '../services/GitService.js'
import type { IProfileService } from '../services/ProfileService.js'
import type { IRepositoryService } from '../services/RepositoryService.js'
import { bindHostToAlias, restoreHost, scpRemoteHost } from '../../core/github/remoteAlias.js'

/** The slice of services this reconcile needs — `Services` structurally satisfies it. */
export interface RemoteReconcileDeps {
  git: Pick<GitService, 'getRemotes' | 'setRemoteUrl'>
  profiles: Pick<IProfileService, 'get'>
  repositories: Pick<IRepositoryService, 'update'>
}

/** A host is "GitHub" if it is github.com or a github.com subdomain (incl. Enterprise via expectedRemoteHosts). */
function isGitHubHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'github.com' || h.endsWith('.github.com')
}

/** The ssh alias this profile should bind to, or undefined (HTTPS/token profile, or no alias set). */
function aliasFor(profile: Profile | undefined): string | undefined {
  if (profile?.authenticationMethod !== 'ssh') return undefined
  return profile.sshKeyAlias?.trim() || undefined
}

/**
 * On `repositories:update`, keep the origin's SSH host in sync with the assigned profile:
 *
 *  - **Bind** — assigned profile is `ssh` with a `sshKeyAlias` AND origin is an scp-like SSH
 *    remote: rewrite the origin host to the alias, capturing the canonical host once in
 *    `preBindRemoteHost` for exact reversal. A first-time bind only happens on a GitHub SSH
 *    origin (host is github.com / in `expectedRemoteHosts`); an already-bound repo re-points
 *    freely when the profile (alias) changes.
 *  - **Restore** — profile is unassigned, token-auth, or aliasless: if this repo was bound by
 *    us (`preBindRemoteHost` set), put the canonical host back and clear the marker.
 *
 * HTTPS origins and token-auth profiles are untouched (they keep the per-push token path).
 * Best-effort like `applyAssignedProfileIdentity` — a rewrite failure never blocks the
 * assignment; the Safety Center still reports any real mismatch.
 */
export async function reconcileAssignedProfileRemote(
  deps: RemoteReconcileDeps,
  repo: RepositoryRecord
): Promise<void> {
  try {
    const profile = repo.assignedProfileId
      ? await deps.profiles.get(repo.assignedProfileId)
      : undefined
    const alias = aliasFor(profile)

    const origin = (await deps.git.getRemotes(repo.localPath)).find((r) => r.name === 'origin')
    if (!origin) return
    const currentHost = scpRemoteHost(origin.url)

    if (alias) {
      // BIND. Only scp-like SSH origins are bound; HTTPS (currentHost undefined) is untouched.
      if (currentHost === undefined || currentHost === alias) return
      const alreadyBound = repo.preBindRemoteHost !== undefined
      const isGitHubOrigin =
        isGitHubHost(currentHost) || (profile?.expectedRemoteHosts.includes(currentHost) ?? false)
      // First-time bind only hijacks a GitHub SSH origin; a repo we already bound re-points
      // to the new alias regardless of its (alias) host.
      if (!alreadyBound && !isGitHubOrigin) return

      const preBind = repo.preBindRemoteHost ?? currentHost
      await deps.git.setRemoteUrl(repo.localPath, 'origin', bindHostToAlias(origin.url, alias))
      if (repo.preBindRemoteHost !== preBind) {
        await deps.repositories.update(repo.id, { preBindRemoteHost: preBind })
      }
    } else {
      // RESTORE. Only act if we previously bound this remote.
      if (repo.preBindRemoteHost === undefined) return
      if (currentHost !== undefined) {
        const canonical = repo.preBindRemoteHost || profile?.expectedRemoteHosts[0] || 'github.com'
        await deps.git.setRemoteUrl(repo.localPath, 'origin', restoreHost(origin.url, canonical))
      }
      await deps.repositories.update(repo.id, { preBindRemoteHost: undefined })
    }
  } catch {
    // Best-effort: assignment is already persisted; a real mismatch stays visible in Safety Center.
  }
}
