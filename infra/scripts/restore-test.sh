#!/usr/bin/env bash
# Restore the latest backup into a throwaway Postgres container and sanity-check it.
# Env: BACKUP_S3_BUCKET, BACKUP_PASSPHRASE, optional BACKUP_S3_ENDPOINT.
set -euo pipefail

: "${BACKUP_S3_BUCKET:?}" "${BACKUP_PASSPHRASE:?}"
ENDPOINT=()
[ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT=(--endpoint-url "$BACKUP_S3_ENDPOINT")
WORK="$(mktemp -d)"
NAME="sembako-restore-test"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

LATEST="$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/db/" "${ENDPOINT[@]}" | sort | tail -n1 | awk '{print $4}')"
[ -n "$LATEST" ] || { echo "no backups found" >&2; exit 1; }
aws s3 cp "s3://${BACKUP_S3_BUCKET}/db/${LATEST}" "$WORK/b.enc" "${ENDPOINT[@]}"

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=restore postgres:16 >/dev/null
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$WORK/b.enc" \
  | gunzip \
  | docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 >/dev/null

TABLES="$(docker exec "$NAME" psql -U postgres -tAc "select count(*) from information_schema.tables where table_schema='public'")"
[ "$TABLES" -gt 0 ] || { echo "restore produced no tables" >&2; exit 1; }
echo "restore test ok: ${LATEST} (${TABLES} tables)"
