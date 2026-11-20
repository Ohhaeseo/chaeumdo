#!/bin/sh
# Backs up the database and the photo files together, as one directory per run:
#   $BACKUP_ROOT/<UTC time>/db.dump        pg_dump custom format (pg_restore reads it)
#   $BACKUP_ROOT/<UTC time>/media.tar.gz   every original and thumbnail under $MEDIA_DIR
#   $BACKUP_ROOT/<UTC time>/SHA256SUMS
# The database is dumped first: a photo uploaded meanwhile only adds an unused file to the archive.
# Connection settings come from the usual PG* variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
#
#   backup.sh           one backup now
#   backup.sh --daily   one now, then one every 24 hours (the compose "backup" service)
set -eu

BACKUP_ROOT=${BACKUP_ROOT:-/backups}
MEDIA_DIR=${MEDIA_DIR:-/media}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}

run_backup() {
  stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
  partial="$BACKUP_ROOT/.$stamp.partial"
  rm -rf "$partial"
  mkdir -p "$partial"
  pg_dump --format=custom --no-owner --file="$partial/db.dump"
  tar -czf "$partial/media.tar.gz" -C "$MEDIA_DIR" .
  (cd "$partial" && sha256sum db.dump media.tar.gz > SHA256SUMS)
  # A directory without the .partial prefix is always complete.
  mv "$partial" "$BACKUP_ROOT/$stamp"
  echo "backup: $BACKUP_ROOT/$stamp ($(du -sh "$BACKUP_ROOT/$stamp" | cut -f1))"
  # Keep the last BACKUP_KEEP_DAYS days, and never delete the newest backup.
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BACKUP_KEEP_DAYS" ! -name "$stamp" -exec rm -rf {} +
}

if [ "${1:-}" = "--daily" ]; then
  while true; do
    run_backup || echo "backup: FAILED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
    sleep 86400
  done
else
  run_backup
fi
