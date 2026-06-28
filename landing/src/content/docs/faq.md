---
title: FAQ
description: Common questions about GitWarden.
order: 8
---

# Frequently Asked Questions

## Is it safe to use?

Yes. GitWarden is open source under the MIT licence — the full source is on [GitHub](https://github.com/shchadyloTaras/gitwarden). It only modifies your repository's **local** Git configuration (`user.name`, `user.email`) and never touches your global Git config. No telemetry is collected and no data leaves your machine unless you have added an AI connection and triggered a feature that uses it.

## Why does macOS or Windows warn me on first launch?

The current builds are not code-signed or notarized. Signing requires a paid Apple Developer account ($99/year) and a Windows code-signing certificate. Until those are in place, macOS shows _"Apple could not verify … is free of malware"_ and Windows SmartScreen shows an unknown-publisher warning on first launch.

The [Installation guide](/docs/installation) walks through allowing it — on macOS via **System Settings → Privacy & Security → "Open Anyway"** (or one Terminal command). It does not come back for the same version.

## Is it free?

Completely. GitWarden is free and open source — no accounts required (unless you opt in to GitHub Connect), no subscription, no licence key.

## Which installer should I download?

The download button on the home page picks the right one automatically. If you prefer to choose:

- **macOS 2020 or later** (Apple Silicon, M-series): `arm64.dmg`
- **macOS before 2020** (Intel): `x64.dmg`
- **Windows**: `GitWarden-Setup-<ver>.exe`
- **Linux AppImage**: works on most distros, no install step needed
- **Linux .deb**: for Debian, Ubuntu, and their derivatives

## Does it change my global Git config?

No. GitWarden only ever writes `user.name` and `user.email` at the **repository level** using `git config --local`. Your global `~/.gitconfig` is never touched.

## Can I use it without connecting GitHub?

Yes. GitHub Connect is optional. It is only needed for HTTPS-based push with token authentication and for account-level identity verification. If you use SSH keys, everything works without it.

## Does the AI send my code to the internet?

Only if you have added an AI connection and explicitly triggered a feature. Nothing is sent automatically. What is sent depends on the feature — commit messages send the staged diff with secrets stripped; the Safety Copilot sends only the check description. See [AI Connections](/docs/ai-connections) for the full breakdown.

## Where are my settings stored?

In the OS user-data directory — never inside your repositories. Encrypted secrets (API keys, GitHub tokens) are stored in the OS keychain via Electron's `safeStorage` API.

## Can I use GitWarden with GitLab or Bitbucket?

The identity and safety checks work with any Git remote — GitWarden verifies `user.name`, `user.email`, and the remote URL regardless of the hosting provider. The **GitHub Connect** feature (OAuth login and HTTPS token push) is GitHub-specific in the current version.

## Something is not working — where do I report it?

Email [gitwarden.support@gmail.com](mailto:gitwarden.support@gmail.com) or open an issue on the [GitHub repository](https://github.com/shchadyloTaras/gitwarden/issues). Include your OS, the GitWarden version (shown in the app footer), what you expected to happen, and what actually happened.
