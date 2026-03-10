import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/001_initial.js';
import { PnlRepository } from './pnl.repo.js';
import { WalletsRepository } from './wallets.repo.js';
import { PoolsRepository } from './pools.repo.js';

function createPrereqs(db: Database.Database) {
  const walletsRepo = new WalletsRepository(db);
  const poolsRepo = new PoolsRepository(db);
  const wallet = walletsRepo.create({
    alias: 'test-wallet',
    address: '0x1234',
    walletType: 'protection',
  });
  const pool = poolsRepo.create({
    name: 'ETH/USDC',
    chainId: 42161,
    chainName: 'arbitrum',
    poolAddress: '0xpool',
    token0Symbol: 'ETH',
    token1Symbol: 'USDC',
    feeTier: 3000,
    rangeLower: 1800,
    rangeUpper: 2200,
    poolAmount: '10000',
    hedgeAsset: 'ETH',
    leverage: 10,
    protectionDirection: 'below',
    protectionWalletId: wallet.id,
    profitWalletEnabled: false,
    protectionActive: true,
  });
  return { walletId: wallet.id, poolId: pool.id };
}

describe('PnlRepository cleanup', () => {
  let db: Database.Database;
  let repo: PnlRepository;
  let poolId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new PnlRepository(db);
    const prereqs = createPrereqs(db);
    poolId = prereqs.poolId;
  });

  describe('cleanupPriceCache', () => {
    it('should delete old entries but preserve recent and __bot_heartbeat', () => {
      const now = Date.now();
      const sevenDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;

      // Insert old entries directly
      const stmt = db.prepare(
        'INSERT INTO price_cache (asset, price, chain_id, recorded_at) VALUES (?, ?, ?, ?)',
      );
      stmt.run('ETH', '2000', 42161, sevenDaysAgo);
      stmt.run('ETH', '2010', 42161, sevenDaysAgo + 1000);
      stmt.run('__bot_heartbeat', '1', null, sevenDaysAgo); // should survive

      // Insert recent entry
      stmt.run('ETH', '2100', 42161, now);

      const deleted = repo.cleanupPriceCache(cutoff);
      expect(deleted).toBe(2); // only old ETH entries, not heartbeat

      // Recent entry survives
      const latest = repo.getLatestPrice('ETH');
      expect(latest).toBeDefined();
      expect(latest!.price).toBe('2100');

      // Heartbeat survives
      const heartbeat = repo.getLatestPrice('__bot_heartbeat');
      expect(heartbeat).toBeDefined();
    });

    it('should return 0 when no old entries exist', () => {
      repo.createPriceCache('ETH', '2000', 42161);
      const deleted = repo.cleanupPriceCache(0); // cutoff in the past
      expect(deleted).toBe(0);
    });
  });

  describe('cleanupPnlSnapshots', () => {
    it('should delete old snapshots but preserve recent ones', () => {
      const now = Date.now();
      const ninetyDaysAgo = now - 91 * 24 * 60 * 60 * 1000;
      const cutoff = now - 90 * 24 * 60 * 60 * 1000;

      // Insert old snapshots directly
      const stmt = db.prepare(
        'INSERT INTO pnl_snapshots (pool_config_id, wallet_type, unrealized_pnl, cumulative_fees, asset_price, snapshot_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      stmt.run(poolId, 'protection', '-10', '0.5', '2000', ninetyDaysAgo);
      stmt.run(poolId, 'protection', '-15', '0.6', '1990', ninetyDaysAgo + 1000);

      // Insert recent snapshot
      repo.createSnapshot(poolId, 'protection', '-5', '0.3', '2100');

      const deleted = repo.cleanupPnlSnapshots(cutoff);
      expect(deleted).toBe(2);

      // Recent snapshot survives
      const remaining = repo.findByPool(poolId, 100);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].assetPrice).toBe('2100');
    });

    it('should return 0 when no old snapshots exist', () => {
      repo.createSnapshot(poolId, 'protection', '-5', '0.3', '2100');
      const deleted = repo.cleanupPnlSnapshots(0);
      expect(deleted).toBe(0);
    });
  });
});
