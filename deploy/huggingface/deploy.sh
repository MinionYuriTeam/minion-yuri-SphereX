#!/usr/bin/env bash
# Push the backend to a Hugging Face Space (Docker).
#
#   deploy/huggingface/deploy.sh <hf-user>/<space-name>
#
# The Space is its own git repo on huggingface.co. This script clones it into a
# temporary folder, replaces its contents with the backend (api.py, pipeline/,
# requirements.txt) plus the Dockerfile and Space README from this folder,
# commits and pushes. Hugging Face then builds and starts the container.
#
# Login: git asks for a username and password on push. Use your Hugging Face
# username and an access token with WRITE permission as the password
# (huggingface.co/settings/tokens). Or set HF_TOKEN before running to skip the prompt.
set -euo pipefail

SPACE="${1:-}"
if [[ ! "$SPACE" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "usage: $0 <hf-user>/<space-name>   e.g. $0 raman/minion-yuri-api" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BACKEND="$ROOT/backend"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ -n "${HF_TOKEN:-}" ]]; then
  REMOTE="https://user:${HF_TOKEN}@huggingface.co/spaces/$SPACE"
else
  REMOTE="https://huggingface.co/spaces/$SPACE"
fi

echo "Cloning Space $SPACE ..."
git clone --quiet --depth 1 "$REMOTE" "$WORK/space"

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
git push --quiet

HOST="$(echo "${SPACE/\//-}" | tr 'A-Z_.' 'a-z--')"
cat <<EOF

Pushed. Hugging Face is now building the container (a few minutes).
  Build logs:  https://huggingface.co/spaces/$SPACE  (Logs tab)
  Backend URL: https://$HOST.hf.space
  Check:       https://$HOST.hf.space/api/health

Next: pre-cache the presets with
  deploy/precache.sh https://$HOST.hf.space
EOF
