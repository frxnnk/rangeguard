import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/001_initial.js';
import { HedgesRepository } from './hedges.repo.js';
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

describe('HedgesRepository', () => {
  let db: Database.Database;
  let repo: HedgesRepository;
  let walletId: string;
  let poolId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new HedgesRepository(db);
    const prereqs = createPrereqs(db);
    walletId = prereqs.walletId;
    poolId = prereqs.poolId;
  });

  describe('create', () => {
    it('should create with status open and timestamps set', () => {
      const hedge = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.5',
        entryPrice: '2000',
        leverage: 10,
      });

      expect(hedge.id).toBeDefined();
      expect(hedge.status).toBe('open');
      expect(hedge.openedAt).toBeGreaterThan(0);
      expect(hedge.closedAt).toBeUndefined();
      expect(hedge.asset).toBe('ETH');
      expect(hedge.side).toBe('short');
      expect(hedge.size).toBe('1.5');
      expect(hedge.entryPrice).toBe('2000');
      expect(hedge.leverage).toBe(10);
      expect(hedge.fees).toBe('0');
      expect(hedge.isFalseBreakout).toBe(false);
    });
  });

  describe('findById', () => {
    it('should return hedge when exists', () => {
      const created = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return undefined when not exists', () => {
      const found = repo.findById('nonexistent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('findOpen', () => {
    it('should only return open hedges', () => {
      const h1 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2100',
        leverage: 10,
      });

      // Close the first hedge
      repo.close(h1.id, '1900', '150', 'range_return', false);

      const open = repo.findOpen();
      expect(open).toHaveLength(1);
      expect(open[0].size).toBe('2.0');
    });
  });

  describe('findByPool', () => {
    it('should return hedges for specific pool', () => {
      repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      const byPool = repo.findByPool(poolId);
      expect(byPool).toHaveLength(1);
      expect(byPool[0].poolConfigId).toBe(poolId);

      const byOther = repo.findByPool('other-pool-id');
      expect(byOther).toHaveLength(0);
    });
  });

  describe('findOpenByPool', () => {
    it('should return only open hedges for pool', () => {
      const h1 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2100',
        leverage: 10,
      });

      // Close first hedge
      repo.close(h1.id, '1900', '100', 'range_return', false);

      const openByPool = repo.findOpenByPool(poolId);
      expect(openByPool).toHaveLength(1);
      expect(openByPool[0].size).toBe('2.0');
    });
  });

  describe('close', () => {
    it('should set status closed with exitPrice, realizedPnl, and closeReason', () => {
      const hedge = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      repo.close(hedge.id, '1900', '100.50', 'range_return', false);

      const closed = repo.findById(hedge.id)!;
      expect(closed.status).toBe('closed');
      expect(closed.exitPrice).toBe('1900');
      expect(closed.realizedPnl).toBe('100.50');
      expect(closed.closeReason).toBe('range_return');
      expect(closed.closedAt).toBeGreaterThan(0);
      expect(closed.isFalseBreakout).toBe(false);
    });

    it('should set status liquidated when closeReason is liquidated', () => {
      const hedge = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      repo.close(hedge.id, '2200', '-500', 'liquidated', false);

      const liquidated = repo.findById(hedge.id)!;
      expect(liquidated.status).toBe('liquidated');
      expect(liquidated.closeReason).toBe('liquidated');
    });
  });

  describe('findHistory', () => {
    it('should respect limit and offset', () => {
      // Create 5 hedges
      for (let i = 0; i < 5; i++) {
        repo.create({
          poolConfigId: poolId,
          walletId,
          walletType: 'protection',
          asset: 'ETH',
          side: 'short',
          size: `${i + 1}.0`,
          entryPrice: '2000',
          leverage: 10,
        });
      }

      const page1 = repo.findHistory(2, 0);
      expect(page1).toHaveLength(2);

      const page2 = repo.findHistory(2, 2);
      expect(page2).toHaveLength(2);

      const page3 = repo.findHistory(2, 4);
      expect(page3).toHaveLength(1);

      // No overlap between pages
      const allIds = [...page1, ...page2, ...page3].map((h) => h.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('countFalseBreakouts', () => {
    it('should count trades with is_false_breakout=1', () => {
      const h1 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      const h2 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2100',
        leverage: 10,
      });

      const h3 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '3.0',
        entryPrice: '2200',
        leverage: 10,
      });

      // Close h1 and h2 as false breakouts, h3 as normal
      repo.close(h1.id, '2050', '-50', 'range_return', true);
      repo.close(h2.id, '2050', '-30', 'range_return', true);
      repo.close(h3.id, '1900', '300', 'range_return', false);

      expect(repo.countFalseBreakouts()).toBe(2);
    });
  });

  describe('findOpenByWallet', () => {
    it('should return only open hedges for a specific wallet', () => {
      const h1 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2100',
        leverage: 10,
      });

      // Close the first hedge
      repo.close(h1.id, '1900', '100', 'range_return', false);

      const openByWallet = repo.findOpenByWallet(walletId);
      expect(openByWallet).toHaveLength(1);
      expect(openByWallet[0].size).toBe('2.0');

      // Different wallet returns empty
      const other = repo.findOpenByWallet('nonexistent-wallet');
      expect(other).toHaveLength(0);
    });
  });

  describe('sumRealizedPnl', () => {
    it('should sum realized PnL of closed and liquidated trades', () => {
      const h1 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2000',
        leverage: 10,
      });

      const h2 = repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2100',
        leverage: 10,
      });

      // Leave a third hedge open - it should NOT be included in the sum
      repo.create({
        poolConfigId: poolId,
        walletId,
        walletType: 'protection',
        asset: 'ETH',
        side: 'short',
        size: '3.0',
        entryPrice: '2200',
        leverage: 10,
      });

      repo.close(h1.id, '1900', '100.50', 'range_return', false);
      repo.close(h2.id, '2200', '-25.30', 'manual', false);

      expect(repo.sumRealizedPnl()).toBeCloseTo(75.2, 2);
    });
  });
});
