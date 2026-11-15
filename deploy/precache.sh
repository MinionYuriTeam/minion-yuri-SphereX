#!/usr/bin/env bash
# Load the 5 presets once so they're cached on the server (F8: each preset
# should play within 10 s). Run after every deploy, and after a Space wakes up
# from sleep, because the cache doesn't survive a restart.
#
#   deploy/precache.sh                                         # URL from deploy/.env, 5' field
#   deploy/precache.sh https://<user>-<space>.hf.space         # or give the URL
#   deploy/precache.sh https://<user>-<space>.hf.space 5 10    # several fields
#
# Positions and arrays must match frontend/minion-yuri/src/data/target.js
# exactly: the backend caches per exact position, field of view and array.
set -uo pipefail

# settings from deploy/.env (git-ignored): BACKEND_URL, or derived from HF_SPACE
load_env() {  # KEY=value lines; empty values skipped; terminal settings win
  [[ -f "$1" ]] || return 0
  local key value
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    value="${value%\"}"; value="${value#\"}"
    [[ -n "$value" && -z "${!key:-}" ]] && export "$key=$value"
  done < "$1"
  return 0
}
load_env "$(cd "$(dirname "$0")" && pwd)/.env"
DEFAULT_URL="${BACKEND_URL:-}"
if [[ -z "$DEFAULT_URL" && -n "${HF_SPACE:-}" ]]; then
  DEFAULT_URL="https://$(echo "${HF_SPACE/\//-}" | tr 'A-Z_.' 'a-z--').hf.space"
fi

if [[ "${1:-}" == http* ]]; then
  BASE="$1"; shift
else
  BASE="$DEFAULT_URL"
fi
if [[ -z "$BASE" ]]; then
  echo "No backend URL. Set HF_SPACE (or BACKEND_URL) in deploy/.env, or run:" >&2
  echo "  $0 https://<user>-<space>.hf.space [fov ...]" >&2
  exit 1
fi
BASE="${BASE%/}"
if [[ $# -gt 0 ]]; then FOVS=("$@"); else FOVS=(5); fi

#        name             ra          dec         array
TARGETS=("Barnard's Star|269.446074|4.770708|1"
         "WISE 0855|133.757786|-7.242023|6"
         "Epsilon Indi B|331.0984|-56.801256|3"
         "RW Aurigae|76.956526|30.401438|3"
         "R Draconis|248.167611|66.754979|3")

echo "Waking up $BASE ..."
curl -s --max-time 300 "$BASE/api/health" && echo

for fov in "${FOVS[@]}"; do
  for t in "${TARGETS[@]}"; do
    IFS='|' read -r name ra dec array <<<"$t"
    start=$(date +%s)
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 600 \
      "$BASE/api/frames?ra=$ra&dec=$dec&fov=$fov&array=$array")
    printf '%-16s fov %-3s array %s  HTTP %s  %ss\n' "$name" "$fov" "$array" "$code" "$(( $(date +%s) - start ))"
  done
done
echo "Done. Run it again: every line should now take only a few seconds."
