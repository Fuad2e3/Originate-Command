#!/usr/bin/env bash
# =============================================================================
# Originate Command — Automated VPS Backup Script
# Creates transactional MySQL dumps and compressed JSON storage archives.
# Runs hourly via cron to ensure ZERO data loss.
# =============================================================================
set -e

BACKUP_ROOT="/var/backups/originate-command"
HOURLY_DIR="${BACKUP_ROOT}/hourly"
DAILY_DIR="${BACKUP_ROOT}/daily"
API_DATA_DIR="/var/www/originate-command/dev3/API/data"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DAY_STAMP=$(date +"%Y-%m-%d")

mkdir -p "${HOURLY_DIR}"
mkdir -p "${DAILY_DIR}"

SQL_TARGET="${HOURLY_DIR}/db_${TIMESTAMP}.sql.gz"
DATA_TARGET="${HOURLY_DIR}/data_${TIMESTAMP}.tar.gz"

echo "📦 [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting VPS backup..."

# 1. MySQL Transactional Dump (non-locking, consistent snapshot)
if command -v mysqldump >/dev/null 2>&1; then
  mysqldump --no-tablespaces --single-transaction --quick \
    -u originate_user -p'StrongDBPass123!' originate_command_db \
    | gzip > "${SQL_TARGET}"
  echo "  ✓ MySQL database dumped to: ${SQL_TARGET} ($(du -h "${SQL_TARGET}" | cut -f1))"
else
  echo "  ⚠️ mysqldump not found, skipping SQL dump"
fi

# 2. JSON Data Files Archive (originate_db.json, user data/, tombstones.json, presence.json)
if [ -d "${API_DATA_DIR}" ]; then
  tar -czf "${DATA_TARGET}" -C /var/www/originate-command/dev3/API data
  echo "  ✓ JSON data directory archived to: ${DATA_TARGET} ($(du -h "${DATA_TARGET}" | cut -f1))"
fi

# 3. Create / update latest pointers for instant recovery
if [ -f "${SQL_TARGET}" ]; then
  ln -sf "${SQL_TARGET}" "${BACKUP_ROOT}/latest_db.sql.gz"
fi
if [ -f "${DATA_TARGET}" ]; then
  ln -sf "${DATA_TARGET}" "${BACKUP_ROOT}/latest_data.tar.gz"
fi

# 4. Daily Archive Snapshot (one per day kept for 30 days)
DAILY_SQL="${DAILY_DIR}/db_${DAY_STAMP}.sql.gz"
DAILY_DATA="${DAILY_DIR}/data_${DAY_STAMP}.tar.gz"
if [ ! -f "${DAILY_SQL}" ] && [ -f "${SQL_TARGET}" ]; then
  cp "${SQL_TARGET}" "${DAILY_SQL}"
fi
if [ ! -f "${DAILY_DATA}" ] && [ -f "${DATA_TARGET}" ]; then
  cp "${DATA_TARGET}" "${DAILY_DATA}"
fi

# 5. Prune older backups:
# Retain hourly backups for 48 hours
find "${HOURLY_DIR}" -type f -mtime +2 -delete 2>/dev/null || true
# Retain daily backups for 30 days
find "${DAILY_DIR}" -type f -mtime +30 -delete 2>/dev/null || true

echo "✅ [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup finished successfully."
