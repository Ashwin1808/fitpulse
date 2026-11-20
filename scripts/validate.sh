#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Compose config =="
docker compose config --quiet

echo "== Python syntax =="
python3 -m compileall -q services/worker-python-service/app

echo "== Node typecheck =="
if [[ -d services/commerce-node-service/node_modules ]]; then
  (cd services/commerce-node-service && npm run typecheck)
else
  echo "skip commerce-node-service typecheck (node_modules missing; run npm ci first)"
fi

echo "== Web typecheck =="
if [[ -d services/web-ui/node_modules ]]; then
  (cd services/web-ui && npm run typecheck)
else
  echo "skip web-ui typecheck (node_modules missing; run npm ci first)"
fi

echo "== Java package =="
if command -v mvn >/dev/null 2>&1; then
  (cd services/tracking-java-service && mvn -q -DskipTests package)
else
  echo "skip Java package (mvn not installed)"
fi

echo "Validation complete"
