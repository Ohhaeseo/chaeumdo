#!/bin/sh
# Starts as root only to hand the photo volume to the app user, then runs the backend as that user.
# Whether Docker gives a new named volume the owner of the image's directory depends on the engine and on
# which container mounts the volume first; a root-owned volume would make every upload fail. So the owner
# is checked on every start, and fixed (recursively) only when it is wrong.
set -eu

media="${MEDIA_ROOT:-/app/data/media}"
mkdir -p "$media"
if [ "$(stat -c %u "$media")" != "$(id -u app)" ]; then
  echo "docker-entrypoint: giving $media to the app user"
  chown -R app:app "$media"
fi
exec su-exec app java -XX:MaxRAMPercentage=75.0 -jar /app/app.jar "$@"
