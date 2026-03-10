import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PoolConfig, ProtectionDirection } from '@trading-bot/common';
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

    it('should reset debounce count when price oscillates back in range', () => {
      detector.register(makeConfig({ protectionDirection: 'both' }));

      // 2 out-of-range, then back in range, then 1 out-of-range
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 2000); // back in range, resets count
      detector.onPriceUpdate('pool-1', 1700); // count restarts at 1

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

      // Price 1700 is below rangeLower=1800, would normally trigger exit
      detector.onPriceUpdate('pool-1', 1700);
      detector.onPriceUpdate('pool-1', 1700);
      // 2 out of 3 - not triggered yet

      // Now widen the range: lower to 1500
      detector.updateConfig('pool-1', 1500, 2200, 'both');

      // Reset by sending an in-range price (1700 is now in range since lower=1500)
      detector.onPriceUpdate('pool-1', 1700);

      // The 1700 update is now in-range, so it should not fire exit
      expect(onRangeExit).not.toHaveBeenCalled();
    });
  });
});
