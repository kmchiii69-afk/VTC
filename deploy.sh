#!/bin/bash
set -e
echo "→ Fetching latest..."
git fetch consulting
git pull consulting main
echo "→ Pushing to GitHub..."
git push consulting main
echo "→ Deploying to gohconsulting.app..."
vercel --prod --yes
echo "✓ Done — live at gohconsulting.app"
