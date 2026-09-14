#!/bin/bash
# push.sh — push this repo to GitHub and print the Pages setup steps.
#
# Auth: set GITHUB_TOKEN (a classic PAT with "repo" scope, or a fine-grained
# token with Contents:Read+Write on the target repo) OR have a git credential
# helper / SSH key already configured.
#
# Usage:
#   ./push.sh <github-username> <repo-name>
#   GITHUB_TOKEN=ghp_xxx ./push.sh <github-username> <repo-name>
set -euo pipefail
cd "$(dirname "$0")"

USER="${1:?usage: ./push.sh <github-username> <repo-name>}"
REPO="${2:?usage: ./push.sh <github-username> <repo-name>}"

# make sure docs/ is fresh
node build_static.mjs

git add -A
if ! git diff --cached --quiet; then
  git -c user.name="${USER}" -c user.email="${USER}@users.noreply.github.com" \
      commit -m "deploy: $(date -u +'%Y-%m-%d %H:%M UTC')"
fi

git remote remove origin 2>/dev/null || true
if [ -n "${GITHUB_TOKEN:-}" ]; then
  # embed the token for this push (not stored in config)
  git push "https://x-access-token:${GITHUB_TOKEN}@github.com/${USER}/${REPO}.git" main:main \
      -u 2>&1 | sed "s/${GITHUB_TOKEN}/***/"
  git remote add origin "https://github.com/${USER}/${REPO}.git"
else
  git remote add origin "https://github.com/${USER}/${REPO}.git"
  git push -u origin main
fi

echo ""
echo "============================================================"
echo "Pushed to https://github.com/${USER}/${REPO}"
echo ""
echo "Enable GitHub Pages:"
echo "  1. https://github.com/${USER}/${REPO}/settings/pages"
echo "  2. Source: 'Deploy from a branch'  ->  branch 'main', folder '/docs'"
echo "  3. Site goes live at:  https://${USER}.github.io/${REPO}/"
echo ""
echo "Live price updates (every ~15 min):"
echo "  https://github.com/${USER}/${REPO}/actions   (workflow: 'Update prices')"
echo "  (first run may take a minute; you can also trigger it manually)"
echo "============================================================"
