---
title: First Run
description: What to expect the first time you open GitWarden.
order: 3
---

# First Run

When you open GitWarden for the first time, a brief onboarding walkthrough appears. It takes about a minute and sets up the key pieces you need before anything else.

## The onboarding walkthrough

The walkthrough covers five steps:

1. **Welcome** — an overview of what GitWarden does and why profiles matter
2. **Create your first profile** — choose a name (Personal, Work, or a client name) and enter the Git name and email for that profile
3. **Add a repository** — point GitWarden at a local Git repository to get started
4. **Assign a profile** — link the repository to the profile you just created
5. **Done** — GitWarden shows the repository with its assigned profile and a safety badge

You can replay the walkthrough at any time from **Settings → Show onboarding**.

## The main window

After the walkthrough, the main window shows:

- **Header** — the active repository name, current branch, assigned profile chip, and a safety badge (green = safe, red = something needs attention)
- **Sidebar** — navigation to Status, Diff, Commit, Push/Pull, Branches, History, Safety Center, and Settings
- **Main panel** — the content for the current screen

The safety badge in the header tells you at a glance whether your current identity matches the repository's assigned profile. Green means everything checks out; red means one or more checks failed and the Safety Center has details.

## Next steps

- [Create more profiles](/docs/profiles) for your work and client repositories
- [Connect GitHub](/docs/github-connect) to enable HTTPS push with the right account
- Read how [safety checks](/docs/safety) work before your first commit
