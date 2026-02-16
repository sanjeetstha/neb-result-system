#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${ENV_FILE:-$ROOT/.env}"
BACKUP_CONFIG_FILE="${BACKUP_CONFIG_FILE:-$ROOT/.backup.env}"

# Runtime values should win over env-file values.
DB_HOST_OVERRIDE="${DB_HOST-__UNSET__}"
DB_PORT_OVERRIDE="${DB_PORT-__UNSET__}"
DB_SOCKET_OVERRIDE="${DB_SOCKET-__UNSET__}"
DB_USER_OVERRIDE="${DB_USER-__UNSET__}"
DB_PASSWORD_OVERRIDE="${DB_PASSWORD-__UNSET__}"
DB_NAME_OVERRIDE="${DB_NAME-__UNSET__}"
BACKUP_ROOT_OVERRIDE="${BACKUP_ROOT-__UNSET__}"
RESTORE_DB_NAME_OVERRIDE="${RESTORE_DB_NAME-__UNSET__}"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  fi
}

load_env_file "$ENV_FILE"
load_env_file "$BACKUP_CONFIG_FILE"

[[ "$DB_HOST_OVERRIDE" != "__UNSET__" ]] && DB_HOST="$DB_HOST_OVERRIDE"
[[ "$DB_PORT_OVERRIDE" != "__UNSET__" ]] && DB_PORT="$DB_PORT_OVERRIDE"
[[ "$DB_SOCKET_OVERRIDE" != "__UNSET__" ]] && DB_SOCKET="$DB_SOCKET_OVERRIDE"
[[ "$DB_USER_OVERRIDE" != "__UNSET__" ]] && DB_USER="$DB_USER_OVERRIDE"
[[ "$DB_PASSWORD_OVERRIDE" != "__UNSET__" ]] && DB_PASSWORD="$DB_PASSWORD_OVERRIDE"
[[ "$DB_NAME_OVERRIDE" != "__UNSET__" ]] && DB_NAME="$DB_NAME_OVERRIDE"
[[ "$BACKUP_ROOT_OVERRIDE" != "__UNSET__" ]] && BACKUP_ROOT="$BACKUP_ROOT_OVERRIDE"
[[ "$RESTORE_DB_NAME_OVERRIDE" != "__UNSET__" ]] && RESTORE_DB_NAME="$RESTORE_DB_NAME_OVERRIDE"

: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"

DB_PORT="${DB_PORT:-3306}"
DB_SOCKET="${DB_SOCKET:-}"
if [[ -z "$DB_SOCKET" ]]; then
  : "${DB_HOST:?DB_HOST is required when DB_SOCKET is not set}"
else
  DB_HOST="${DB_HOST:-localhost}"
fi
BACKUP_ROOT="${BACKUP_ROOT:-/srv/backups/neb-result-system}"
RESTORE_DB_NAME="${RESTORE_DB_NAME:-$DB_NAME}"
mkdir -p "$BACKUP_ROOT/.tmp"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
}

require_cmd mysql
require_cmd mysqladmin
require_cmd gzip

BACKUP_FILE="${1:-$BACKUP_ROOT/latest.sql.gz}"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

TMP_CNF="$(mktemp "${BACKUP_ROOT}/.tmp/mysql-client-restore.XXXXXX.cnf")"
cleanup() {
  rm -f "$TMP_CNF"
}
trap cleanup EXIT

{
  echo "[client]"
  if [[ -n "$DB_SOCKET" ]]; then
    echo "socket=${DB_SOCKET}"
  else
    echo "host=${DB_HOST}"
    echo "port=${DB_PORT}"
  fi
  echo "user=${DB_USER}"
  echo "password=${DB_PASSWORD:-}"
} >"$TMP_CNF"
chmod 600 "$TMP_CNF"

if ! mysqladmin --defaults-extra-file="$TMP_CNF" ping --silent >/dev/null 2>&1; then
  if [[ -n "$DB_SOCKET" ]]; then
    echo "MySQL connection check failed for ${DB_USER} via socket ${DB_SOCKET}" >&2
  else
    echo "MySQL connection check failed for ${DB_USER}@${DB_HOST}:${DB_PORT}" >&2
  fi
  exit 1
fi

gzip -t "$BACKUP_FILE"

if [[ "${FORCE_RESTORE:-0}" != "1" ]]; then
  echo "Restore target DB: $RESTORE_DB_NAME"
  echo "Backup source: $BACKUP_FILE"
  read -r -p "Type RESTORE to continue: " CONFIRM
  if [[ "$CONFIRM" != "RESTORE" ]]; then
    echo "Restore cancelled."
    exit 1
  fi
fi

if [[ "${CREATE_DB_IF_MISSING:-1}" == "1" ]]; then
  mysql --defaults-extra-file="$TMP_CNF" -e "CREATE DATABASE IF NOT EXISTS \`$RESTORE_DB_NAME\`;"
fi

if [[ "${WIPE_DB_BEFORE_RESTORE:-0}" == "1" ]]; then
  echo "Wiping target database tables: $RESTORE_DB_NAME"
  mysql --defaults-extra-file="$TMP_CNF" "$RESTORE_DB_NAME" -Nse \
    "SET FOREIGN_KEY_CHECKS=0; SELECT CONCAT('DROP TABLE IF EXISTS \`', table_name, '\`;') FROM information_schema.tables WHERE table_schema='${RESTORE_DB_NAME}'; SET FOREIGN_KEY_CHECKS=1;" \
    | mysql --defaults-extra-file="$TMP_CNF" "$RESTORE_DB_NAME"
fi

echo "Restoring backup into $RESTORE_DB_NAME ..."
gzip -dc "$BACKUP_FILE" | mysql --defaults-extra-file="$TMP_CNF" "$RESTORE_DB_NAME"
echo "Restore completed."
