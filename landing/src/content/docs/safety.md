---
title: Safety Checks
description: How GitWarden's pre-commit and pre-push safety engine works.
order: 5
---

# Safety Checks

Before every commit and every push, GitWarden runs a set of checks against the repository's assigned profile. If anything does not match, the action is blocked and the mismatch is shown clearly with a plain-English explanation and a suggested fix.

## What is checked

### Before a commit

| Check            | What it verifies                                                   |
| ---------------- | ------------------------------------------------------------------ |
| Profile assigned | The repository has a profile — there is something to check against |
| Identity set     | The profile has a name and email address                           |
| Author name      | `git config user.name` in this repository matches the profile      |
| Author email     | `git config user.email` in this repository matches the profile     |

### Before a push

Everything above, plus:

| Check                | What it verifies                                                                        |
| -------------------- | --------------------------------------------------------------------------------------- |
| Remote configured    | The repository has a remote to push to                                                  |
| Remote host          | The remote URL points to the expected host (e.g. `github.com`)                          |
| GitHub account       | If GitHub is connected, the push goes through the linked account — not an unrelated one |
| Branch access policy | If a push policy is configured, the target branch is on the allowed list                |

## The safety badge

The badge in the app header shows the current safety status at a glance:

- **Green** — all checks pass; your identity matches the profile and you are safe to commit and push
- **Red** — one or more checks failed; the action is blocked until the mismatch is resolved

Clicking the badge (or opening **Safety Center** from the sidebar) shows the full list of checks, which ones failed, and a suggested fix for each.

## Fixing a mismatch

Most mismatches fall into two categories:

**Wrong identity in the repository** — the Safety Center offers a "Fix" button that sets `user.name` and `user.email` for the repository to match the assigned profile. This is a local-only change (`git config --local`) — your global Git config is never touched.

**Wrong profile assigned** — re-assign the repository to the correct profile in the Repositories screen.

## Push policies

In the Repositories screen you can set a **push policy** for each repository. Policies let you restrict which branches can be pushed to — for example, blocking direct pushes to `main` or requiring that branches follow a naming prefix. The Safety Center shows the current policy status and which branches are allowed.
