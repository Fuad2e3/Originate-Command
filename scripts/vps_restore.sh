#!/usr/bin/env bash
# =============================================================================
# Originate Command — Instant VPS Restore Script
# Restores MySQL database and JSON storage files from backup snapshots.
# =============================================================================
set -e

BACKUP_ROOT="/var/backups/originate-command"
API_DIR="/var/www/originate-command/dev3/API"

SQL_BACKUP="${1:-${BACKUP_ROOT}/latest_db.sql.gz}"
DATA_BACKUP="${2:-${BACKUP_ROOT}/latest_data.tar.gz}"

echo "🔄 Starting Originate Command Restore..."
echo "  SQL Backup : ${SQL_BACKUP}"
echo "  Data Backup: ${DATA_BACKUP}"

if [ ! -f "${SQL_BACKUP}" ]; then
  echo "❌ Error: SQL backup file not found at ${SQL_BACKUP}"
  exit 1
fi

if [ ! -f "${DATA_BACKUP}" ]; then
  echo "❌ Error: Data backup file not found at ${DATA_BACKUP}"
  exit 1
fi

echo "⏸️ Pausing PM2 workers during restore..."
pm2 stop all 2>/dev/null || true

echo "📥 Restoring MySQL database..."
gunzip < "${SQL_BACKUP}" | mysql -u originate_user -p'StrongDBPass123!' originate_command_db
echo "  ✓ MySQL database restored."

echo "📥 Restoring JSON storage files..."
tar -xzf "${DATA_BACKUP}" -C "${API_DIR}/"
echo "  ✓ JSON files restored."

echo "▶️ Restarting PM2 workers..."
pm2 restart all

echo "✅ Restore completed successfully! All data is live and healthy."
