#!/usr/bin/env bash
# Deploy on the VPS: pull the prebuilt image from GHCR and restart. No build on the VPS.
set -euo pipefail
cd /opt/insight
git pull --ff-only
docker compose -p insight pull
docker compose -p insight up -d
echo "Deploy done: $(date)"
