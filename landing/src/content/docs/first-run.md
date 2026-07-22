---
title: First Run
description: What to expect the first time you open GitWarden.
order: 3
---

# First Run

When you open GitWarden for the first time, a brief onboarding walkthrough appears. It takes about a minute and sets up the key pieces you need before anything else.

## The onboarding walkthrough

The walkthrough covers eleven steps, spotlighting each part of the app in the order you'll actually use it:

1. **Welcome** — an overview of what GitWarden does and why profiles matter
2. **Global header** — the active repository, branch, safety badge, and AI chat toggle
3. **Navigation** — how the sidebar groups Manage (Profiles, Repositories) and Git (Status, Commit & Push, Branches, History, Safety Center)
4. **Create your first profile** — choose a name (Personal, Work, or a client name) and enter the Git name and email for that profile
5. **Add a repository** — point GitWarden at a local Git repository and assign it to the profile
6. **Review and stage changes** — the Status screen, where you inspect diffs and stage files
7. **Commit & Push, safely** — one tab for the whole journey: committing checks identity and staged changes, pushing shows a confirmation sheet with remote, branch, and safety details
8. **Use Safety Center** — the single place that audits identity, remote host, branch, and profile assignment
9. **Ask GitWarden AI** — repo-aware chat and slash-commands like `/commit` or `/review`
10. **Connect an AI provider** — where to paste an API key to enable the assistant
11. **Replay any time** — the walkthrough stays available from Settings

You can replay the walkthrough at any time from **Settings → Walkthrough → Start Walkthrough**.

## The main window

After the walkthrough, the main window shows:

- **Header** — the active repository name, current branch, assigned profile chip, and a safety badge (green = safe, red = something needs attention)
- **Sidebar** — grouped navigation: **Manage** (Profiles, Repositories), **Git** (Status, Commit & Push, Branches, History, Safety Center), and **Settings**
- **Main panel** — the content for the current screen

The safety badge in the header tells you at a glance whether your current identity matches the repository's assigned profile. Green means everything checks out; red means one or more checks failed and the Safety Center has details.

## Next steps

- [Create more profiles](/docs/profiles) for your work and client repositories
- [Connect GitHub](/docs/github-connect) to enable HTTPS push with the right account
- Read how [safety checks](/docs/safety) work before your first commit
