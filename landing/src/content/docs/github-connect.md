---
title: GitHub Connect
description: Sign in with GitHub to enable HTTPS push and account-level identity verification.
order: 6
---

# GitHub Connect

Connecting your GitHub account lets GitWarden verify the account behind your pushes and enables HTTPS-based push — no SSH key configuration needed for basic usage.

## How to connect

1. Open **Settings → GitHub Accounts** (or click the GitHub badge on a profile in the Profiles screen)
2. Click **Connect GitHub**
3. A short code appears on screen
4. Go to [github.com/login/device](https://github.com/login/device) in your browser and enter the code
5. Approve the request on GitHub
6. GitWarden confirms your GitHub username and avatar and stores the token securely

The token is encrypted at rest using the OS keychain. It is never written to disk in plain text and never sent anywhere except `api.github.com`.

## What it enables

**Account verification** — GitWarden confirms that the GitHub account linked to a profile matches the account you are actually signed in to. A mismatch is reported as a safety issue before the push happens.

**HTTPS push** — GitWarden uses the stored token for HTTPS authentication on push. You do not need to enter a password or create a Personal Access Token manually.

## Multiple accounts

You can connect a different GitHub account to each profile. GitWarden tracks which account belongs to which profile and checks them independently — so your Work profile and Personal profile can each have their own GitHub account.

## Disconnecting

Open **Settings → GitHub Accounts**, find the connected account, and click **Disconnect**. The stored token is deleted immediately from the OS keychain.

## SSH push

GitWarden does not manage SSH keys directly. If you use SSH, it reads your existing SSH configuration and checks that the remote URL and identity match what the profile expects. SSH push works alongside GitHub Connect — you do not need to choose between them.
