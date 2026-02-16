#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${ENV_FILE:-$ROOT/.env}"
BACKUP_CONFIG_FILE="${BACKUP_CONFIG_FILE:-$ROOT/.backup.env}"

# If values are passed at runtime, keep them over values from env files.
DB_HOST_OVERRIDE="${DB_HOST-__UNSET__}"
DB_PORT_OVERRIDE="${DB_PORT-__UNSET__}"
DB_USER_OVERRIDE="${DB_USER-__UNSET__}"
DB_PASSWORD_OVERRIDE="${DB_PASSWORD-__UNSET__}"
DB_NAME_OVERRIDE="${DB_NAME-__UNSET__}"
BACKUP_ROOT_OVERRIDE="${BACKUP_ROOT-__UNSET__}"
BACKUP_PREFIX_OVERRIDE="${BACKUP_PREFIX-__UNSET__}"
RETENTION_DAYS_OVERRIDE="${RETENTION_DAYS-__UNSET__}"
KEEP_LAST_OVERRIDE="${KEEP_LAST-__UNSET__}"
VERIFY_BACKUP_OVERRIDE="${VERIFY_BACKUP-__UNSET__}"
COMPRESS_LEVEL_OVERRIDE="${COMPRESS_LEVEL-__UNSET__}"
BACKUP_LOG_FILE_OVERRIDE="${BACKUP_LOG_FILE-__UNSET__}"
LOCK_FILE_OVERRIDE="${LOCK_FILE-__UNSET__}"

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
[[ "$DB_USER_OVERRIDE" != "__UNSET__" ]] && DB_USER="$DB_USER_OVERRIDE"
[[ "$DB_PASSWORD_OVERRIDE" != "__UNSET__" ]] && DB_PASSWORD="$DB_PASSWORD_OVERRIDE"
[[ "$DB_NAME_OVERRIDE" != "__UNSET__" ]] && DB_NAME="$DB_NAME_OVERRIDE"
[[ "$BACKUP_ROOT_OVERRIDE" != "__UNSET__" ]] && BACKUP_ROOT="$BACKUP_ROOT_OVERRIDE"
[[ "$BACKUP_PREFIX_OVERRIDE" != "__UNSET__" ]] && BACKUP_PREFIX="$BACKUP_PREFIX_OVERRIDE"
[[ "$RETENTION_DAYS_OVERRIDE" != "__UNSET__" ]] && RETENTION_DAYS="$RETENTION_DAYS_OVERRIDE"
[[ "$KEEP_LAST_OVERRIDE" != "__UNSET__" ]] && KEEP_LAST="$KEEP_LAST_OVERRIDE"
[[ "$VERIFY_BACKUP_OVERRIDE" != "__UNSET__" ]] && VERIFY_BACKUP="$VERIFY_BACKUP_OVERRIDE"
[[ "$COMPRESS_LEVEL_OVERRIDE" != "__UNSET__" ]] && COMPRESS_LEVEL="$COMPRESS_LEVEL_OVERRIDE"
[[ "$BACKUP_LOG_FILE_OVERRIDE" != "__UNSET__" ]] && BACKUP_LOG_FILE="$BACKUP_LOG_FILE_OVERRIDE"
[[ "$LOCK_FILE_OVERRIDE" != "__UNSET__" ]] && LOCK_FILE="$LOCK_FILE_OVERRIDE"

: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command not found: $cmd" >&2
    exit 1
  fi
}

require_cmd mysqldump
require_cmd mysqladmin
require_cmd gzip
require_cmd flock

DB_PORT="${DB_PORT:-3306}"
DB_SOCKET="${DB_SOCKET:-}"
if [[ -z "$DB_SOCKET" ]]; then
  : "${DB_HOST:?DB_HOST is required when DB_SOCKET is not set}"
else
  DB_HOST="${DB_HOST:-localhost}"
fi
BACKUP_ROOT="${BACKUP_ROOT:-/srv/backups/neb-result-system}"
BACKUP_PREFIX="${BACKUP_PREFIX:-nebdb}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
KEEP_LAST="${KEEP_LAST:-120}"
VERIFY_BACKUP="${VERIFY_BACKUP:-1}"
COMPRESS_LEVEL="${COMPRESS_LEVEL:-9}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-$BACKUP_ROOT/backup.log}"
LOCK_FILE="${LOCK_FILE:-$BACKUP_ROOT/.db_backup.lock}"

mkdir -p "$BACKUP_ROOT" "$BACKUP_ROOT/.tmp"
touch "$BACKUP_LOG_FILE"

log() {
  local msg="$1"
  printf '[%s] %s\n' "$(date '+%F %T')" "$msg" | tee -a "$BACKUP_LOG_FILE"
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Backup already running (lock: $LOCK_FILE)."
  exit 1
fi

TMP_CNF="$(mktemp "$BACKUP_ROOT/.tmp/mysql-client.XXXXXX.cnf")"
cleanup() {
  rm -f "${TMP_CNF:-}" "${TMP_FULL:-}" "${TMP_SCHEMA:-}"
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
    log "MySQL connection check failed for ${DB_USER} via socket ${DB_SOCKET}."
  else
    log "MySQL connection check failed for ${DB_USER}@${DB_HOST}:${DB_PORT}."
  fi
  exit 1
fi

YEAR_DIR="$(date +%Y)"
MONTH_DIR="$(date +%m)"
DAY_DIR="$(date +%d)"
TARGET_DIR="$BACKUP_ROOT/$YEAR_DIR/$MONTH_DIR/$DAY_DIR"
mkdir -p "$TARGET_DIR"

TS="$(date +%Y%m%d_%H%M%S)"
BASENAME="${BACKUP_PREFIX}_${DB_NAME}_${TS}"
FULL_FILE="$TARGET_DIR/${BASENAME}.sql.gz"
SCHEMA_FILE="$TARGET_DIR/${BASENAME}.schema.sql.gz"
META_FILE="$TARGET_DIR/${BASENAME}.meta.json"
SHA_FILE="$FULL_FILE.sha256"

TMP_FULL="$FULL_FILE.tmp"
TMP_SCHEMA="$SCHEMA_FILE.tmp"

DUMP_OPTS=(
  "--defaults-extra-file=$TMP_CNF"
  "--single-transaction"
  "--quick"
  "--routines"
  "--events"
  "--triggers"
  "--default-character-set=utf8mb4"
  "--hex-blob"
  "--databases"
  "$DB_NAME"
)

if mysqldump --help 2>/dev/null | grep -q -- "--set-gtid-purged"; then
  DUMP_OPTS+=("--set-gtid-purged=OFF")
fi

if mysqldump --help 2>/dev/null | grep -q -- "--column-statistics"; then
  DUMP_OPTS+=("--column-statistics=0")
fi

log "Starting full backup for database '$DB_NAME' to $FULL_FILE"
mysqldump "${DUMP_OPTS[@]}" | gzip "-$COMPRESS_LEVEL" > "$TMP_FULL"

log "Starting schema-only backup to $SCHEMA_FILE"
mysqldump "${DUMP_OPTS[@]}" --no-data | gzip "-$COMPRESS_LEVEL" > "$TMP_SCHEMA"

if [[ "$VERIFY_BACKUP" == "1" ]]; then
  log "Verifying gzip integrity"
  gzip -t "$TMP_FULL"
  gzip -t "$TMP_SCHEMA"
fi

mv "$TMP_FULL" "$FULL_FILE"
mv "$TMP_SCHEMA" "$SCHEMA_FILE"

SHA256=""
if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$FULL_FILE" | awk '{print $1}')"
  printf '%s  %s\n' "$SHA256" "$(basename "$FULL_FILE")" > "$SHA_FILE"
fi

FULL_SIZE_BYTES="$(wc -c < "$FULL_FILE" | tr -d ' ')"
SCHEMA_SIZE_BYTES="$(wc -c < "$SCHEMA_FILE" | tr -d ' ')"
CREATED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
HOSTNAME_VALUE="$(hostname -f 2>/dev/null || hostname)"

cat >"$META_FILE" <<EOF
{
  "created_at_utc": "$CREATED_AT_UTC",
  "hostname": "$HOSTNAME_VALUE",
  "db_host": "$DB_HOST",
  "db_port": $DB_PORT,
  "db_socket": "$DB_SOCKET",
  "db_name": "$DB_NAME",
  "backup_file": "$(basename "$FULL_FILE")",
  "backup_size_bytes": $FULL_SIZE_BYTES,
  "schema_file": "$(basename "$SCHEMA_FILE")",
  "schema_size_bytes": $SCHEMA_SIZE_BYTES,
  "sha256": "$SHA256"
}
EOF

ln -sfn "$FULL_FILE" "$BACKUP_ROOT/latest.sql.gz"
ln -sfn "$SCHEMA_FILE" "$BACKUP_ROOT/latest.schema.sql.gz"
ln -sfn "$META_FILE" "$BACKUP_ROOT/latest.meta.json"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS > 0 )); then
  find "$BACKUP_ROOT" -type f \
    \( -name "*.sql.gz" -o -name "*.meta.json" -o -name "*.sha256" \) \
    -mtime +"$RETENTION_DAYS" -print -delete >>"$BACKUP_LOG_FILE" 2>&1 || true
fi

if [[ "$KEEP_LAST" =~ ^[0-9]+$ ]] && (( KEEP_LAST > 0 )); then
  mapfile -t ALL_FULL_DUMPS < <(
    find "$BACKUP_ROOT" -type f -name "${BACKUP_PREFIX}_${DB_NAME}_*.sql.gz" \
      ! -name "*.schema.sql.gz" | sort -r
  )
  if (( ${#ALL_FULL_DUMPS[@]} > KEEP_LAST )); then
    for OLD in "${ALL_FULL_DUMPS[@]:KEEP_LAST}"; do
      BASE="${OLD%.sql.gz}"
      rm -f "$OLD" "$BASE.schema.sql.gz" "$BASE.meta.json" "$OLD.sha256"
    done
  fi
fi

find "$BACKUP_ROOT" -type d -empty -delete 2>/dev/null || true
log "Backup completed successfully: $FULL_FILE"
