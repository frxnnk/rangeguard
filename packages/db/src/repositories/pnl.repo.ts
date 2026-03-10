import type Database from 'better-sqlite3';

export interface PnlSnapshot {
  id: number;
  poolConfigId: string;
  walletType: string;
  unrealizedPnl: string;
  cumulativeFees: string;
  assetPrice: string;
  snapshotAt: number;
}

interface PnlSnapshotRow {
  id: number;
  pool_config_id: string;
  wallet_type: string;
  unrealized_pnl: string;
  cumulative_fees: string;
  asset_price: string;
  snapshot_at: number;
}

interface PriceCacheRow {
  id: number;
  asset: string;
  price: string;
  chain_id: number | null;
  recorded_at: number;
}

function rowToPnlSnapshot(row: PnlSnapshotRow): PnlSnapshot {
  return {
    id: row.id,
    poolConfigId: row.pool_config_id,
    walletType: row.wallet_type,
    unrealizedPnl: row.unrealized_pnl,
    cumulativeFees: row.cumulative_fees,
    assetPrice: row.asset_price,
    snapshotAt: row.snapshot_at,
  };
}

export class PnlRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createSnapshot(
    poolConfigId: string,
    walletType: string,
    unrealizedPnl: string,
    cumulativeFees: string,
    assetPrice: string,
  ): void {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO pnl_snapshots (
        pool_config_id, wallet_type, unrealized_pnl, cumulative_fees,
        asset_price, snapshot_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(poolConfigId, walletType, unrealizedPnl, cumulativeFees, assetPrice, now);
  }

  findByPool(poolConfigId: string, limit: number): PnlSnapshot[] {
    const stmt = this.db.prepare(
      'SELECT * FROM pnl_snapshots WHERE pool_config_id = ? ORDER BY snapshot_at DESC LIMIT ?',
    );
    const rows = stmt.all(poolConfigId, limit) as PnlSnapshotRow[];
    return rows.map(rowToPnlSnapshot);
  }

  createPriceCache(asset: string, price: string, chainId?: number): void {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO price_cache (asset, price, chain_id, recorded_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(asset, price, chainId ?? null, now);
  }

  getLatestPrice(asset: string): { price: string; recordedAt: number } | undefined {
    const stmt = this.db.prepare(
      'SELECT price, recorded_at FROM price_cache WHERE asset = ? ORDER BY recorded_at DESC LIMIT 1',
    );
    const row = stmt.get(asset) as PriceCacheRow | undefined;
    if (!row) return undefined;

    return {
      price: row.price,
      recordedAt: row.recorded_at,
    };
  }

  getPriceHistory(asset: string, since: number): { price: string; recordedAt: number }[] {
    const stmt = this.db.prepare(
      'SELECT price, recorded_at FROM price_cache WHERE asset = ? AND recorded_at >= ? ORDER BY recorded_at ASC',
    );
    const rows = stmt.all(asset, since) as PriceCacheRow[];

    return rows.map((row) => ({
      price: row.price,
      recordedAt: row.recorded_at,
    }));
  }

  /** Delete price_cache entries older than the given timestamp */
  cleanupPriceCache(olderThan: number): number {
    const stmt = this.db.prepare('DELETE FROM price_cache WHERE recorded_at < ? AND asset != ?');
    const result = stmt.run(olderThan, '__bot_heartbeat');
    return result.changes;
  }

  /** Delete pnl_snapshots entries older than the given timestamp */
  cleanupPnlSnapshots(olderThan: number): number {
    const stmt = this.db.prepare('DELETE FROM pnl_snapshots WHERE snapshot_at < ?');
    const result = stmt.run(olderThan);
    return result.changes;
  }
}
