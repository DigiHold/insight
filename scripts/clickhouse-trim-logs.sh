#!/usr/bin/env bash
# One time cleanup after updating to clickhouse/config.d/logs.xml.
# Before that file existed, ClickHouse wrote its own diagnostics into system.* tables that never
# expire (27.7 GB on the production VPS, for 3.3 MB of analytics). The config stops the writing;
# this script reclaims the space already taken. It only drops `system` log tables the config no
# longer uses, plus the renamed copies ClickHouse leaves behind (query_log_0 and so on). The
# `insight` database is never read or written.
set -euo pipefail

# shellcheck disable=SC1091
source /opt/insight/.env

ch() {
  docker exec insight-clickhouse clickhouse-client \
    --user default --password "$CLICKHOUSE_PASSWORD" --query "$1"
}

cfg() {
  docker exec insight-clickhouse clickhouse extract-from-config \
    --config-file /etc/clickhouse-server/config.xml --key "$1" 2>/dev/null
}

# Run only once the new config is proven live, or ClickHouse would recreate what gets dropped.
# A failed read counts as "not live", so a missing container or a typo stops the script here.
if [ "$(cfg logger.level || true)" != "warning" ] || cfg text_log.table >/dev/null; then
  echo "clickhouse/config.d/logs.xml is not active yet: git pull, then docker compose up -d clickhouse." >&2
  exit 1
fi

size() {
  ch "SELECT formatReadableSize(sum(bytes_on_disk)) FROM system.parts WHERE active AND database = 'system'"
}
echo "system tables before: $(size)"

for T in text_log trace_log processors_profile_log metric_log asynchronous_metric_log query_metric_log part_log; do
  ch "DROP TABLE IF EXISTS system.$T SYNC"
done

# Copies ClickHouse renamed when a log table's definition changed, such as query_log_0.
for T in $(ch "SELECT name FROM system.tables WHERE database = 'system' AND match(name, '_log_[0-9]+\$')"); do
  ch "DROP TABLE IF EXISTS system.$T SYNC"
done

# The server's own text log files, written at trace level until now.
docker exec insight-clickhouse sh -c \
  ': > /var/log/clickhouse-server/clickhouse-server.log; : > /var/log/clickhouse-server/clickhouse-server.err.log; rm -f /var/log/clickhouse-server/*.gz'

echo "system tables after: $(size)"
df -h / | tail -1
