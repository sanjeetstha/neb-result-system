#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BACKUP_SCRIPT="$SCRIPT_DIR/db_backup.sh"
ENV_FILE_DEFAULT="$ROOT/.env"
BACKUP_ENV_DEFAULT="$ROOT/.backup.env"
CRON_LOG_DEFAULT="/srv/backups/neb-result-system/cron-backup.log"
CRON_TAG="# neb-result-system-db-backup"

usage() {
  cat <<'EOF'
Usage:
  backup.sh run
  backup.sh install-cron [CRON_SCHEDULE]
  backup.sh remove-cron
  backup.sh show-cron

Commands:
  run            Run manual backup now.
  install-cron   Install cron automation. Default schedule: every 6 hours.
  remove-cron    Remove backup cron entry.
  show-cron      Show matching cron entry.

Examples:
  ./backup.sh run
  ./backup.sh install-cron "15 */6 * * *"
  ./backup.sh install-cron "0 2 * * *"      # daily 2:00 AM
EOF
}

run_backup() {
  ENV_FILE="${ENV_FILE:-$ENV_FILE_DEFAULT}" \
  BACKUP_CONFIG_FILE="${BACKUP_CONFIG_FILE:-$BACKUP_ENV_DEFAULT}" \
  /bin/bash "$BACKUP_SCRIPT"
}

install_cron() {
  local schedule="${1:-15 */6 * * *}"
  local env_file="${ENV_FILE:-$ENV_FILE_DEFAULT}"
  local backup_env="${BACKUP_CONFIG_FILE:-$BACKUP_ENV_DEFAULT}"
  local cron_log="${CRON_LOG_FILE:-$CRON_LOG_DEFAULT}"

  local line="${schedule} ENV_FILE=${env_file} BACKUP_CONFIG_FILE=${backup_env} /bin/bash ${BACKUP_SCRIPT} >> ${cron_log} 2>&1 ${CRON_TAG}"

  local current
  current="$(crontab -l 2>/dev/null || true)"
  if printf '%s\n' "$current" | grep -Fq "$CRON_TAG"; then
    current="$(printf '%s\n' "$current" | grep -Fv "$CRON_TAG" || true)"
  fi

  {
    printf '%s\n' "$current"
    printf '%s\n' "$line"
  } | sed '/^[[:space:]]*$/N;/^\n$/D' | crontab -

  echo "Cron backup installed."
  echo "Schedule: $schedule"
  echo "Entry tag: $CRON_TAG"
}

remove_cron() {
  local current
  current="$(crontab -l 2>/dev/null || true)"
  if ! printf '%s\n' "$current" | grep -Fq "$CRON_TAG"; then
    echo "No backup cron entry found."
    exit 0
  fi

  printf '%s\n' "$current" | grep -Fv "$CRON_TAG" | crontab -
  echo "Backup cron entry removed."
}

show_cron() {
  local current
  current="$(crontab -l 2>/dev/null || true)"
  printf '%s\n' "$current" | grep -F "$CRON_TAG" || true
}

cmd="${1:-run}"
case "$cmd" in
  run)
    run_backup
    ;;
  install-cron)
    install_cron "${2:-}"
    ;;
  remove-cron)
    remove_cron
    ;;
  show-cron)
    show_cron
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac

