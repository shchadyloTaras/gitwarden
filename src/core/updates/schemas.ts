// Zod schemas for the update notifier: one to validate the slice of the GitHub Releases API we
// consume, and the IPC-result schemas so the typed payload is re-validated at the main↔renderer
// boundary (same discipline as the rest of the IPC surface). Zod is allowed in core (pure).

import { z } from 'zod'

/**
 * The fields we read from `GET /repos/{owner}/{repo}/releases/latest`. GitHub sends many more;
 * unknown keys are ignored. `name`/`published_at` are nullable per the API; `draft`/`prerelease`
 * are accepted for completeness (the `/latest` endpoint already excludes both).
 */
export const GitHubLatestReleaseSchema = z.object({
  tag_name: z.string().min(1),
  name: z.string().nullish(),
  html_url: z.string().url(),
  published_at: z.string().nullish(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
})

export type GitHubLatestRelease = z.infer<typeof GitHubLatestReleaseSchema>

export const ReleaseInfoSchema = z.object({
  tag: z.string(),
  version: z.string(),
  name: z.string(),
  url: z.string(),
  publishedAt: z.string().optional(),
})

export const UpdateCheckResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('update-available'),
    currentVersion: z.string(),
    release: ReleaseInfoSchema,
  }),
  z.object({ status: z.literal('up-to-date'), currentVersion: z.string() }),
  z.object({ status: z.literal('no-releases'), currentVersion: z.string() }),
  z.object({ status: z.literal('error'), currentVersion: z.string(), error: z.string() }),
])
