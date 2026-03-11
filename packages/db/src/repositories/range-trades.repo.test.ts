import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/001_initial.js';
import { RangeTradesRepository } from './range-trades.repo.js';
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

describe('RangeTradesRepository', () => {
  let db: Database.Database;
  let repo: RangeTradesRepository;
  let walletId: string;
  let poolId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    repo = new RangeTradesRepository(db);
    const prereqs = createPrereqs(db);
    walletId = prereqs.walletId;
    poolId = prereqs.poolId;
  });

  describe('create', () => {
    it('should create with status open and trailing stop fields', () => {
      const trade = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.5',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      expect(trade.id).toBeDefined();
      expect(trade.status).toBe('open');
      expect(trade.side).toBe('long');
      expect(trade.size).toBe('1.5');
      expect(trade.stopLossPrice).toBe('1960');
      expect(trade.trailingPercent).toBe(1.5);
      expect(trade.peakPrice).toBe('2000'); // initialized to entry price
      expect(trade.currentStopPrice).toBe('1960'); // initialized to SL price
      expect(trade.openedAt).toBeGreaterThan(0);
      expect(trade.closedAt).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('should return trade when exists', () => {
      const created = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return undefined when not exists', () => {
      expect(repo.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('findOpenByPool', () => {
    it('should only return open trades for pool', () => {
      const t1 = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2400',
        leverage: 5,
        stopLossPrice: '2448',
        trailingPercent: 1.5,
      });

      // Close first trade
      repo.close(t1.id, '2050', '50', 'trailing_stop');

      const open = repo.findOpenByPool(poolId);
      expect(open).toHaveLength(1);
      expect(open[0].side).toBe('short');
    });
  });

  describe('updateTrailingStop', () => {
    it('should update peak price and current stop price', () => {
      const trade = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      repo.updateTrailingStop(trade.id, '2100', '2068.5');

      const updated = repo.findById(trade.id)!;
      expect(updated.peakPrice).toBe('2100');
      expect(updated.currentStopPrice).toBe('2068.5');
    });
  });

  describe('close', () => {
    it('should set status closed with trailing_stop reason', () => {
      const trade = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      repo.close(trade.id, '2060', '60.00', 'trailing_stop');

      const closed = repo.findById(trade.id)!;
      expect(closed.status).toBe('closed');
      expect(closed.exitPrice).toBe('2060');
      expect(closed.realizedPnl).toBe('60.00');
      expect(closed.closeReason).toBe('trailing_stop');
      expect(closed.closedAt).toBeGreaterThan(0);
    });

    it('should set status stopped with stop_loss reason', () => {
      const trade = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      repo.close(trade.id, '1955', '-45.00', 'stop_loss');

      const closed = repo.findById(trade.id)!;
      expect(closed.status).toBe('stopped');
      expect(closed.closeReason).toBe('stop_loss');
    });

    it('should set status closed with hedge_priority reason', () => {
      const trade = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      repo.close(trade.id, '2010', '10.00', 'hedge_priority');

      const closed = repo.findById(trade.id)!;
      expect(closed.status).toBe('closed');
      expect(closed.closeReason).toBe('hedge_priority');
    });
  });

  describe('statsByPool', () => {
    it('should return aggregate stats', () => {
      const t1 = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
        fees: '0.50',
      });

      const t2 = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'short',
        size: '1.0',
        entryPrice: '2400',
        leverage: 5,
        stopLossPrice: '2448',
        trailingPercent: 1.5,
        fees: '0.50',
      });

      repo.close(t1.id, '2060', '60.00', 'trailing_stop', '0.50');
      repo.close(t2.id, '2420', '-20.00', 'stop_loss', '0.50');

      const stats = repo.statsByPool(poolId);
      expect(stats.totalTrades).toBe(2);
      expect(stats.totalPnl).toBeCloseTo(40, 2);
      expect(stats.totalFees).toBeCloseTo(2.0, 2);
      expect(stats.wins).toBe(1);
      expect(stats.losses).toBe(1);
    });
  });

  describe('deleteHistoryByPool', () => {
    it('should delete closed trades, keep open ones', () => {
      const t1 = repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'long',
        size: '1.0',
        entryPrice: '2000',
        leverage: 5,
        stopLossPrice: '1960',
        trailingPercent: 1.5,
      });

      repo.create({
        poolConfigId: poolId,
        walletId,
        asset: 'ETH',
        side: 'short',
        size: '2.0',
        entryPrice: '2400',
        leverage: 5,
        stopLossPrice: '2448',
        trailingPercent: 1.5,
      });

      repo.close(t1.id, '2060', '60', 'trailing_stop');

      const deleted = repo.deleteHistoryByPool(poolId);
      expect(deleted).toBe(1);

      const open = repo.findOpenByPool(poolId);
      expect(open).toHaveLength(1);
    });
  });

  describe('findHistory', () => {
    it('should respect limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        repo.create({
          poolConfigId: poolId,
          walletId,
          asset: 'ETH',
          side: 'long',
          size: `${i + 1}.0`,
          entryPrice: '2000',
          leverage: 5,
          stopLossPrice: '1960',
          trailingPercent: 1.5,
        });
      }

      const page1 = repo.findHistory(2, 0);
      expect(page1).toHaveLength(2);

      const page2 = repo.findHistory(2, 2);
      expect(page2).toHaveLength(2);

      const page3 = repo.findHistory(2, 4);
      expect(page3).toHaveLength(1);
    });
  });
});
