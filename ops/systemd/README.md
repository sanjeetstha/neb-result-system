# NEB Result System – DB Backup (systemd)

## Install (as root)
1. Copy unit files:

```
cp /srv/apps/neb-result-system/ops/systemd/neb-db-backup.service /etc/systemd/system/
cp /srv/apps/neb-result-system/ops/systemd/neb-db-backup.timer /etc/systemd/system/
```

2. Reload and enable:

```
systemctl daemon-reload
systemctl enable --now neb-db-backup.timer
systemctl status neb-db-backup.timer
```

## Manual run
```
systemctl start neb-db-backup.service
```

## Notes
- Backups are stored in `/srv/apps/neb-result-system/backups` by default.
- Retention is 14 days (change `RETENTION_DAYS` in the service unit or export in env).
- The script reads DB credentials from `/srv/apps/neb-result-system/backend/.env`.
