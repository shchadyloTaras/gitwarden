// GitHub OAuth (Device Authorization Flow) configuration.
//
// PURE module — no Node, Electron, or DOM imports. These values are NOT secret:
// Device Flow uses only a public client_id; there is NO client secret anywhere
// in GitWarden (see docs/plans/github-oauth-plan.md §1.1 + Appendix B/D).

/**
 * The public OAuth App client_id, shared by every install. A maintainer fills
 * this in once after registering the GitHub OAuth App with Device Flow enabled
 * (docs/plans/github-oauth-plan.md Appendix D). Placeholder until then — tests
 * use mocks/fakes and never need a real id.
 */
export const GITHUB_CLIENT_ID = 'Ov23liMJ2oRxygjRi84h'

/**
 * Scopes requested for identity verification AND HTTPS GitHub push.
 * Phase 27 enabled the token-backed push path, so `repo` is required; otherwise
 * GitHub can authenticate the account but still reject `git push` with HTTP 403.
 */
export const GITHUB_OAUTH_SCOPES = ['repo', 'read:user', 'user:email'] as const

/**
 * The public GitHub repository that hosts GitWarden releases. Used by the update
 * notifier to query the latest published release (mirrors the publish target in
 * the builder config and `repository` in package.json). Not secret.
 */
export const GITHUB_REPO_OWNER = 'shchadyloTaras'
export const GITHUB_REPO_NAME = 'gitwarden'
