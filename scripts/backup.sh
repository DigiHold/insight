#!/usr/bin/env bash
# Daily backup: dump of the ClickHouse tables (Native format) + the SQLite config database.
# 7-day rotation. Wire it up as a cron job (see below).
set -euo pipefail

BACKUP_DIR="/opt/insight/backups"
STAMP="$(date +%Y-%m-%d)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

# shellcheck disable=SC1091
source /opt/insight/.env

for T in events ai_hits revenue; do
  docker exec insight-clickhouse clickhouse-client \
    --user default --password "$CLICKHOUSE_PASSWORD" \
    --query "SELECT * FROM insight.$T FORMAT Native" | gzip > "$DEST/$T.native.gz"
done

# SQLite config database (users, sites, 2FA)
docker cp insight-app:/data/insight.db "$DEST/insight.db" 2>/dev/null || true

# Rotation: keep 7 days
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "Backup done: $DEST"

# Cron to install once (3 AM):
#   echo "0 3 * * * /opt/insight/scripts/backup.sh >> /var/log/insight-backup.log 2>&1" | crontab -
# Optional offsite: rclone copy "$DEST" b2:my-bucket/insight/  (object storage, a few cents a month)
