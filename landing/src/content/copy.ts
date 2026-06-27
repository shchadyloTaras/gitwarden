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

  download: {
    downloadForMac: 'Download for macOS',
    downloadForWindows: 'Download for Windows',
    downloadForLinux: 'Download for Linux',
    /** Shown for unknown OS or when JavaScript is off. */
    fallback: 'Find your version on GitHub →',
    intelSecondary: 'Intel Mac? Download x64',
    debSecondary: '.deb (Debian / Ubuntu)',
    versionPrefix: 'Latest:',
    /** Degraded state — GitHub unreachable / no release published yet. */
    errorTitle: 'Couldn’t reach GitHub.',
    errorLink: 'See all releases →',
  },

  allDownloads: {
    heading: 'All downloads',
    subhead:
      'Every installer, grouped by platform. Links go straight to GitHub Releases — the site hosts no files.',
    fallbackRow: 'See all releases on GitHub →',
  },

  install: {
    heading: 'Install in two steps',
    unsignedNote:
      'GitWarden isn’t code-signed yet, so your OS shows a one-time warning on first launch. The step above dismisses it safely — nothing else is needed.',
    macOS: {
      tab: 'macOS',
      steps: [
        'Open the downloaded .dmg and drag GitWarden into your Applications folder.',
        'First launch: right-click GitWarden → Open → Open (a one-time step until the app is signed).',
      ],
    },
    windows: {
      tab: 'Windows',
      steps: [
        'Run the downloaded GitWarden-Setup installer.',
        'If Windows SmartScreen appears: click “More info” → “Run anyway” (a one-time step until the app is signed).',
      ],
    },
    linux: {
      tab: 'Linux',
      steps: [
        'AppImage: make it executable with “chmod +x GitWarden-*.AppImage”, then run “./GitWarden-*.AppImage”.',
        'Debian / Ubuntu: install the package with “sudo apt install ./gitwarden_*.deb”.',
      ],
    },
  },
} as const

export type Copy = typeof copy
