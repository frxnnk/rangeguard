import type Database from 'better-sqlite3';
import { v4 } from 'uuid';
import type { PoolConfig, CreatePoolConfig, PoolStatus } from '@trading-bot/common';

interface PoolConfigRow {
  id: string;
  name: string | null;
  chain_id: number;
  chain_name: string;
  rpc_url: string | null;
  pool_address: string;
  token0_symbol: string;
  token1_symbol: string;
  fee_tier: number;
  range_lower: number;
  range_upper: number;
  pool_amount: string;
  hedge_asset: string;
  leverage: number;
  protection_direction: string;
  protection_wallet_id: string;
  profit_wallet_enabled: number;
  protection_active: number;
  status: string;
  current_price: string | null;
  created_at: number;
  updated_at: number;
  // Range trading (R10)
  trading_enabled: number;
  trading_leverage: number;
  trading_stop_loss_percent: number;
  trading_trailing_percent: number;
  trading_entry_zone_percent: number;
  trading_cooldown_seconds: number;
  trading_max_size_usd: number;
}

function rowToPoolConfig(row: PoolConfigRow): PoolConfig {
  return {
    id: row.id,
    name: row.name ?? '',
    chainId: row.chain_id,
    chainName: row.chain_name,
    rpcUrl: row.rpc_url ?? undefined,
    poolAddress: row.pool_address,
    token0Symbol: row.token0_symbol,
    token1Symbol: row.token1_symbol,
    feeTier: row.fee_tier as PoolConfig['feeTier'],
    rangeLower: row.range_lower,
    rangeUpper: row.range_upper,
    poolAmount: row.pool_amount,
    hedgeAsset: row.hedge_asset,
    leverage: row.leverage,
    protectionDirection: row.protection_direction as PoolConfig['protectionDirection'],
    protectionWalletId: row.protection_wallet_id,
    profitWalletEnabled: row.profit_wallet_enabled === 1,
    protectionActive: row.protection_active === 1,
    status: row.status as PoolStatus,
    currentPrice: row.current_price ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tradingEnabled: row.trading_enabled === 1,
    tradingLeverage: row.trading_leverage,
    tradingStopLossPercent: row.trading_stop_loss_percent,
    tradingTrailingPercent: row.trading_trailing_percent,
    tradingEntryZonePercent: row.trading_entry_zone_percent,
    tradingCooldownSeconds: row.trading_cooldown_seconds,
    tradingMaxSizeUsd: row.trading_max_size_usd,
  };
}

export class PoolsRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(data: CreatePoolConfig): PoolConfig {
    const id = v4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO pool_configs (
        id, name, chain_id, chain_name, rpc_url, pool_address,
        token0_symbol, token1_symbol, fee_tier, range_lower, range_upper,
        pool_amount, hedge_asset, leverage, protection_direction,
        protection_wallet_id, profit_wallet_enabled, protection_active,
        status, created_at, updated_at
      ) VALUES (
        @id, @name, @chainId, @chainName, @rpcUrl, @poolAddress,
        @token0Symbol, @token1Symbol, @feeTier, @rangeLower, @rangeUpper,
        @poolAmount, @hedgeAsset, @leverage, @protectionDirection,
        @protectionWalletId, @profitWalletEnabled, @protectionActive,
        @status, @createdAt, @updatedAt
      )
    `);

    stmt.run({
      id,
      name: data.name,
      chainId: data.chainId,
      chainName: data.chainName,
      rpcUrl: data.rpcUrl ?? null,
      poolAddress: data.poolAddress,
      token0Symbol: data.token0Symbol,
      token1Symbol: data.token1Symbol,
      feeTier: data.feeTier,
      rangeLower: data.rangeLower,
      rangeUpper: data.rangeUpper,
      poolAmount: data.poolAmount,
      hedgeAsset: data.hedgeAsset,
      leverage: data.leverage,
      protectionDirection: data.protectionDirection,
      protectionWalletId: data.protectionWalletId,
      profitWalletEnabled: data.profitWalletEnabled ? 1 : 0,
      protectionActive: data.protectionActive ? 1 : 0,
      status: 'in-range',
      createdAt: now,
      updatedAt: now,
    });

    return this.findById(id)!;
  }

  findById(id: string): PoolConfig | undefined {
    const stmt = this.db.prepare('SELECT * FROM pool_configs WHERE id = ?');
    const row = stmt.get(id) as PoolConfigRow | undefined;
    return row ? rowToPoolConfig(row) : undefined;
  }

  findAll(): PoolConfig[] {
    const stmt = this.db.prepare('SELECT * FROM pool_configs ORDER BY created_at DESC');
    const rows = stmt.all() as PoolConfigRow[];
    return rows.map(rowToPoolConfig);
  }

  findActive(): PoolConfig[] {
    const stmt = this.db.prepare(
      'SELECT * FROM pool_configs WHERE protection_active = 1 ORDER BY created_at DESC',
    );
    const rows = stmt.all() as PoolConfigRow[];
    return rows.map(rowToPoolConfig);
  }

  update(id: string, data: Partial<CreatePoolConfig>): PoolConfig {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Pool config not found: ${id}`);
    }

    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    if (data.name !== undefined) {
      fields.push('name = @name');
      values.name = data.name;
    }
    if (data.chainId !== undefined) {
      fields.push('chain_id = @chainId');
      values.chainId = data.chainId;
    }
    if (data.chainName !== undefined) {
      fields.push('chain_name = @chainName');
      values.chainName = data.chainName;
    }
    if (data.rpcUrl !== undefined) {
      fields.push('rpc_url = @rpcUrl');
      values.rpcUrl = data.rpcUrl;
    }
    if (data.poolAddress !== undefined) {
      fields.push('pool_address = @poolAddress');
      values.poolAddress = data.poolAddress;
    }
    if (data.token0Symbol !== undefined) {
      fields.push('token0_symbol = @token0Symbol');
      values.token0Symbol = data.token0Symbol;
    }
    if (data.token1Symbol !== undefined) {
      fields.push('token1_symbol = @token1Symbol');
      values.token1Symbol = data.token1Symbol;
    }
    if (data.feeTier !== undefined) {
      fields.push('fee_tier = @feeTier');
      values.feeTier = data.feeTier;
    }
    if (data.rangeLower !== undefined) {
      fields.push('range_lower = @rangeLower');
      values.rangeLower = data.rangeLower;
    }
    if (data.rangeUpper !== undefined) {
      fields.push('range_upper = @rangeUpper');
      values.rangeUpper = data.rangeUpper;
    }
    if (data.poolAmount !== undefined) {
      fields.push('pool_amount = @poolAmount');
      values.poolAmount = data.poolAmount;
    }
    if (data.hedgeAsset !== undefined) {
      fields.push('hedge_asset = @hedgeAsset');
      values.hedgeAsset = data.hedgeAsset;
    }
    if (data.leverage !== undefined) {
      fields.push('leverage = @leverage');
      values.leverage = data.leverage;
    }
    if (data.protectionDirection !== undefined) {
      fields.push('protection_direction = @protectionDirection');
      values.protectionDirection = data.protectionDirection;
    }
    if (data.protectionWalletId !== undefined) {
      fields.push('protection_wallet_id = @protectionWalletId');
      values.protectionWalletId = data.protectionWalletId;
    }
    if (data.profitWalletEnabled !== undefined) {
      fields.push('profit_wallet_enabled = @profitWalletEnabled');
      values.profitWalletEnabled = data.profitWalletEnabled ? 1 : 0;
    }
    if (data.protectionActive !== undefined) {
      fields.push('protection_active = @protectionActive');
      values.protectionActive = data.protectionActive ? 1 : 0;
    }
    if (data.tradingEnabled !== undefined) {
      fields.push('trading_enabled = @tradingEnabled');
      values.tradingEnabled = data.tradingEnabled ? 1 : 0;
    }
    if (data.tradingLeverage !== undefined) {
      fields.push('trading_leverage = @tradingLeverage');
      values.tradingLeverage = data.tradingLeverage;
    }
    if (data.tradingStopLossPercent !== undefined) {
      fields.push('trading_stop_loss_percent = @tradingStopLossPercent');
      values.tradingStopLossPercent = data.tradingStopLossPercent;
    }
    if (data.tradingTrailingPercent !== undefined) {
      fields.push('trading_trailing_percent = @tradingTrailingPercent');
      values.tradingTrailingPercent = data.tradingTrailingPercent;
    }
    if (data.tradingEntryZonePercent !== undefined) {
      fields.push('trading_entry_zone_percent = @tradingEntryZonePercent');
      values.tradingEntryZonePercent = data.tradingEntryZonePercent;
    }
    if (data.tradingCooldownSeconds !== undefined) {
      fields.push('trading_cooldown_seconds = @tradingCooldownSeconds');
      values.tradingCooldownSeconds = data.tradingCooldownSeconds;
    }
    if (data.tradingMaxSizeUsd !== undefined) {
      fields.push('trading_max_size_usd = @tradingMaxSizeUsd');
      values.tradingMaxSizeUsd = data.tradingMaxSizeUsd;
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push('updated_at = @updatedAt');
    values.updatedAt = Date.now();

    const stmt = this.db.prepare(`UPDATE pool_configs SET ${fields.join(', ')} WHERE id = @id`);
    stmt.run(values);

    return this.findById(id)!;
  }

  updateStatus(id: string, status: PoolStatus, currentPrice?: string): void {
    const now = Date.now();
    if (currentPrice !== undefined) {
      const stmt = this.db.prepare(
        'UPDATE pool_configs SET status = ?, current_price = ?, updated_at = ? WHERE id = ?',
      );
      stmt.run(status, currentPrice, now, id);
    } else {
      const stmt = this.db.prepare(
        'UPDATE pool_configs SET status = ?, updated_at = ? WHERE id = ?',
      );
      stmt.run(status, now, id);
    }
  }

  toggleProtection(id: string, active: boolean): void {
    const stmt = this.db.prepare(
      'UPDATE pool_configs SET protection_active = ?, updated_at = ? WHERE id = ?',
    );
    stmt.run(active ? 1 : 0, Date.now(), id);
  }

  delete(id: string): void {
    const deleteAll = this.db.transaction(() => {
      this.db.prepare('DELETE FROM pnl_snapshots WHERE pool_config_id = ?').run(id);
      // trade_log references hedge_trades, so delete logs first
      this.db
        .prepare(
          `
        DELETE FROM trade_log WHERE hedge_trade_id IN (
          SELECT id FROM hedge_trades WHERE pool_config_id = ?
        )
      `,
        )
        .run(id);
      this.db.prepare('DELETE FROM hedge_trades WHERE pool_config_id = ?').run(id);
      this.db.prepare('DELETE FROM range_trades WHERE pool_config_id = ?').run(id);
      this.db.prepare('DELETE FROM stop_loss_orders WHERE pool_config_id = ?').run(id);
      this.db.prepare('DELETE FROM pool_configs WHERE id = ?').run(id);
    });
    deleteAll();
  }
}
