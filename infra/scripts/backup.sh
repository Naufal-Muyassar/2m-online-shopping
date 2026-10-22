#!/usr/bin/env bash
# Daily encrypted Postgres backup to S3-compatible storage.
# Cron (VPS, 03:00): 0 3 * * * cd /opt/sembako && set -a && . ./.env && set +a && ./infra/scripts/backup.sh >> /var/log/sembako-backup.log 2>&1
# Requires: docker compose, gzip, openssl, aws cli. Env: BACKUP_S3_BUCKET, BACKUP_PASSPHRASE,
# optional BACKUP_S3_ENDPOINT, POSTGRES_USER, POSTGRES_DB.
set -euo pipefail

: "${BACKUP_S3_BUCKET:?}" "${BACKUP_PASSPHRASE:?}"
COMPOSE="docker compose -f infra/docker/compose.prod.yml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/sembako-${STAMP}.sql.gz.enc"
ENDPOINT=()
[ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT=(--endpoint-url "$BACKUP_S3_ENDPOINT")

trap 'rm -f "$FILE"' EXIT

$COMPOSE exec -T postgres pg_dump -U "${POSTGRES_USER:-app}" -d "${POSTGRES_DB:-sembako}" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"

aws s3 cp "$FILE" "s3://${BACKUP_S3_BUCKET}/db/$(basename "$FILE")" "${ENDPOINT[@]}"
echo "backup ok: $(basename "$FILE")"
