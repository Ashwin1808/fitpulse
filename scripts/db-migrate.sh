#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/db/migrations"

if [[ -n "${DATABASE_URL:-}" ]]; then
  DB_URL="${DATABASE_URL}"
else
  : "${POSTGRES_HOST:=localhost}"
  : "${POSTGRES_PORT:=5432}"
  : "${POSTGRES_DB:=fitpulse}"
  : "${POSTGRES_USER:=fitpulse}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required when DATABASE_URL is not set}"
  DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run database migrations" >&2
  exit 1
fi

shopt -s nullglob
for migration in "${MIGRATIONS_DIR}"/*.sql; do
  echo "Applying ${migration#$ROOT_DIR/}"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${migration}"
done

echo "Database migrations complete"
