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

    CREATE TABLE IF NOT EXISTS stop_loss_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_config_id TEXT NOT NULL REFERENCES pool_configs(id),
      wallet_id TEXT NOT NULL REFERENCES wallets(id),
      wallet_type TEXT NOT NULL CHECK(wallet_type IN ('protection', 'profit')),
      asset TEXT NOT NULL,
      hl_order_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'triggered')),
      created_at INTEGER NOT NULL,
      cancelled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sl_orders_pool ON stop_loss_orders(pool_config_id, status);

    -- Range trading config columns on pool_configs (R10)
    -- Using INSERT OR IGNORE pattern for idempotent column additions
  `);

  // Add hedge ratio and per-pool cooldown columns (A1 quick wins)
  const hedgeColumns = [
    `ALTER TABLE pool_configs ADD COLUMN hedge_ratio REAL NOT NULL DEFAULT 1.0`,
    `ALTER TABLE pool_configs ADD COLUMN hedge_cooldown_seconds INTEGER NOT NULL DEFAULT 300`,
    `ALTER TABLE pool_configs ADD COLUMN debounce_count INTEGER NOT NULL DEFAULT 3`,
    `ALTER TABLE pool_configs ADD COLUMN range_buffer_percent REAL NOT NULL DEFAULT 0.5`,
  ];

  for (const sql of hedgeColumns) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Add LP position reading columns
  const lpColumns = [
    `ALTER TABLE pool_configs ADD COLUMN lp_token_id TEXT`,
    `ALTER TABLE pool_configs ADD COLUMN pool_amount_source TEXT NOT NULL DEFAULT 'manual'`,
    `ALTER TABLE pool_configs ADD COLUMN pool_amount_synced_at INTEGER`,
  ];

  for (const sql of lpColumns) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Add range trading columns to pool_configs (ALTERs are idempotent via try/catch)
  const tradingColumns = [
    `ALTER TABLE pool_configs ADD COLUMN trading_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE pool_configs ADD COLUMN trading_leverage INTEGER NOT NULL DEFAULT 5`,
    `ALTER TABLE pool_configs ADD COLUMN trading_stop_loss_percent REAL NOT NULL DEFAULT 2.0`,
    `ALTER TABLE pool_configs ADD COLUMN trading_trailing_percent REAL NOT NULL DEFAULT 1.5`,
    `ALTER TABLE pool_configs ADD COLUMN trading_entry_zone_percent REAL NOT NULL DEFAULT 25.0`,
    `ALTER TABLE pool_configs ADD COLUMN trading_cooldown_seconds INTEGER NOT NULL DEFAULT 300`,
    `ALTER TABLE pool_configs ADD COLUMN trading_max_size_usd REAL NOT NULL DEFAULT 1000.0`,
  ];

  for (const sql of tradingColumns) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  // Range trades table (R10)
  db.exec(`
    CREATE TABLE IF NOT EXISTS range_trades (
      id TEXT PRIMARY KEY,
      pool_config_id TEXT NOT NULL REFERENCES pool_configs(id),
      wallet_id TEXT NOT NULL REFERENCES wallets(id),
      asset TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('short', 'long')),
      size TEXT NOT NULL,
      entry_price TEXT NOT NULL,
      leverage INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'stopped', 'liquidated')),
      exit_price TEXT,
      realized_pnl TEXT,
      fees TEXT NOT NULL DEFAULT '0',
      stop_loss_price TEXT NOT NULL,
      trailing_percent REAL NOT NULL,
      peak_price TEXT,
      current_stop_price TEXT,
      hl_order_id TEXT,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER,
      close_reason TEXT CHECK(close_reason IN ('trailing_stop', 'stop_loss', 'hedge_priority', 'manual', 'liquidated') OR close_reason IS NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_range_trades_pool ON range_trades(pool_config_id);
    CREATE INDEX IF NOT EXISTS idx_range_trades_status ON range_trades(status);
    CREATE INDEX IF NOT EXISTS idx_range_trades_wallet ON range_trades(wallet_id);

    CREATE INDEX IF NOT EXISTS idx_hedge_trades_pool_status ON hedge_trades(pool_config_id, status);
    CREATE INDEX IF NOT EXISTS idx_range_trades_pool_status ON range_trades(pool_config_id, status);

    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      name TEXT NOT NULL,
      msg TEXT NOT NULL,
      data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bot_logs_created ON bot_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(level, created_at);
  `);
}
