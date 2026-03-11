import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrailingStopManager, type TrailingStopTrigger } from './trailing-stop-manager.js';
import type { RangeTrade } from '@rangeguard/common';
import type { RangeTradesRepository } from '@rangeguard/db';

function makeMockRepo() {
  return {
    updateTrailingStop: vi.fn(),
    findOpen: vi.fn().mockReturnValue([]),
  };
}

function makeLongTrade(overrides: Partial<RangeTrade> = {}): RangeTrade {
  return {
    id: 'trade-1',
    poolConfigId: 'pool-1',
    walletId: 'wallet-1',
    asset: 'ETH',
    side: 'long',
    size: '1.0',
    entryPrice: '2000',
    leverage: 5,
    status: 'open',
    fees: '0',
    stopLossPrice: '1960', // 2% below entry
    trailingPercent: 1.5,
    peakPrice: '2000',
    currentStopPrice: '1960',
    openedAt: Date.now(),
    ...overrides,
  };
}

function makeShortTrade(overrides: Partial<RangeTrade> = {}): RangeTrade {
  return {
    id: 'trade-2',
    poolConfigId: 'pool-1',
    walletId: 'wallet-1',
    asset: 'ETH',
    side: 'short',
    size: '1.0',
    entryPrice: '2400',
    leverage: 5,
    status: 'open',
    fees: '0',
    stopLossPrice: '2448', // 2% above entry
    trailingPercent: 1.5,
    peakPrice: '2400',
    currentStopPrice: '2448',
    openedAt: Date.now(),
    ...overrides,
  };
}

describe('TrailingStopManager', () => {
  let triggers: TrailingStopTrigger[];
  let repo: ReturnType<typeof makeMockRepo>;
  let manager: TrailingStopManager;

  beforeEach(() => {
    triggers = [];
    repo = makeMockRepo();
    manager = new TrailingStopManager(repo as unknown as RangeTradesRepository, (t) =>
      triggers.push(t),
    );
  });

  describe('long trades', () => {
    it('should not trigger when price stays above stop', () => {
      manager.track(makeLongTrade());
      manager.onPriceUpdate('pool-1', 2050);
      expect(triggers).toHaveLength(0);
    });

    it('should update peak price and trailing stop as price rises', () => {
      manager.track(makeLongTrade());

      // Price rises to 2100 → peak=2100, stop=2100*(1-0.015)=2068.5
      manager.onPriceUpdate('pool-1', 2100);
      expect(triggers).toHaveLength(0);

      // Price drops to 2070 — above trailing stop (2068.5), no trigger
      manager.onPriceUpdate('pool-1', 2070);
      expect(triggers).toHaveLength(0);
    });

    it('should trigger trailing stop when price drops below current stop', () => {
      manager.track(makeLongTrade());

      // Price rises to 2100 → new stop = 2100*(1-0.015) = 2068.5
      manager.onPriceUpdate('pool-1', 2100);

      // Price drops below 2068.5
      manager.onPriceUpdate('pool-1', 2060);
      expect(triggers).toHaveLength(1);
      expect(triggers[0].tradeId).toBe('trade-1');
    });

    it('should trigger hard stop-loss immediately', () => {
      manager.track(makeLongTrade()); // SL at 1960

      manager.onPriceUpdate('pool-1', 1950);
      expect(triggers).toHaveLength(1);
      expect(triggers[0].triggerPrice).toBe(1950);
    });

    it('should not lower the trailing stop when price drops', () => {
      manager.track(makeLongTrade());

      // Price rises to 2100 → stop = 2068.5
      manager.onPriceUpdate('pool-1', 2100);

      // Price drops to 2080 — stop should stay at 2068.5, NOT drop
      manager.onPriceUpdate('pool-1', 2080);

      // Price rises to 2090 — still below peak 2100, stop unchanged
      manager.onPriceUpdate('pool-1', 2090);

      // Price drops to 2069 — still above stop 2068.5
      manager.onPriceUpdate('pool-1', 2069);
      expect(triggers).toHaveLength(0);
    });
  });

  describe('short trades', () => {
    it('should not trigger when price stays below stop', () => {
      manager.track(makeShortTrade());
      manager.onPriceUpdate('pool-1', 2350);
      expect(triggers).toHaveLength(0);
    });

    it('should update peak (lowest) and trailing stop as price drops', () => {
      manager.track(makeShortTrade());

      // Price drops to 2300 → peak=2300, stop=2300*(1+0.015)=2334.5
      manager.onPriceUpdate('pool-1', 2300);
      expect(triggers).toHaveLength(0);
    });

    it('should trigger trailing stop when price rises above current stop', () => {
      manager.track(makeShortTrade());

      // Price drops to 2300 → new stop = 2300*(1+0.015) = 2334.5
      manager.onPriceUpdate('pool-1', 2300);

      // Price rises above 2334.5
      manager.onPriceUpdate('pool-1', 2340);
      expect(triggers).toHaveLength(1);
    });

    it('should trigger hard stop-loss for short', () => {
      manager.track(makeShortTrade()); // SL at 2448

      manager.onPriceUpdate('pool-1', 2450);
      expect(triggers).toHaveLength(1);
    });
  });

  describe('tracking', () => {
    it('should stop tracking after untrack', () => {
      manager.track(makeLongTrade());
      manager.untrack('trade-1');

      manager.onPriceUpdate('pool-1', 1900); // would trigger SL
      expect(triggers).toHaveLength(0);
    });

    it('should report hasOpenTrade correctly', () => {
      expect(manager.hasOpenTrade('pool-1')).toBe(false);
      manager.track(makeLongTrade());
      expect(manager.hasOpenTrade('pool-1')).toBe(true);
      manager.untrack('trade-1');
      expect(manager.hasOpenTrade('pool-1')).toBe(false);
    });

    it('should return tracked trade IDs for pool', () => {
      manager.track(makeLongTrade());
      expect(manager.getTrackedForPool('pool-1')).toEqual(['trade-1']);
      expect(manager.getTrackedForPool('pool-2')).toEqual([]);
    });

    it('should restore from DB', () => {
      const trades = [makeLongTrade(), makeShortTrade()];
      repo.findOpen.mockReturnValue(trades);
      manager.restoreFromDb();

      expect(manager.hasOpenTrade('pool-1')).toBe(true);
      expect(manager.getTrackedForPool('pool-1')).toHaveLength(2);
    });
  });

  describe('DB persistence', () => {
    it('should write to DB when peak updates', () => {
      vi.useFakeTimers();
      manager.track(makeLongTrade());

      // Price rises, triggering DB write
      vi.advanceTimersByTime(11_000); // past throttle
      manager.onPriceUpdate('pool-1', 2100);

      expect(repo.updateTrailingStop).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
