#!/bin/bash
set -e

ENV="${RANGEGUARD_ENV:-testnet}"
DB_FILE="/app/data/bot-${ENV}.db"

# Ensure data + vault dirs exist and are writable (Railway volumes mount as root)
mkdir -p /app/data "$HOME/.rangeguard" 2>/dev/null || true

# Track if this is a fresh deploy (before bootstrap creates the DB)
FRESH_DEPLOY="false"
if [ ! -f "$DB_FILE" ]; then
  FRESH_DEPLOY="true"
fi

# Bootstrap vault from WALLET_KEYS env var
# Re-bootstrap on fresh deploy or if vault is missing
if [ -n "$WALLET_KEYS" ]; then
  VAULT_FILE="${VAULT_PATH:-$HOME/.rangeguard/vault-${ENV}.enc}"
  if [ ! -f "$VAULT_FILE" ] || [ "$FRESH_DEPLOY" = "true" ]; then
    echo "WALLET_KEYS detected — bootstrapping vault..."
    rm -f "$VAULT_FILE" 2>/dev/null || true
    node --no-warnings --import tsx scripts/bootstrap-vault.ts
  else
    echo "Vault already exists — skipping bootstrap"
  fi
fi

# Seed DB if needed (scripts are idempotent — safe to run on every deploy)
if [ "$FRESH_DEPLOY" = "true" ]; then
  if [ "$DEMO_SEED" = "true" ]; then
    echo "First run + DEMO_SEED=true — seeding demo data..."
    node --no-warnings --import tsx scripts/demo-seed.ts
  elif [ "$TESTNET_SEED" = "true" ]; then
    echo "First run + TESTNET_SEED=true — creating pool config..."
    node --no-warnings --import tsx scripts/testnet-seed-railway.ts
  else
    echo "First run ($ENV) — running migrations only..."
    node --no-warnings --import tsx -e "
      import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
      import { runMigrations } from './packages/db/src/migrations/001_initial.js';
      const db = getDatabase('${DB_FILE}');
      runMigrations(db);
      closeDatabase();
    "
  fi
elif [ "$TESTNET_SEED" = "true" ]; then
  # Existing DB but TESTNET_SEED=true — ensure pool exists (idempotent)
  echo "Ensuring pool config exists..."
  node --no-warnings --import tsx scripts/testnet-seed-railway.ts
fi

# Start bot in background (no vault = no trading, just heartbeat)
echo "Starting bot in ${ENV} mode..."
node --no-warnings --import tsx apps/bot/src/main.ts &

# Start dashboard in foreground (uses PORT env var from Railway)
echo "Starting dashboard on port ${PORT:-3000}..."
exec pnpm --filter @rangeguard/dashboard start
