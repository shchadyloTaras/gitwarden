---
slug: gitwarden
date: 2026-07-29
triage: gap
acs: [AC-17]
commit: pending
recurrence_of: none
---

# Fix: Untracked directories counted as one item before staging

## Symptom

Opening Status for a repository with 524 untracked files was expected to show all 524 files under NEW FILES. Instead, GitWarden showed 6 top-level entries because two wholly untracked directories were collapsed. After staging, the same working tree appeared as 524 STAGED CHANGES, so the count changed even though no files had been added or removed.

## Root cause

`GitService.getStatus()` invoked `git status --porcelain=v2 -z --branch` without selecting Git's file-level untracked mode. Git therefore used its default `--untracked-files=normal` behavior and returned each wholly untracked directory as a single record. The porcelain parser, store, and Status UI correctly counted the records they received; the missing `--untracked-files=all` argument at the Git boundary caused the inconsistency. Integration coverage did not previously include files nested under a wholly untracked directory.

## The pinning test

Vitest integration: `enumerates each file inside an untracked directory` in `tests/integration/git-service.test.ts`.

GOOD RED failure before the fix:

> expected [ 'nested/' ] to deeply equal [ 'nested/deep/second.ts', 'nested/first.ts' ]

The test creates two untracked files at different depths under one untracked directory and requires `GitService.getStatus()` to return both individual paths.

## Spec patch

Added AC-17 to `docs/features/gitwarden/spec.md`:

> Given a Repository contains untracked files, including files nested beneath wholly untracked directories, When Status is loaded or refreshed, Then NEW FILES lists and counts every individual untracked file path, and WORKING COPY counts each changed path once; staging those files changes their section without changing the total count unless the working tree changes.

<!-- added-by-fix: 2026-07-29 -->

## Follow-ups

- Monitor Status refresh latency for very large untracked trees against the existing 1,000-file NFR; no parser or UI changes are required for this fix.
