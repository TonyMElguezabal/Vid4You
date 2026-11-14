#!/usr/bin/env bash
# enable-release-workflow (JOS-206) — the release decisions, testable without GitHub. A release starts from a version tag on main.
#   release.sh parse <tag>                      prints version=, channel= and prerelease= for vX.Y.Z (production) or vX.Y.Z-rc.N (uat)
#   release.sh on-branch <tag> <branch>         fails unless the tag's commit is on <branch>
#   release.sh checksums <dir>                  writes <dir>/SHA256SUMS.txt for the zips in <dir>
#   release.sh verify <dir>                     checks the zips in <dir> against <dir>/SHA256SUMS.txt
set -euo pipefail

# sha256sum on Linux and Windows runners, shasum on macOS; both print and read the same format.
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

command="${1:-}"; shift || true
case "$command" in
  parse)
    tag="${1:-}"
    [[ "$tag" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)(-rc\.[0-9]+)?$ ]] || { echo "not a version tag (vX.Y.Z or vX.Y.Z-rc.N): $tag" >&2; exit 2; }
    if [[ -n "${BASH_REMATCH[2]}" ]]; then channel=uat prerelease=true; else channel=production prerelease=false; fi
    printf 'version=%s\nchannel=%s\nprerelease=%s\n' "${tag#v}" "$channel" "$prerelease" ;;
  on-branch)
    tag="${1:?tag}"; branch="${2:?branch}"
    git merge-base --is-ancestor "$tag^{commit}" "$branch" || { echo "tag $tag is not on $branch" >&2; exit 2; } ;;
  checksums)
    cd "${1:?directory}"; sha256 ./*.zip | sed 's# \./# #' > SHA256SUMS.txt ;;
  verify)
    cd "${1:?directory}"
    if command -v sha256sum >/dev/null; then sha256sum -c SHA256SUMS.txt; else shasum -a 256 -c SHA256SUMS.txt; fi ;;
  *) echo "usage: release.sh parse|on-branch|checksums|verify ..." >&2; exit 2 ;;
esac
