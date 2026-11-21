#!/usr/bin/env bash
# SYNCED FROM taliferro-ui/scripts/ensure-ui-package.sh - edit it there, then
# run taliferro-ui/scripts/update-apps.sh to copy it into every app.
#
# Run by each app's deploy.sh before it builds. Makes sure node_modules holds
# exactly the @taliferro/ui version package-lock.json asks for. deploy.sh never
# reinstalls packages on its own, so after a version bump (or the switch from
# the old ../../taliferro-ui folder) the build would otherwise use a stale copy.
# When the versions already match, this does nothing and takes no time.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."

want="$(node -p "((require('./package-lock.json').packages || {})['node_modules/@taliferro/ui'] || {}).version || ''")"
if [ -z "${want}" ]; then
  exit 0 # this app doesn't use @taliferro/ui
fi

have="$(node -p "try { require('./node_modules/@taliferro/ui/package.json').version } catch (e) { '' }")"
if [ "${want}" = "${have}" ] && [ ! -L node_modules/@taliferro/ui ]; then
  echo "@taliferro/ui ${have} is installed."
  exit 0
fi

if [ -L node_modules/@taliferro/ui ]; then
  echo "@taliferro/ui is still the old link to the taliferro-ui folder; the lockfile wants ${want} from the registry."
else
  echo "@taliferro/ui: the lockfile wants ${want}, but ${have:-nothing} is installed."
fi
echo "Signing in to the package registry and reinstalling packages..."
npm run auth:ui >/dev/null
npm ci --no-audit --no-fund
echo "@taliferro/ui $(node -p "require('./node_modules/@taliferro/ui/package.json').version") is installed."
