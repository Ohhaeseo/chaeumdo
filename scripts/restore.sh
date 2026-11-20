#!/bin/sh
# Restores one backup made by scripts/backup.sh into the production compose stack.
# Run from the repository root on the server:
#
#   scripts/restore.sh backups/2026-11-20T033000Z
#
# The backend is stopped while the database and the photo volume are replaced, then started again.
# Everything written since the backup is lost, so take a fresh backup first if the current data matters:
#   docker compose --env-file .env.production -f compose.production.yaml exec backup sh /opt/backup.sh
set -eu

if [ $# -ne 1 ] || [ ! -f "$1/db.dump" ] || [ ! -f "$1/media.tar.gz" ]; then
  echo "usage: $0 <backup directory containing db.dump and media.tar.gz>" >&2
  exit 2
fi
dir=$(cd "$1" && pwd)
compose="docker compose --env-file ${ENV_FILE:-.env.production} -f compose.production.yaml"

(cd "$dir" && sha256sum -c SHA256SUMS)

echo "This replaces the database and every photo with the backup in $dir."
printf "Type RESTORE to continue: "
read -r answer
[ "$answer" = "RESTORE" ] || { echo "cancelled"; exit 1; }

$compose stop backend backup
# --clean drops each object before recreating it, so the database ends up exactly as dumped.
$compose exec -T db pg_restore --clean --if-exists --no-owner -U chaeummdo -d chaeummdo < "$dir/db.dump"
# The photo volume is emptied and refilled through a throwaway backend container, which mounts it writable.
# It runs as root, so tar restores the files' original owner; the backend's entrypoint checks it again on start.
$compose run --rm --no-deps -T -v "$dir:/restore:ro" --entrypoint /bin/sh backend -c \
  'find /app/data/media -mindepth 1 -delete && tar -xzf /restore/media.tar.gz -C /app/data/media' \
  || { echo "photo restore failed; the database is already restored" >&2; exit 1; }
$compose start backend backup
echo "restored from $dir"
