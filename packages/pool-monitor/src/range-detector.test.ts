import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PoolConfig, ProtectionDirection } from '@rangeguard/common';
import { RangeDetector } from './range-detector.js';

function makeConfig(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return {
    id: 'pool-1',
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
    protectionDirection: 'below' as ProtectionDirection,
    protectionWalletId: 'wallet-1',
    profitWalletEnabled: false,
    hedgeRatio: 1.0,
    hedgeCooldownSeconds: 300,
    debounceCount: 3,
    protectionActive: true,
    status: 'in-range',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as PoolConfig;
}

describe('RangeDetector', () => {
  let onRangeExit: ReturnType<typeof vi.fn>;
  let onRangeReturn: ReturnType<typeof vi.fn>;
  let detector: RangeDetector;

  beforeEach(() => {
    onRangeExit = vi.fn();
    onRangeReturn = vi.fn();
    detector = new RangeDetector(onRangeExit, onRangeReturn, 3, 5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register / getState', () => {
    it('should set initial state from config.status', () => {
      const config = makeConfig({ status: 'in-range' });
      detector.register(config);
      expect(detector.getState('pool-1')).toBe('in-range');
    });

    it('should return undefined for an unregistered pool', () => {
      expect(detector.getState('nonexistent')).toBeUndefined();
    });
  });

  describe('debounce logic', () => {
    it('should not fire callback when price stays in range', () => {
      detector.register(makeConfig());

      detector.onPriceUpdate('pool-1', 2000);

      expect(onRangeExit).not.toHaveBeenCalled();
      expect(onRangeReturn).not.toHaveBeenCalled();
      expect(detector.getState('pool-1')).toBe('in-range');
    });

    it('should not fire callback after a single out-of-range update (debounce)', () => {
      detector.register(makeConfig());

      detector.onPriceUpdate('pool-1', 1700);

      expect(onRangeExit).not.toHaveBeenCalled();
      expect(detector.getState('pool-1')).toBe('in-range');
    });

    it('should fire onRangeExit after 3 consecutive below-range updates', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      expect(onRangeExit).toHaveBeenCalledTimes(1);
      expect(onRangeExit).toHaveBeenCalledWith(
        expect.objectContaining({
          poolConfigId: 'pool-1',
          direction: 'below',
        }),
      );
    });

    it('should fire onRangeExit after 3 consecutive above-range updates', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      detector.onPriceUpdate('pool-1', 2300);
      detector.onPriceUpdate('pool-1', 2300);
      detector.onPriceUpdate('pool-1', 2300);

      expect(onRangeExit).toHaveBeenCalledTimes(1);
      expect(onRangeExit).toHaveBeenCalledWith(
        expect.objectContaining({
          poolConfigId: 'pool-1',
          direction: 'above',
        }),
      );
    });

    it('should reset debounce signal when price oscillates back in range', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // 2 out-of-range (normal weight), then back in range, then 1 out-of-range
      // Using 1795 (deviation 5/400=1.25% → weight 1.0) to avoid strong-signal fast trigger
      detector.onPriceUpdate('pool-1', 1795); // signal = 1.0
      detector.onPriceUpdate('pool-1', 1795); // signal = 2.0
      detector.onPriceUpdate('pool-1', 2000); // back in range, resets signal
      detector.onPriceUpdate('pool-1', 1795); // signal restarts at 1.0

      expect(onRangeExit).not.toHaveBeenCalled();
    });
  });

  describe('range return', () => {
    it('should fire onRangeReturn when price returns to range after exit', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Trigger exit below
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      expect(onRangeExit).toHaveBeenCalledTimes(1);

      // Return to range (3 consecutive in-range)
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);

      expect(onRangeReturn).toHaveBeenCalledTimes(1);
      expect(onRangeReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          poolConfigId: 'pool-1',
          previousDirection: 'below',
        }),
      );
    });
  });

  describe('cooldown', () => {
    it('should block re-exit during cooldown period', () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Trigger exit
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      expect(onRangeExit).toHaveBeenCalledTimes(1);

      // Return to range
      now += 10_000;
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);
      expect(onRangeReturn).toHaveBeenCalledTimes(1);

      // Try to exit again within cooldown (5 min = 300_000 ms)
      now += 100_000; // only 100s later, still in cooldown
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      // Should NOT fire a second exit
      expect(onRangeExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-pool cooldown', () => {
    it('should use per-pool hedgeCooldownSeconds instead of global cooldown', () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      // Pool with 60-second cooldown (much shorter than default 5 min)
      detector.register(makeConfig({ protectionDirection: 'both', hedgeCooldownSeconds: 60 }));

      // Trigger exit
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      expect(onRangeExit).toHaveBeenCalledTimes(1);

      // Return to range
      now += 10_000;
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);
      expect(onRangeReturn).toHaveBeenCalledTimes(1);

      // Try to exit again at 70s (after 60s per-pool cooldown)
      now += 61_000;
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      // Should fire because per-pool cooldown (60s) has passed
      expect(onRangeExit).toHaveBeenCalledTimes(2);
    });

    it('should update cooldown via updateConfig', () => {
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);

      detector.register(makeConfig({ protectionDirection: 'both', hedgeCooldownSeconds: 300 }));

      // Trigger exit
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      expect(onRangeExit).toHaveBeenCalledTimes(1);

      // Return to range
      now += 10_000;
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);
      detector.onPriceUpdate('pool-1', 2000);

      // Update cooldown to 30s
      detector.updateConfig('pool-1', 1800, 2200, 'both', 30);

      // Try to exit at 40s (within old 300s cooldown, but after new 30s)
      now += 41_000;
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      expect(onRangeExit).toHaveBeenCalledTimes(2);
    });
  });

  describe('per-pool debounce', () => {
    it('should use per-pool debounceCount instead of global default', () => {
      // Pool with debounceCount=2 (lower than global default of 3)
      detector.register(
        makeConfig({ protectionDirection: 'both', debounceCount: 2 }),
      );

      // Price 1795: deviation ~1.25% → weight 1.0
      // With debounceCount=2, needs 2 observations
      detector.onPriceUpdate('pool-1', 1795);
      expect(onRangeExit).not.toHaveBeenCalled(); // 1.0 < 2

      detector.onPriceUpdate('pool-1', 1795);
      expect(onRangeExit).toHaveBeenCalledTimes(1); // 2.0 >= 2
    });

    it('should allow different debounce per pool', () => {
      // Pool A: debounceCount=2
      detector.register(
        makeConfig({ id: 'pool-a', protectionDirection: 'both', debounceCount: 2 }),
      );
      // Pool B: debounceCount=5
      detector.register(
        makeConfig({ id: 'pool-b', protectionDirection: 'both', debounceCount: 5 }),
      );

      // Strong signal (weight 1.5) — 2 observations
      detector.onPriceUpdate('pool-a', 1700); // pool-a: 1.5
      detector.onPriceUpdate('pool-b', 1700); // pool-b: 1.5
      detector.onPriceUpdate('pool-a', 1700); // pool-a: 3.0 >= 2 → triggers
      detector.onPriceUpdate('pool-b', 1700); // pool-b: 3.0 < 5

      expect(onRangeExit).toHaveBeenCalledTimes(1);
      expect(onRangeExit).toHaveBeenCalledWith(
        expect.objectContaining({ poolConfigId: 'pool-a' }),
      );
    });

    it('should update debounce via updateConfig', () => {
      detector.register(
        makeConfig({ protectionDirection: 'both', debounceCount: 5 }),
      );

      // Price 1795: weight 1.0
      detector.onPriceUpdate('pool-1', 1795); // signal = 1.0
      detector.onPriceUpdate('pool-1', 1795); // signal = 2.0

      // Lower the debounce to 2
      detector.updateConfig('pool-1', 1800, 2200, 'both', undefined, 2);

      // Signal is already at 2.0 but the pending state was below, next tick should confirm
      // Actually signal was already 2.0 which is >= new debounce of 2, but we need a new price update
      detector.onPriceUpdate('pool-1', 1795); // signal = 3.0 >= 2

      expect(onRangeExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('protectionDirection filtering', () => {
    it('should ignore exits above when protectionDirection is below', () => {
      detector.register(makeConfig({ protectionDirection: 'below' }));

      detector.onPriceUpdate('pool-1', 2300);
      detector.onPriceUpdate('pool-1', 2300);
      detector.onPriceUpdate('pool-1', 2300);

      expect(onRangeExit).not.toHaveBeenCalled();
    });

    it('should fire exit for below direction when protectionDirection is both', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      expect(onRangeExit).toHaveBeenCalledTimes(1);
      expect(onRangeExit).toHaveBeenCalledWith(expect.objectContaining({ direction: 'below' }));
    });
  });

  describe('boundary prices', () => {
    it('should treat price exactly at rangeLower as in-range', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Price exactly at lower boundary (1800) - uses < comparison, so 1800 is in-range
      detector.onPriceUpdate('pool-1', 1800);
      detector.onPriceUpdate('pool-1', 1800);
      detector.onPriceUpdate('pool-1', 1800);

      expect(onRangeExit).not.toHaveBeenCalled();
      expect(detector.getState('pool-1')).toBe('in-range');
    });

    it('should treat price exactly at rangeUpper as in-range', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Price exactly at upper boundary (2200) - uses > comparison, so 2200 is in-range
      detector.onPriceUpdate('pool-1', 2200);
      detector.onPriceUpdate('pool-1', 2200);
      detector.onPriceUpdate('pool-1', 2200);

      expect(onRangeExit).not.toHaveBeenCalled();
      expect(detector.getState('pool-1')).toBe('in-range');
    });
  });

  describe('unregister', () => {
    it('should make onPriceUpdate a no-op after unregister', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));
      detector.unregister('pool-1');

      // Should not throw and should not call any callback
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      expect(onRangeExit).not.toHaveBeenCalled();
      expect(onRangeReturn).not.toHaveBeenCalled();
      expect(detector.getState('pool-1')).toBeUndefined();
    });
  });

  describe('updateConfig', () => {
    it('should update range parameters so previously out-of-range price is now in-range', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Price 1795 is below rangeLower=1800 (weight 1.0, signal accumulates slowly)
      detector.onPriceUpdate('pool-1', 1795); // signal = 1.0
      detector.onPriceUpdate('pool-1', 1795); // signal = 2.0
      // 2 of 3 - not triggered yet

      // Now widen the range: lower to 1500
      detector.updateConfig('pool-1', 1500, 2200, 'both');

      // 1795 is now in range since lower=1500 → resets signal
      detector.onPriceUpdate('pool-1', 1795);

      expect(onRangeExit).not.toHaveBeenCalled();
    });
  });

  describe('adaptive signal weight', () => {
    it('should trigger faster with strong signal (>2% deviation)', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Price 1700: deviation = 100/400 = 25% → weight 1.5
      // 2 observations × 1.5 = 3.0 ≥ debounceCount(3)
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);

      expect(onRangeExit).toHaveBeenCalledTimes(1);
    });

    it('should trigger normally with moderate signal (0.5-2% deviation)', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Price 1795: deviation = 5/400 = 1.25% → weight 1.0
      // Needs exactly 3 observations
      detector.onPriceUpdate('pool-1', 1795);
      detector.onPriceUpdate('pool-1', 1795);
      expect(onRangeExit).not.toHaveBeenCalled(); // 2.0 < 3

      detector.onPriceUpdate('pool-1', 1795);
      expect(onRangeExit).toHaveBeenCalledTimes(1); // 3.0 ≥ 3
    });

    it('should trigger slower with weak signal (<0.5% deviation)', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Price 1799: deviation = 1/400 = 0.25% → weight 0.75
      // Needs 4 observations (4 × 0.75 = 3.0 ≥ 3)
      detector.onPriceUpdate('pool-1', 1799);
      detector.onPriceUpdate('pool-1', 1799);
      detector.onPriceUpdate('pool-1', 1799);
      expect(onRangeExit).not.toHaveBeenCalled(); // 2.25 < 3

      detector.onPriceUpdate('pool-1', 1799);
      expect(onRangeExit).toHaveBeenCalledTimes(1); // 3.0 ≥ 3
    });

    it('should handle mixed signal weights correctly', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // Mix of weak and strong signals
      detector.onPriceUpdate('pool-1', 1799); // weak: 0.75 (total: 0.75)
      detector.onPriceUpdate('pool-1', 1700); // strong: 1.5 (total: 2.25)
      expect(onRangeExit).not.toHaveBeenCalled();

      detector.onPriceUpdate('pool-1', 1795); // moderate: 1.0 (total: 3.25)
      expect(onRangeExit).toHaveBeenCalledTimes(1);
    });
  });
});
