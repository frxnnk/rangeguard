#!/bin/bash
set -e

ENV="${RANGEGUARD_ENV:-testnet}"
DB_FILE="/app/data/bot-${ENV}.db"

# First run: create DB with migrations (or seed demo data if DEMO_SEED=true)
if [ ! -f "$DB_FILE" ]; then
  if [ "$DEMO_SEED" = "true" ]; then
    echo "First run + DEMO_SEED=true — seeding demo data..."
    node --no-warnings --import tsx scripts/demo-seed.ts
  else
    echo "First run ($ENV) — running migrations (empty DB, configure via dashboard)..."
    node --no-warnings --import tsx -e "
      import { getDatabase, closeDatabase } from './packages/db/src/connection.js';
      import { runMigrations } from './packages/db/src/migrations/001_initial.js';
      const db = getDatabase('${DB_FILE}');
      runMigrations(db);
      closeDatabase();
    "
  fi
fi

# Bootstrap vault from WALLET_KEYS env var (if set and vault doesn't exist yet)
if [ -n "$WALLET_KEYS" ]; then
  VAULT_FILE="${VAULT_PATH:-$HOME/.rangeguard/vault-${ENV}.enc}"
  if [ ! -f "$VAULT_FILE" ]; then
    echo "WALLET_KEYS detected — bootstrapping vault..."
    node --no-warnings --import tsx scripts/bootstrap-vault.ts
  else
    echo "Vault already exists — skipping bootstrap"
  fi
fi

# Start bot in background (no vault = no trading, just heartbeat)
echo "Starting bot in ${ENV} mode..."
node --no-warnings --import tsx apps/bot/src/main.ts &

# Start dashboard in foreground (uses PORT env var from Railway)
echo "Starting dashboard on port ${PORT:-3000}..."
exec pnpm --filter @rangeguard/dashboard start
