/**
 * Single source of truth for every user-facing string on the landing site.
 *
 * Plan §2 (Site Rules): "Externalize copy. All user-facing strings live in one
 * src/content/copy.ts module, so messaging is edited in one place."
 *
 * Phase 46 seeds the foundational strings (product name, tagline, page meta).
 * Later phases extend this object: download labels + install steps (Phase 48),
 * the marketing sections + FAQ + footer (Phase 49). Keep additions here, never
 * inline in .astro components.
 */
export const copy = {
  meta: {
    title: 'GitWarden — Safe multi-account Git for desktop',
    description:
      'A desktop Git app that stops you committing or pushing with the wrong account. ' +
      'One click downloads the right installer for macOS, Windows, or Linux.',
  },
  productName: 'GitWarden',
  tagline: 'Never commit with the wrong account again.',
  heroSubtitle:
    'A desktop Git app that checks your identity before every commit and push — so your ' +
    'Personal, Work, and Client work never gets crossed.',
} as const

export type Copy = typeof copy
