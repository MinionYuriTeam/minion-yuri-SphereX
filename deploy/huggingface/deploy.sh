#!/usr/bin/env bash
# Push the backend to a Hugging Face Space (Docker).
#
#   deploy/huggingface/deploy.sh                       # uses deploy/.env
#   deploy/huggingface/deploy.sh <hf-user>/<space>     # or name the Space here
#
# The Space is its own git repo on huggingface.co. This script clones it into a
# temporary folder, replaces its contents with the backend (api.py, pipeline/,
# requirements.txt) plus the Dockerfile and Space README from this folder,
# commits and pushes. Hugging Face then builds and starts the container.
#
# Login: put HF_USERNAME, HF_SPACE and HF_TOKEN (a WRITE token from
# huggingface.co/settings/tokens) in deploy/.env (copy deploy/.env.example).
# The token is handed to git by a one-off credential helper: it is not put in
# the URL, in git's config or in your keychain, and is never printed.
# Without HF_TOKEN, git asks for your username and the token as password.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BACKEND="$ROOT/backend"

# settings from deploy/.env (git-ignored): KEY=value lines; empty values are
# skipped and anything already set in your terminal wins
load_env() {
  [[ -f "$1" ]] || return 0
  local key value
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    value="${value%\"}"; value="${value#\"}"
    [[ -n "$value" && -z "${!key:-}" ]] && export "$key=$value"
  done < "$1"
  return 0
}
load_env "$ROOT/deploy/.env"

SPACE="${1:-${HF_SPACE:-}}"
if [[ ! "$SPACE" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "No Space given. Set HF_SPACE=<hf-user>/<space-name> in deploy/.env," >&2
  echo "or run: $0 <hf-user>/<space-name>" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
REMOTE="https://huggingface.co/spaces/$SPACE"

# git <args>, logging in with HF_USERNAME / HF_TOKEN when the token is set
git_hf() {
  if [[ -n "${HF_TOKEN:-}" ]]; then
    export HF_USERNAME="${HF_USERNAME:-${SPACE%%/*}}" HF_TOKEN
    git -c credential.helper= \
        -c credential.helper='!f() { echo "username=$HF_USERNAME"; echo "password=$HF_TOKEN"; }; f' \
        "$@"
  else
    git "$@"
  fi
}

echo "Cloning Space $SPACE ..."
git_hf clone --quiet --depth 1 "$REMOTE" "$WORK/space"

echo "Copying backend ..."
find "$WORK/space" -mindepth 1 -maxdepth 1 ! -name .git ! -name .gitattributes -exec rm -rf {} +
cp "$HERE/Dockerfile" "$HERE/README.md" "$WORK/space/"
cp "$BACKEND/api.py" "$BACKEND/requirements.txt" "$WORK/space/"
mkdir "$WORK/space/pipeline"
cp "$BACKEND"/pipeline/*.py "$WORK/space/pipeline/"

cd "$WORK/space"
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed since the last deploy."
  exit 0
fi
SOURCE="$(git -C "$ROOT" rev-parse --short HEAD)"
git -c user.name="minion-yuri deploy" -c user.email="deploy@localhost" \
  commit --quiet -m "Deploy backend from minion-yuri-SphereX@$SOURCE"
echo "Pushing ..."
git_hf push --quiet

HOST="$(echo "${SPACE/\//-}" | tr 'A-Z_.' 'a-z--')"
cat <<EOF

Pushed. Hugging Face is now building the container (a few minutes).
  Build logs:  https://huggingface.co/spaces/$SPACE  (Logs tab)
  Backend URL: https://$HOST.hf.space
  Check:       https://$HOST.hf.space/api/health

Next: pre-cache the presets with
  deploy/precache.sh
EOF
