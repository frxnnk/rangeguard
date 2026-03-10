import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      wallet_type TEXT NOT NULL CHECK(wallet_type IN ('protection', 'profit')),
      balance_available TEXT,
      balance_margin_used TEXT,
      balance_total TEXT,
      low_balance_threshold TEXT DEFAULT '100',
      last_balance_check INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pool_configs (
      id TEXT PRIMARY KEY,
      name TEXT,
      chain_id INTEGER NOT NULL,
      chain_name TEXT NOT NULL,
      rpc_url TEXT,
      pool_address TEXT NOT NULL,
      token0_symbol TEXT NOT NULL,
      token1_symbol TEXT NOT NULL,
      fee_tier INTEGER NOT NULL,
      range_lower REAL NOT NULL,
      range_upper REAL NOT NULL,
      pool_amount TEXT NOT NULL,
      hedge_asset TEXT NOT NULL,
      leverage INTEGER NOT NULL DEFAULT 10,
      protection_direction TEXT NOT NULL DEFAULT 'below' CHECK(protection_direction IN ('below', 'above', 'both')),
      protection_wallet_id TEXT NOT NULL REFERENCES wallets(id),
      profit_wallet_enabled INTEGER NOT NULL DEFAULT 1,
      protection_active INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'in-range',
      current_price TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hedge_trades (
      id TEXT PRIMARY KEY,
      pool_config_id TEXT NOT NULL REFERENCES pool_configs(id),
      wallet_id TEXT NOT NULL REFERENCES wallets(id),
      wallet_type TEXT NOT NULL CHECK(wallet_type IN ('protection', 'profit')),
      asset TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('short', 'long')),
      size TEXT NOT NULL,
      entry_price TEXT NOT NULL,
      leverage INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'liquidated')),
      exit_price TEXT,
      realized_pnl TEXT,
      fees TEXT NOT NULL DEFAULT '0',
      is_false_breakout INTEGER NOT NULL DEFAULT 0,
      hl_order_id TEXT,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      close_reason TEXT CHECK(close_reason IN ('range_return', 'manual', 'liquidated') OR close_reason IS NULL)
    );

    CREATE TABLE IF NOT EXISTS trade_log (
      id TEXT PRIMARY KEY,
      hedge_trade_id TEXT REFERENCES hedge_trades(id),
      wallet_id TEXT REFERENCES wallets(id),
      action TEXT NOT NULL,
      request_payload TEXT,
      response_payload TEXT,
      success INTEGER NOT NULL,
      error_message TEXT,
      latency_ms INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pnl_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_config_id TEXT NOT NULL REFERENCES pool_configs(id),
      wallet_type TEXT NOT NULL,
      unrealized_pnl TEXT NOT NULL,
      cumulative_fees TEXT NOT NULL,
      asset_price TEXT NOT NULL,
      snapshot_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset TEXT NOT NULL,
      price TEXT NOT NULL,
      chain_id INTEGER,
      recorded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pool_configs_status ON pool_configs(status);
    CREATE INDEX IF NOT EXISTS idx_pool_configs_chain ON pool_configs(chain_id);
    CREATE INDEX IF NOT EXISTS idx_hedge_trades_pool ON hedge_trades(pool_config_id);
    CREATE INDEX IF NOT EXISTS idx_hedge_trades_status ON hedge_trades(status);
    CREATE INDEX IF NOT EXISTS idx_hedge_trades_wallet ON hedge_trades(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_trade_log_hedge ON trade_log(hedge_trade_id);
    CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_pool ON pnl_snapshots(pool_config_id);
    CREATE INDEX IF NOT EXISTS idx_price_cache_asset ON price_cache(asset, recorded_at);

    CREATE TABLE IF NOT EXISTS bot_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}
