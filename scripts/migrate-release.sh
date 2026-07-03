#!/usr/bin/env bash
#
# migrate-release.sh — copy an already-built GitHub Release from the private
# source repo (gitwarden) to the public storefront repo (gitwarden-releases),
# byte-for-byte. Does NOT rebuild anything; it only re-uploads the existing
# release assets under a new release on the storefront.
#
# Usage:
#   scripts/migrate-release.sh <tag> [--draft]
#
#   <tag>     e.g. v0.2.0 — must already exist as a release on the source repo.
#   --draft   create the storefront release as a draft instead of publishing
#             it immediately (default: publish immediately, per
#             docs/plans/private-source-distribution-plan.md "Open questions").
#
# Requires: the GitHub CLI (`gh`), authenticated with access to both repos.

set -euo pipefail

SOURCE_OWNER="shchadyloTaras"
SOURCE_REPO="${SOURCE_OWNER}/gitwarden"
DEST_REPO="${SOURCE_OWNER}/gitwarden-releases"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <tag> [--draft]" >&2
  exit 1
fi

TAG="$1"
IS_DRAFT=0
if [[ "${2:-}" == "--draft" ]]; then
  IS_DRAFT=1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is required but not found on PATH." >&2
  exit 1
fi

if gh release view "$TAG" -R "$DEST_REPO" >/dev/null 2>&1; then
  echo "error: release '$TAG' already exists on $DEST_REPO — refusing to overwrite." >&2
  echo "Delete it first on GitHub if you intend to re-migrate, then re-run." >&2
  exit 1
fi

if ! gh release view "$TAG" -R "$SOURCE_REPO" >/dev/null 2>&1; then
  echo "error: release '$TAG' not found on $SOURCE_REPO — nothing to migrate." >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading assets for $TAG from $SOURCE_REPO ..."
gh release download "$TAG" -R "$SOURCE_REPO" -D "$TMPDIR"

ASSETS=("$TMPDIR"/*)
if [[ ${#ASSETS[@]} -eq 0 ]]; then
  echo "error: no assets downloaded for $TAG — aborting, nothing was created." >&2
  exit 1
fi

echo "Downloaded ${#ASSETS[@]} asset(s):"
printf '  %s\n' "${ASSETS[@]##*/}"

TITLE="$(gh release view "$TAG" -R "$SOURCE_REPO" --json name -q .name)"
NOTES="$(gh release view "$TAG" -R "$SOURCE_REPO" --json body -q .body)"

if [[ "$IS_DRAFT" -eq 1 ]]; then
  echo "Creating $TAG on $DEST_REPO (draft) ..."
  gh release create "$TAG" -R "$DEST_REPO" "${ASSETS[@]}" \
    --title "$TITLE" \
    --notes "$NOTES" \
    --draft
else
  echo "Creating $TAG on $DEST_REPO ..."
  gh release create "$TAG" -R "$DEST_REPO" "${ASSETS[@]}" \
    --title "$TITLE" \
    --notes "$NOTES"
fi

echo "Done. Verify downloads with: gh release view \"$TAG\" -R \"$DEST_REPO\" --json assets -q '.assets[].url'"
