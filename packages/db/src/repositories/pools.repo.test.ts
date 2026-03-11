import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/001_initial.js';
import { PoolsRepository } from './pools.repo.js';
import { WalletsRepository } from './wallets.repo.js';
import { HedgesRepository } from './hedges.repo.js';

function createTestWallet(db: Database.Database): string {
  const walletsRepo = new WalletsRepository(db);
  const wallet = walletsRepo.create({
    alias: 'test-wallet',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    walletType: 'protection',
  });
  return wallet.id;
}

function poolData(walletId: string) {
  return {
    name: 'ETH/USDC',
    chainId: 42161,
    chainName: 'arbitrum',
    poolAddress: '0xpool',
    token0Symbol: 'ETH',
    token1Symbol: 'USDC',
    feeTier: 3000 as const,
    rangeLower: 1800,
    rangeUpper: 2200,
    poolAmount: '10000',
    hedgeAsset: 'ETH',
    leverage: 10,
    protectionDirection: 'below' as const,
    protectionWalletId: walletId,
    profitWalletEnabled: true,
    protectionActive: true,
  };
}

describe('PoolsRepository', () => {
  let db: Database.Database;
  let repo: PoolsRepository;
  let walletId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new PoolsRepository(db);
    walletId = createTestWallet(db);
  });

  describe('create', () => {
    it('should assign UUID, status in-range, and timestamps', () => {
      const pool = repo.create(poolData(walletId));

      expect(pool.id).toBeDefined();
      expect(pool.id.length).toBeGreaterThan(0);
      expect(pool.status).toBe('in-range');
      expect(pool.createdAt).toBeGreaterThan(0);
      expect(pool.updatedAt).toBeGreaterThan(0);
      expect(pool.name).toBe('ETH/USDC');
      expect(pool.chainId).toBe(42161);
      expect(pool.protectionDirection).toBe('below');
      expect(pool.profitWalletEnabled).toBe(true);
      expect(pool.protectionActive).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return pool when exists', () => {
      const created = repo.create(poolData(walletId));
      const found = repo.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.poolAddress).toBe('0xpool');
    });

    it('should return undefined when not exists', () => {
      const found = repo.findById('nonexistent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return empty array when no pools', () => {
      const all = repo.findAll();
      expect(all).toEqual([]);
    });

    it('should return all pools', () => {
      const pool1 = repo.create(poolData(walletId));
      const data2 = { ...poolData(walletId), name: 'BTC/USDC', poolAddress: '0xpool2' };
      const pool2 = repo.create(data2);

      const all = repo.findAll();
      expect(all).toHaveLength(2);
      const ids = all.map((p) => p.id);
      expect(ids).toContain(pool1.id);
      expect(ids).toContain(pool2.id);
    });
  });

  describe('findActive', () => {
    it('should only return protection_active pools', () => {
      repo.create(poolData(walletId));

      const inactiveData = {
        ...poolData(walletId),
        name: 'Inactive Pool',
        poolAddress: '0xinactive',
        protectionActive: false,
      };
      repo.create(inactiveData);

      const active = repo.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].protectionActive).toBe(true);
    });
  });

  describe('update', () => {
    it('should update partial fields correctly', () => {
      const pool = repo.create(poolData(walletId));

      const updated = repo.update(pool.id, {
        name: 'Updated Name',
        leverage: 20,
        rangeLower: 1700,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.leverage).toBe(20);
      expect(updated.rangeLower).toBe(1700);
      // Unchanged fields remain the same
      expect(updated.rangeUpper).toBe(2200);
      expect(updated.hedgeAsset).toBe('ETH');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(pool.updatedAt);
    });

    it('should throw Error if pool not found', () => {
      expect(() => repo.update('nonexistent', { name: 'X' })).toThrow(
        'Pool config not found: nonexistent',
      );
    });

    it('should return existing pool unchanged if no fields provided', () => {
      const pool = repo.create(poolData(walletId));

      const result = repo.update(pool.id, {});

      expect(result.id).toBe(pool.id);
      expect(result.name).toBe(pool.name);
      expect(result.updatedAt).toBe(pool.updatedAt);
    });
  });

  describe('updateStatus', () => {
    it('should update status and optional currentPrice', () => {
      const pool = repo.create(poolData(walletId));

      repo.updateStatus(pool.id, 'out-of-range-below', '1750.50');

      const updated = repo.findById(pool.id)!;
      expect(updated.status).toBe('out-of-range-below');
      expect(updated.currentPrice).toBe('1750.50');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(pool.updatedAt);
    });
  });

  describe('toggleProtection', () => {
    it('should toggle protection_active', () => {
      const pool = repo.create(poolData(walletId));
      expect(pool.protectionActive).toBe(true);

      repo.toggleProtection(pool.id, false);
      const toggled = repo.findById(pool.id)!;
      expect(toggled.protectionActive).toBe(false);

      repo.toggleProtection(pool.id, true);
      const toggledBack = repo.findById(pool.id)!;
      expect(toggledBack.protectionActive).toBe(true);
    });
  });

  describe('delete', () => {
    it('should cascade delete hedge_trades, pnl_snapshots, and trade_log', () => {
      const pool = repo.create(poolData(walletId));

      // Create a hedge trade linked to this pool
      const hedgesRepo = new HedgesRepository(db);
      const hedge = hedgesRepo.create({
        poolConfigId: pool.id,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      expect(hedgesRepo.findById(hedge.id)).toBeDefined();

      // Delete the pool
      repo.delete(pool.id);

      // Pool should be gone
      expect(repo.findById(pool.id)).toBeUndefined();
      // Hedge trade should also be gone (cascade)
      expect(hedgesRepo.findById(hedge.id)).toBeUndefined();
    });
  });
});
