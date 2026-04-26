#!/usr/bin/env bash
# Update the version of a dependency across every package.json in the repo.
#
# Usage: bump-package-dep.sh <dep-name> <new-version>
#
# Updates <dep-name> and any package in the matching scope (`@<dep-name>/*`,
# e.g. `@vitest/ui` when bumping `vitest`) across:
#   - dependencies, devDependencies, peerDependencies, optionalDependencies
#   - pnpm.overrides
# Preserves a leading `^` range prefix if present.
#
# Unlike a global `sed` replace, this only rewrites the version string for the
# named package(s) — so an unrelated dep that happens to share a version
# (e.g. `npm-run-all@^4.1.5` while bumping `vitest@4.1.5`) is left untouched.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <dep-name> <new-version>" >&2
  exit 2
fi

NAME="$1"
NEW="$2"

echo "Bumping $NAME (and @$NAME/*) → $NEW in all package.json files..."

find . -name 'package.json' -not -path '*/node_modules/*' -print0 \
  | while IFS= read -r -d '' file; do
  present=$(jq --arg name "$NAME" '
    def tail_pkg: split(">") | last | sub("@[^@]*$"; "");
    def matches($n; key): key == $n or (key | startswith("@" + $n + "/"));
    [
      ((.dependencies // {})         | keys[] | select(matches($name; .))),
      ((.devDependencies // {})      | keys[] | select(matches($name; .))),
      ((.peerDependencies // {})     | keys[] | select(matches($name; .))),
      ((.optionalDependencies // {}) | keys[] | select(matches($name; .))),
      ((.pnpm.overrides // {})       | keys[] | select(matches($name; tail_pkg)))
    ] | length > 0
  ' "$file")

  if [ "$present" != "true" ]; then
    continue
  fi

  jq --arg name "$NAME" --arg new "$NEW" --indent 2 '
    # Last package segment of a pnpm.overrides key: "parent>child" → "child",
    # "parent@1>child" → "child", plain "child" → "child".
    def tail_pkg: split(">") | last | sub("@[^@]*$"; "");
    def matches($n; key): key == $n or (key | startswith("@" + $n + "/"));
    def updname($n; $v):
      to_entries | map(
        if matches($n; .key) and (.value | type) == "string"
        then .value = (if (.value | startswith("^")) then "^" + $v else $v end)
        else . end
      ) | from_entries;
    def updoverrides($n; $v):
      to_entries | map(
        if matches($n; (.key | tail_pkg)) and (.value | type) == "string"
        then .value = (if (.value | startswith("^")) then "^" + $v else $v end)
        else . end
      ) | from_entries;

    (if has("dependencies") then .dependencies |= updname($name; $new) else . end)
    | (if has("devDependencies") then .devDependencies |= updname($name; $new) else . end)
    | (if has("peerDependencies") then .peerDependencies |= updname($name; $new) else . end)
    | (if has("optionalDependencies") then .optionalDependencies |= updname($name; $new) else . end)
    | (if (.pnpm? != null) and (.pnpm | has("overrides"))
       then .pnpm.overrides |= updoverrides($name; $new) else . end)
  ' "$file" > "$file.tmp"
  mv "$file.tmp" "$file"
  echo "  Updated: $file"
done

echo "Done."
