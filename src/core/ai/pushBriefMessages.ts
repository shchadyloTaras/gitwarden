// Deterministic Push Brief copy (Phase 35). Token-free identity notes for the push sheet.

import type { AiPushIdentityContext } from './types.js'

export function pushBriefSummary(commitCount: number, remoteName: string, branch: string): string {
  if (commitCount === 0) {
    return `Nothing to publish — ${branch} is up to date with ${remoteName}.`
  }
  if (commitCount === 1) {
    return `One commit on ${branch} will be published to ${remoteName}.`
  }
  return `${commitCount} commits on ${branch} will be published to ${remoteName}.`
}

export function pushBriefHighlight(commit: {
  shortHash: string
  message: string
  authorName: string
}): string {
  return `${commit.shortHash} — ${commit.message} (${commit.authorName})`
}

export function formatPushIdentityNote(identity: AiPushIdentityContext): string {
  const parts: string[] = []

  if (identity.activeProfileName) {
    const email = identity.activeProfileEmail ? ` <${identity.activeProfileEmail}>` : ''
    parts.push(`Active profile: ${identity.activeProfileName}${email}`)
  }

  if (identity.assignedProfileName) {
    parts.push(`Assigned profile: ${identity.assignedProfileName}`)
  }

  if (identity.identityName || identity.identityEmail) {
    const name = identity.identityName ?? '(unset)'
    const email = identity.identityEmail ?? '(unset)'
    parts.push(`Local Git identity: ${name} <${email}>`)
  }

  const gh = identity.github
  if (gh) {
    if (!gh.hasToken) {
      parts.push(
        gh.assignedLogin
          ? 'GitHub HTTPS: no stored token for the assigned profile.'
          : 'GitHub HTTPS: assigned profile has no linked GitHub account.'
      )
    } else if (gh.tokenInvalid) {
      parts.push('GitHub HTTPS: stored token was rejected — reconnect required.')
    } else {
      const login = gh.effectiveLogin ?? gh.assignedLogin ?? '(unknown)'
      const matches =
        gh.assignedLogin !== undefined &&
        gh.effectiveLogin !== undefined &&
        gh.assignedLogin === gh.effectiveLogin
      parts.push(
        matches
          ? `GitHub HTTPS push account: @${login} (matches assigned profile).`
          : `GitHub HTTPS push account: @${login} (verify against assigned profile).`
      )
    }
  } else if (identity.remoteHost) {
    parts.push(`Remote host: ${identity.remoteHost} (SSH or non-GitHub HTTPS).`)
  }

  return parts.join(' ')
}
