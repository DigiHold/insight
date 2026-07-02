#!/usr/bin/env bash
# Prepares a freshly installed Ubuntu 24.04 VPS to run Insight.
# Run once, as root on the VPS:  bash provision.sh
set -euo pipefail

echo "[1/5] Updating the system"
apt-get update -y && apt-get upgrade -y

echo "[2/5] Installing Docker + Compose"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "[3/5] Automatic security updates"
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "[4/5] Firewall: open only SSH, 80 and 443"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[5/5] Application directory"
mkdir -p /opt/insight
echo "Done. Clone the repo into /opt/insight, create the .env, then: docker compose up -d"
