#!/usr/bin/env bash
# Dump the api database to a gzipped SQL file and delete dumps older than a retention window.
# Run it on the VPS, for example nightly from cron (see docs/deploy.md).
#
#   BACKUP_DIR      where dumps go (default ~/backups, outside the git checkout)
#   RETENTION_DAYS  how long to keep dumps (default 14)
set -euo pipefail

compose_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docker-compose.yml"
backup_dir="${BACKUP_DIR:-$HOME/backups}"
retention_days="${RETENTION_DAYS:-14}"

mkdir -p "$backup_dir"
target="$backup_dir/api-$(date +%F-%H%M).sql.gz"
tmp="$target.partial"
trap 'rm -f "$tmp"' EXIT

# -T: no TTY, so this also works from cron. pipefail makes a failed pg_dump fail the script.
docker compose -f "$compose_file" exec -T db pg_dump -U api api | gzip > "$tmp"

# Only a complete dump gets the final name.
mv "$tmp" "$target"
find "$backup_dir" -name 'api-*.sql.gz' -mtime "+$retention_days" -delete

echo "backup written: $target"
