#!/usr/bin/env bash
# Pull the latest code and restart. Run on the server from the project folder: bash deploy/update.sh
set -euo pipefail
git pull
npm ci
npm run db:migrate
npm run build
pm2 restart deploy/ecosystem.config.cjs --update-env
pm2 save
echo "Updated and restarted."
