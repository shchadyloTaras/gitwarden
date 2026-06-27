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

  nav: {
    links: [
      { label: 'Why', href: '#why' },
      { label: 'Features', href: '#features' },
      { label: 'Download', href: '#downloads' },
      { label: 'FAQ', href: '#faq' },
    ],
    github: 'GitHub',
    themeToggleLabel: 'Toggle light and dark theme',
  },

  why: {
    heading: 'Why GitWarden',
    lead: 'Juggling multiple GitHub identities on one machine is error-prone — the right email but the wrong SSH key, a repo committed under your personal name at work, a push to the wrong account. GitWarden keeps the active identity visible and blocks unsafe actions before they happen.',
    points: [
      {
        title: 'One profile per repository',
        body: 'Assign each repository to a Personal, Work, or Client profile. The identity in use is always shown — never a guess.',
      },
      {
        title: 'Checked before every commit and push',
        body: 'GitWarden reviews the author name, email, SSH key, and remote before the action — and stops it when something does not match.',
      },
      {
        title: 'No more wrong-account mistakes',
        body: 'No commits under the wrong name, no pushes to the wrong remote. Slip-ups are caught while they are still on your machine.',
      },
    ],
  },

  features: {
    heading: 'Everything you need to stay safe',
    items: [
      {
        title: 'Identity profiles',
        body: 'Personal, Work, and Client profiles — each with its own name, email, and SSH key. Switch with confidence.',
      },
      {
        title: 'Pre-commit and pre-push safety',
        body: 'Every commit and push is checked against the repository’s assigned profile. Unsafe actions are blocked with a clear reason.',
      },
      {
        title: 'Connect GitHub',
        body: 'Sign in with GitHub to confirm the account behind your pushes — no more wondering which identity is active.',
      },
      {
        title: 'AI assistant (optional)',
        body: 'Add your own API key for commit-message help, change review, and a built-in chat. Advisory only — it never runs Git for you.',
      },
    ],
  },

  screenshots: {
    heading: 'See it in action',
    subhead: 'The same safety checks, at home in light and dark.',
    note: 'Preview mockups — real app captures are on the way.',
    shots: [
      {
        src: '/screenshots/app-dark.svg',
        alt: 'GitWarden in dark mode: the header shows the active Work profile and a green “safe” badge above a list of staged changes ready to commit.',
        caption: 'Identity and safety, front and center',
      },
      {
        src: '/screenshots/app-light.svg',
        alt: 'GitWarden in light mode: the repositories screen lists each repository with the profile it is assigned to.',
        caption: 'A profile for every repository',
      },
    ],
  },

  faq: {
    heading: 'Questions, answered',
    items: [
      {
        q: 'Is it safe?',
        a: 'Yes. GitWarden is open source under the MIT license and sends no telemetry. It only ever changes your repository’s local Git settings — never your global configuration.',
      },
      {
        q: 'Why does my computer warn me on first launch?',
        a: 'The current builds aren’t code-signed yet, so macOS and Windows show a one-time “unknown developer” warning. The install steps above dismiss it safely. Signed builds are on the way.',
      },
      {
        q: 'Is it free?',
        a: 'Completely. GitWarden is free and open source — no accounts, no payment, no license keys.',
      },
      {
        q: 'Which file should I download?',
        a: 'The button at the top picks the right one for your system automatically. Want to choose yourself?',
        link: { label: 'See every installer', href: '#downloads' },
      },
    ],
  },

  footer: {
    tagline: 'Safe multi-account Git for the desktop.',
    latestPrefix: 'Latest release:',
    noRelease: 'View releases on GitHub',
    license: 'Open source under the MIT license.',
    links: {
      github: 'GitHub repository',
      releases: 'Releases',
      security: 'Security policy',
      license: 'License',
    },
  },
} as const

export type Copy = typeof copy
