#!/usr/bin/env bash
# Called by npm's "version" lifecycle script.
# Replaces "## [Unreleased]" with the new version + today's date,
# then re-adds an empty "## [Unreleased]" section above it.

set -euo pipefail

VERSION="${npm_package_version:?npm_package_version not set}"
DATE=$(date +%Y-%m-%d)
FILE="CHANGELOG.md"

if ! grep -q '## \[Unreleased\]' "$FILE"; then
  echo "No [Unreleased] section found in $FILE" >&2
  exit 0
fi

sed -i '' "s/## \[Unreleased\]/## [${VERSION}] - ${DATE}/" "$FILE"

# Add fresh Unreleased section at the top (after "# Changelog")
sed -i '' "s/^# Changelog$/# Changelog\n\n## [Unreleased]/" "$FILE"

git add "$FILE"
