# Repository mismatch icon refresh

## Goal

Replace the repeated warning-triangle glyph in the Repositories list with a calmer visual that
still communicates when a repository belongs to a profile other than the active profile.

## Visual contract

- Every repository row shows the same neutral repository/folder outline inside a compact,
  softly tinted rounded-square tile.
- A small amber status dot is attached to the tile's top-right corner only when the repository's
  assigned profile differs from the active profile.
- Rows without a mismatch keep the neutral tile but do not show the amber dot.
- Repository names, assigned-profile labels, row spacing, selection, and separators remain
  unchanged.
- The implementation uses an inline SVG and existing theme tokens; it adds no icon dependency.

## Behavior and accessibility

- The existing mismatch predicate remains unchanged.
- The neutral repository glyph is decorative and hidden from assistive technology.
- The amber dot retains the existing `repo-item-mismatch` test id and exposes the localized
  `Profile mismatch` description through its accessible label and tooltip.
- The selected repository's detailed mismatch warning remains unchanged.

## Implementation pseudocode

```text
for each repository row:
  assignedProfile = find profile matching repository.assignedProfileId
  hasMismatch =
    repository has assignedProfileId
    AND an active profile exists
    AND assignedProfileId differs from activeProfileId

  render repository icon tile
  if hasMismatch:
    render small amber status dot on the tile

  render the existing repository name and assigned-profile label
```

## Verification

- Add a focused UI assertion that every repository row renders the neutral icon.
- Confirm the mismatch dot is present for a repository assigned to another active profile.
- Confirm the old warning-triangle character is absent.
- Run the affected TypeScript, lint, and repository-screen Playwright checks.
- Check the tile and dot in both light and dark themes.

## Scope

This is a renderer-only visual refinement. It does not change profile assignment, safety checks,
repository persistence, IPC, Git execution, or mismatch remediation.
