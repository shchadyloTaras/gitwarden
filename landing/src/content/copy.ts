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
    title: 'Safe Multi-Account Git Client for Desktop — GitWarden',
    description:
      'A desktop Git app that stops you committing or pushing with the wrong account. ' +
      'One click downloads the right installer for macOS, Windows, or Linux.',
  },
  productName: 'GitWarden',
  tagline: 'Never commit with the wrong Git account again.',
  /** Substring of `tagline` that gets the red "caught mistake" squiggle in the hero. */
  taglineHighlight: 'wrong Git account',
  heroSubtitle:
    'A desktop Git app that checks your identity before every commit and push — so your ' +
    'Personal, Work, and Client work never gets crossed.',
  /** Promo badge chip above the hero headline. */
  heroBadge: 'Free for macOS, Windows & Linux',
  /** Trust chips under the hero call-to-action. */
  heroTrust: ['No telemetry', 'No account needed', 'Local-first'],

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

  liveDemo: {
    section: {
      eyebrow: 'Interactive demo',
      heading: 'Catch the wrong Git identity before it becomes a commit.',
      subhead:
        'Switch profiles, try the commit, and see GitWarden stop a Client repository from using the wrong identity.',
      heroAnchor: 'Try the live demo ↓',
    },
    scenario: {
      repository: 'northwind-portal',
      branch: 'main',
      assignedProfile: 'Client',
      effectiveIdentityName: 'Morgan Client',
      effectiveIdentityEmail: 'morgan@northwind.example',
      stagedFile: 'src/client/access.ts',
      commitMessage: 'Update client access rules',
    },
    profiles: {
      Personal: {
        name: 'Morgan Personal',
        email: 'morgan@personal.example',
      },
      Work: {
        name: 'Morgan Work',
        email: 'morgan@work.example',
      },
      Client: {
        name: 'Morgan Client',
        email: 'morgan@northwind.example',
      },
    },
    window: {
      appName: 'GitWarden',
      checkedOut: 'Checked out:',
      navigationLabel: 'Git navigation',
      navigation: {
        manageGroup: 'MANAGE',
        gitGroup: 'GIT',
        appGroup: 'APP',
        profiles: 'Profiles',
        repositories: 'Repositories',
        status: 'Status',
        commit: 'Commit',
        remote: 'Remote',
        branches: 'Branches',
        history: 'History',
        safetyCenter: 'Safety Center',
        settings: 'Settings',
      },
      contextTab: 'Context',
      aiChatTab: 'AI Chat',
      aiButton: 'AI',
      infoButton: 'ⓘ',
      contextHeading: 'CONTEXT',
      profileLabel: 'PROFILE',
      nameLabel: 'Name',
      emailLabel: 'Email',
      repositoryLabel: 'REPOSITORY',
      branchLabel: 'BRANCH',
      guardLabel: 'GUARD',
      stagedHeading: 'Staged Changes (1)',
      messageLabel: 'Commit Message',
      blockedHeading: 'Commit blocked',
    },
    controls: {
      activeProfileLabel: 'Active profile',
      profileGroupLabel: 'Choose the active profile',
      scenarioLabel: 'Repository profile',
      scenarioHint: 'This repository is assigned to Client.',
      personalProfile: 'Personal',
      workProfile: 'Work',
      clientProfile: 'Client',
      // Copied verbatim from src/renderer/strings.ts REMEDIATION_SWITCH_PROFILE('Client').
      quickFix: 'Switch to "Client"',
      // Copied verbatim from src/renderer/strings.ts REMEDIATION_FIXING.
      fixing: 'Fixing…',
      // Copied verbatim from src/renderer/screens/CommitScreen.tsx.
      commit: 'Commit Changes',
      reset: 'Reset demo',
    },
    status: {
      // Copied verbatim from src/renderer/strings.ts GUARD_READY.
      guardReady: 'Guard · Ready',
      // Copied verbatim from src/renderer/strings.ts GUARD_BLOCKED.
      guardBlocked: 'Guard · Blocked',
      inspectorReady: 'Ready',
      inspectorBlocked: 'Blocked',
      readyHint: 'Identity matches the Client profile. This simulated commit can continue.',
      blockedHint: 'This Client repository is using the wrong active profile.',
    },
    issues: {
      // Copied verbatim from src/core/safety/safetyMessages.ts PROFILE_MISMATCH.
      profileMismatch: 'The active profile does not match this repository’s assigned profile.',
      // Copied verbatim from src/core/safety/safetyMessages.ts NAME_MISMATCH.
      nameMismatch: 'Your Git author name does not match the active profile.',
      // Copied verbatim from src/core/safety/safetyMessages.ts EMAIL_MISMATCH.
      emailMismatch: 'Your Git author email does not match the active profile.',
    },
    accessibility: {
      personalSelected: 'Personal profile selected. Guard blocked for this Client repository.',
      workSelected: 'Work profile selected. Guard blocked for this Client repository.',
      clientSelected: 'Client profile selected. Guard ready.',
      blockersRevealed: 'Commit blocked. Three identity mismatches found.',
      resetComplete: 'Demo reset. Personal profile selected. Guard blocked.',
    },
    noScript:
      'Enable JavaScript to try the profile switch. This fixed scenario starts blocked because Personal is active for a repository assigned to Client.',
    completion: {
      heading: 'Simulated commit passed',
      body: 'GitWarden would allow this commit. No repository was changed.',
      announcement: 'Simulation complete. Guard ready. No repository was changed.',
    },
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
        'First launch: macOS blocks it once — open it, then go to System Settings → Privacy & Security and click “Open Anyway”. (One-time, until the app is signed.)',
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
    docsLink: { label: 'Full installation guide', href: '/docs/installation' },
  },

  nav: {
    links: [
      { label: 'Why', href: '#why' },
      { label: 'Features', href: '#features' },
      { label: 'Download', href: '#downloads' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Docs', href: '/docs' },
    ],
    themeToggleLabel: 'Toggle light and dark theme',
    skipToContent: 'Skip to content',
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
    docsLink: { label: 'See how the safety checks work', href: '/docs/safety' },
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
    docsLink: { label: 'Browse the full documentation', href: '/docs' },
  },

  screenshots: {
    heading: 'See it in action',
    subhead: 'The same safety checks, at home in light and dark.',
    // Captures of the real app. The image files are imported and optimized in
    // Screenshots.astro and paired with these entries by order (dark, then light).
    shots: [
      {
        alt: 'GitWarden in dark mode: the Status screen header shows the active Work profile and a green “Guard · Ready” badge, above two staged changes and a diff on the feature/oauth-login branch, ready to commit.',
        caption: 'Identity and safety, front and center',
      },
      {
        alt: 'GitWarden in light mode: the Repositories screen lists each repository with its assigned profile — Personal, Work, and Client — and flags the ones that do not match the active profile.',
        caption: 'A profile for every repository',
      },
    ],
  },

  faq: {
    heading: 'Questions, answered',
    items: [
      {
        q: 'Is it safe?',
        a: 'Yes. GitWarden sends no telemetry, and it only ever changes your repository’s local Git settings — never your global configuration.',
      },
      {
        q: 'Why does my computer warn me on first launch?',
        a: 'The current builds aren’t code-signed yet, so macOS and Windows show a one-time security warning. On macOS, allow it via System Settings → Privacy & Security → “Open Anyway”; on Windows, click “More info” → “Run anyway”. The install steps above walk through it. Signed builds are on the way.',
      },
      {
        q: 'Is it free?',
        a: 'GitWarden is free to download and use today — no accounts, no payment, no license keys.',
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
    license: '© 2026 Taras Shchadylo. All rights reserved.',
    links: {
      support: 'Support',
      releases: 'Releases',
      security: 'Security policy',
      license: 'License',
    },
  },
} as const

export type Copy = typeof copy
