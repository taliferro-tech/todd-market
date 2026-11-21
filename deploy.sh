#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Install the @taliferro/ui version the lockfile asks for, if it isn't already
# (deploys never reinstall packages otherwise). No-op when it matches.
./scripts/ensure-ui-package.sh

trap 'echo "Deploy aborted - a previous step failed, nothing was deployed." >&2' ERR

echo "Running TODD Market production hosting deploy"
firebase use taliferrotech

echo "Building the production TODD Market bundle..."
npm run build

echo "Running unit tests..."
npm run test:ci

echo "Running end-to-end tests (needs the backend repo next to web-products; see README)..."
npm run e2e

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ -n "$(git status --porcelain)" ]; then
  echo "Build and tests passed - committing changes before deploy..."
  VERSION="$(node -p "require('./package.json').version")"
  git add -A
  git commit -m "Deploy: v${VERSION}"
fi

echo "Deploying TODD Market to Firebase Hosting site todd-market..."
firebase deploy --project taliferrotech --only hosting:todd-market

echo "TODD Market hosting deploy complete."
