# NEB Result System – Automatic DB Backup (systemd)

This setup creates encrypted-permission MySQL dumps automatically and stores them on server storage for later transfer/restore.

## Backup behavior
- Runs every 6 hours via `neb-db-backup.timer`.
- Creates two files per run:
  - full dump: `*.sql.gz`
  - schema-only dump: `*.schema.sql.gz`
- Creates integrity/metadata files:
  - checksum: `*.sha256`
  - metadata: `*.meta.json`
- Maintains symlinks:
  - `latest.sql.gz`
  - `latest.schema.sql.gz`
  - `latest.meta.json`
- Output directory default: `/srv/backups/neb-result-system/YYYY/MM`
  (date-wise folders, with day-level granularity)
  `/srv/backups/neb-result-system/YYYY/MM/DD`

## Configure backup settings
1. Create backup config:

```bash
cp /srv/apps/neb-result-system/backend/.backup.env.example /srv/apps/neb-result-system/backend/.backup.env
```

2. Edit `/srv/apps/neb-result-system/backend/.backup.env` as needed.

Important variables:
- `BACKUP_ROOT` backup destination
- `RETENTION_DAYS` age-based cleanup
- `KEEP_LAST` keep latest N full dumps
- `VERIFY_BACKUP=1` enable gzip integrity check
- `DB_SOCKET` use MySQL unix socket (recommended for local server)

## Install systemd units (as root)
```bash
cp /srv/apps/neb-result-system/ops/systemd/neb-db-backup.service /etc/systemd/system/
cp /srv/apps/neb-result-system/ops/systemd/neb-db-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now neb-db-backup.timer
systemctl status neb-db-backup.timer
```

## Manual backup run
```bash
systemctl start neb-db-backup.service
systemctl status neb-db-backup.service
```

## Cron alternative (if not using systemd timer)
```bash
cd /srv/apps/neb-result-system/backend/scripts
./backup.sh install-cron "15 */6 * * *"
./backup.sh show-cron
```

## Check backup files/log
```bash
ls -lah /srv/backups/neb-result-system
find /srv/backups/neb-result-system -type f -name "*.sql.gz" | tail -n 5
tail -n 100 /srv/backups/neb-result-system/backup.log
```

## Transfer backup to another server
Example:
```bash
scp /srv/backups/neb-result-system/latest.sql.gz user@REMOTE_HOST:/srv/backups/neb/
scp /srv/backups/neb-result-system/latest.meta.json user@REMOTE_HOST:/srv/backups/neb/
```

## Restore on another server
Use script:
```bash
FORCE_RESTORE=1 \
ENV_FILE=/srv/apps/neb-result-system/backend/.env \
BACKUP_CONFIG_FILE=/srv/apps/neb-result-system/backend/.backup.env \
/bin/bash /srv/apps/neb-result-system/backend/scripts/db_restore.sh /srv/backups/neb/latest.sql.gz
```

Optional:
- `RESTORE_DB_NAME=neb_results_dev_new` restore into another DB name.
- `WIPE_DB_BEFORE_RESTORE=1` drop existing tables before restore.
