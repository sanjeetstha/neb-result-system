#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${DB_HOST:?DB_HOST is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "mysqldump not found in PATH" >&2
  exit 1
fi
if ! command -v gzip >/dev/null 2>&1; then
  echo "gzip not found in PATH" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

TS="$(date +%F_%H-%M-%S)"
FILE="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"

export MYSQL_PWD="${DB_PASSWORD:-}"

mysqldump \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --triggers \
  -h "$DB_HOST" \
  -u "$DB_USER" \
  "$DB_NAME" \
  | gzip -9 > "$FILE"

unset MYSQL_PWD

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FILE" > "$FILE.sha256"
fi

find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name "*.sha256" -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $FILE"
