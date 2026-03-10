import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/001_initial.js';
import { StopLossRepository } from './stop-loss.repo.js';
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

describe('StopLossRepository', () => {
  let db: Database.Database;
  let repo: StopLossRepository;
  let walletId: string;
  let poolId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new StopLossRepository(db);
    const prereqs = createPrereqs(db);
    walletId = prereqs.walletId;
    poolId = prereqs.poolId;
  });

  describe('create', () => {
    it('should create an active SL order with correct fields', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 12345);

      const active = repo.findActive(poolId, 'protection');
      expect(active).toHaveLength(1);
      expect(active[0].poolConfigId).toBe(poolId);
      expect(active[0].walletId).toBe(walletId);
      expect(active[0].walletType).toBe('protection');
      expect(active[0].asset).toBe('ETH');
      expect(active[0].hlOrderId).toBe(12345);
      expect(active[0].status).toBe('active');
      expect(active[0].createdAt).toBeGreaterThan(0);
      expect(active[0].cancelledAt).toBeUndefined();
    });
  });

  describe('findActive', () => {
    it('should filter by poolConfigId and walletType', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 100);
      repo.create(poolId, walletId, 'profit', 'ETH', 101);

      const protection = repo.findActive(poolId, 'protection');
      expect(protection).toHaveLength(1);
      expect(protection[0].hlOrderId).toBe(100);

      const profit = repo.findActive(poolId, 'profit');
      expect(profit).toHaveLength(1);
      expect(profit[0].hlOrderId).toBe(101);
    });

    it('should ignore cancelled and triggered orders', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 100);
      repo.create(poolId, walletId, 'protection', 'ETH', 101);
      repo.create(poolId, walletId, 'protection', 'ETH', 102);

      repo.markCancelledByIds([100]);
      repo.markTriggered([101]);

      const active = repo.findActive(poolId, 'protection');
      expect(active).toHaveLength(1);
      expect(active[0].hlOrderId).toBe(102);
    });

    it('should return empty array when no active orders', () => {
      const active = repo.findActive(poolId, 'protection');
      expect(active).toHaveLength(0);
    });
  });

  describe('findAllActive', () => {
    it('should return all active orders across pools and wallet types', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 100);
      repo.create(poolId, walletId, 'profit', 'ETH', 101);
      repo.create(poolId, walletId, 'protection', 'ETH', 102);

      // Cancel one
      repo.markCancelledByIds([100]);

      const allActive = repo.findAllActive();
      expect(allActive).toHaveLength(2);
      expect(allActive.map((o) => o.hlOrderId).sort()).toEqual([101, 102]);
    });
  });

  describe('markCancelled', () => {
    it('should cancel active orders for pool + walletType and set cancelledAt', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 100);
      repo.create(poolId, walletId, 'protection', 'ETH', 101);
      repo.create(poolId, walletId, 'profit', 'ETH', 102);

      const changes = repo.markCancelled(poolId, 'protection');
      expect(changes).toBe(2);

      const protection = repo.findActive(poolId, 'protection');
      expect(protection).toHaveLength(0);

      // Profit orders unaffected
      const profit = repo.findActive(poolId, 'profit');
      expect(profit).toHaveLength(1);
    });

    it('should return 0 when no active orders to cancel', () => {
      const changes = repo.markCancelled(poolId, 'protection');
      expect(changes).toBe(0);
    });
  });

  describe('markCancelledByIds', () => {
    it('should cancel specific orders by HL order IDs', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 100);
      repo.create(poolId, walletId, 'protection', 'ETH', 101);
      repo.create(poolId, walletId, 'protection', 'ETH', 102);

      const changes = repo.markCancelledByIds([100, 102]);
      expect(changes).toBe(2);

      const active = repo.findActive(poolId, 'protection');
      expect(active).toHaveLength(1);
      expect(active[0].hlOrderId).toBe(101);
    });

    it('should return 0 for empty array', () => {
      const changes = repo.markCancelledByIds([]);
      expect(changes).toBe(0);
    });
  });

  describe('markTriggered', () => {
    it('should change status to triggered', () => {
      repo.create(poolId, walletId, 'protection', 'ETH', 100);
      repo.create(poolId, walletId, 'protection', 'ETH', 101);

      const changes = repo.markTriggered([100]);
      expect(changes).toBe(1);

      const active = repo.findActive(poolId, 'protection');
      expect(active).toHaveLength(1);
      expect(active[0].hlOrderId).toBe(101);
    });

    it('should return 0 for empty array', () => {
      const changes = repo.markTriggered([]);
      expect(changes).toBe(0);
    });
  });
});
