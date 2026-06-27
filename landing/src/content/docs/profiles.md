---
title: Profiles
description: Create and manage Personal, Work, and Client profiles in GitWarden.
order: 4
---

# Profiles

A **profile** groups the Git identity you use for a particular context — your display name, email address, and optionally your GitHub account. Each repository is assigned to exactly one profile, and GitWarden checks that identity before every commit and push.

## Creating a profile

1. Open the **Profiles** screen from the sidebar
2. Click **New Profile**
3. Enter a display name (e.g. "Work", "Personal", "Acme Client")
4. Enter the Git **name** and **email** you want to use for this profile — these should match what you have configured for the relevant GitHub account
5. Click **Save**

You can create as many profiles as you need. Most people start with two or three:

| Profile name | Typical use                                              |
| ------------ | -------------------------------------------------------- |
| Personal     | Personal projects and open-source contributions          |
| Work         | Repositories under your employer's GitHub organisation   |
| Client name  | Freelance or contract repositories for a specific client |

## Assigning a profile to a repository

1. Open the **Repositories** screen
2. Find the repository and click **Assign Profile** (or click the profile chip next to the repo name)
3. Choose a profile from the list
4. Click **Save**

Once assigned, GitWarden uses that profile's name and email as the expected identity for all commits and pushes in that repository.

## Switching profiles

Profiles are per-repository — there is no global "active profile" switch. To change which profile a repository uses, re-assign it in the Repositories screen.

## Editing and deleting profiles

Click the **···** menu next to any profile in the Profiles screen to edit or delete it. Deleting a profile removes it from any repositories it was assigned to — you will need to re-assign those repositories to a different profile before they are safe to commit from.
