---
description: 'Draft the app CHANGELOG for a release from commits since the last tag, bump the version, and make the release commit + tag locally. Never pushes.'
argument-hint: '[major|minor|patch] (optional — overrides the suggested bump)'
allowed-tools: Bash(npm test), Bash(npm run release:changelog*), Bash(git status), Bash(git diff*), Bash(git log*), Bash(git add*), Bash(git commit*), Bash(git tag*), Read, Edit
---

Build a release **locally** for the app (`CHANGELOG.md`), excluding landing changes. The final
`git push` is always the human's — this command never pushes.

## Step 1 — Gate: clean working tree

```bash
git status --porcelain
```

If the output is non-empty, STOP and report:

```
REFUSED: working tree is not clean. Commit or stash changes first.
```

## Step 2 — Gate: tests green

```bash
npm test 2>&1
```

If any test fails (exit code ≠ 0), STOP and report:

```
REFUSED: tests are red. Fix tests first.
```

## Step 3 — Collect the app commits

```bash
npm run release:changelog -- collect
```

If it exits non-zero (e.g. `REFUSED: no app commits`), STOP and report its message. Otherwise read
the JSON: `prevTag`, `currentVersion`, `suggestedKind`, `suggestedVersion`, `commits[]`.

## Step 4 — Confirm the version (human checkpoint 1)

Show the human `suggestedVersion` and the `commits[]` list. If `$ARGUMENTS` names a bump
(`major|minor|patch`), recompute and prefer that. Ask the human to confirm the exact version string
(e.g. `0.2.0`). Use the confirmed value as `<version>` below. Do not continue without confirmation.

## Step 5 — Write the changelog entries

Read `CHANGELOG.md`. Under the `## [Unreleased]` heading, write user-facing bullets summarising
`commits[]`, grouped into `### Added`, `### Fixed`, `### Changed` (omit empty groups). Match the tone
of the existing entries: concise, user-facing, present tense. Apply editorial judgment — omit pure
chore/ci/test/docs commits that carry no user-facing change. Do NOT write the version heading or
date — Step 6 does that. Use Edit.

## Step 6 — Apply version + structure (deterministic)

```bash
npm run release:changelog -- apply <version>
```

Renames `[Unreleased]` → `[<version>] — <date>`, re-opens an empty `[Unreleased]`, adds the compare
link, and bumps `package.json`. If it prints `already has [<version>]`, the section was already
rolled — continue.

## Step 7 — Review the diff (human checkpoint 2)

```bash
git diff -- CHANGELOG.md package.json
```

Show the diff. Apply any wording tweaks the human requests with Edit.

## Step 8 — Log the release (required for the commit gate)

The `commit-needs-log.sh` hook requires `docs/progress-log.md` to be staged on every commit. Append
a release entry under the existing log style (a dated `### <YYYY-MM-DD> — v<version> released` entry
with a one-line summary) using Edit. This is a real release record, not a phase entry.

## Step 9 — Commit + tag (local only)

Stage first (the hook reads the index before the commit runs), then commit, then tag:

```bash
git add CHANGELOG.md package.json docs/progress-log.md
```

```bash
git commit -m "$(cat <<'EOF'
chore: release v<version>

<one-line summary>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

```bash
git tag v<version>
```

## Step 10 — Stop and hand off

Print the version, then STOP and report exactly:

```
Release v<version> staged locally (commit + tag). To publish, run:
  git push origin <branch> && git push origin v<version>
```

## Step 11 — Never push

Do NOT run `git push` under any circumstances, even if asked within this command. Pushing is always
a separate, explicit manual step by the human.
