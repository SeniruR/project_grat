#!/usr/bin/env bash
# Production deploy for Gratitude on RHEL (run on the app server).
# Safe to call from GitHub Actions over SSH after CI on main succeeds.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/project_grat}"
BRANCH="${DEPLOY_BRANCH:-main}"
API_SERVICE="${API_SERVICE:-gratitude-api}"

# Optional: /etc/gratitude/deploy.env with VITE_API_URL=https://api.example.com
if [[ -f /etc/gratitude/deploy.env ]]; then
  # shellcheck disable=SC1091
  source /etc/gratitude/deploy.env
fi

if [[ -z "${VITE_API_URL:-}" ]]; then
  echo "VITE_API_URL is required (export it or set in /etc/gratitude/deploy.env)" >&2
  exit 1
fi

echo "==> Deploying Gratitude in ${APP_ROOT} (branch ${BRANCH})"
cd "${APP_ROOT}"

echo "==> Syncing git"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> API dependencies + migrate"
cd "${APP_ROOT}/api"
npm ci
npx prisma generate
npx prisma migrate deploy

echo "==> Web build"
cd "${APP_ROOT}/web"
npm ci
npm run build

echo "==> Restart API"
if systemctl list-unit-files | grep -q "^${API_SERVICE}.service"; then
  sudo systemctl restart "${API_SERVICE}"
  sudo systemctl --no-pager --full status "${API_SERVICE}" || true
else
  echo "Warning: ${API_SERVICE}.service not found; skip restart" >&2
fi

if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t && sudo systemctl reload nginx || true
fi

echo "==> Health check"
curl -fsS "http://127.0.0.1:3001/health" || {
  echo "Health check failed" >&2
  exit 1
}

echo "==> Deploy finished"
