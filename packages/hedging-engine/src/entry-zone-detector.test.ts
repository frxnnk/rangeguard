import { describe, it, expect, beforeEach } from 'vitest';
import { EntryZoneDetector, type EntrySignal } from './entry-zone-detector.js';
import type { PoolConfig } from '@rangeguard/common';

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
    rangeLower: 2000,
    rangeUpper: 2500,
    poolAmount: '10000',
    hedgeAsset: 'ETH',
    leverage: 10,
    protectionDirection: 'below',
    protectionWalletId: 'wallet-1',
    profitWalletEnabled: false,
    hedgeRatio: 1.0,
    hedgeCooldownSeconds: 300,
    debounceCount: 3,
    protectionActive: true,
    status: 'in-range',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tradingEnabled: true,
    tradingLeverage: 5,
    tradingStopLossPercent: 2.0,
    tradingTrailingPercent: 1.5,
    tradingEntryZonePercent: 25,
    tradingCooldownSeconds: 300,
    tradingMaxSizeUsd: 1000,
    ...overrides,
  };
}

describe('EntryZoneDetector', () => {
  let signals: EntrySignal[];
  let detector: EntryZoneDetector;

  beforeEach(() => {
    signals = [];
    detector = new EntryZoneDetector((s) => signals.push(s), 3);
  });

  it('should not emit signal before debounce threshold', () => {
    const config = makeConfig();
    detector.register(config);

    // Price in low zone: 2000 + 500*0.25 = 2125
    detector.onPriceUpdate('pool-1', 2050); // count 1
    detector.onPriceUpdate('pool-1', 2050); // count 2
    expect(signals).toHaveLength(0);
  });

  it('should emit long signal when price enters low zone after debounce', () => {
    const config = makeConfig();
    detector.register(config);

    // Low threshold = 2000 + (500 * 0.25) = 2125
    detector.onPriceUpdate('pool-1', 2050); // count 1
    detector.onPriceUpdate('pool-1', 2050); // count 2
    detector.onPriceUpdate('pool-1', 2050); // count 3 → transition
    expect(signals).toHaveLength(1);
    expect(signals[0].side).toBe('long');
    expect(signals[0].zone).toBe('low');
  });

  it('should emit short signal when price enters high zone after debounce', () => {
    const config = makeConfig();
    detector.register(config);

    // High threshold = 2500 - (500 * 0.25) = 2375
    detector.onPriceUpdate('pool-1', 2400); // count 1
    detector.onPriceUpdate('pool-1', 2400); // count 2
    detector.onPriceUpdate('pool-1', 2400); // count 3 → transition
    expect(signals).toHaveLength(1);
    expect(signals[0].side).toBe('short');
    expect(signals[0].zone).toBe('high');
  });

  it('should not emit signal in neutral zone', () => {
    const config = makeConfig();
    detector.register(config);

    // Neutral is between 2125 and 2375
    detector.onPriceUpdate('pool-1', 2250);
    detector.onPriceUpdate('pool-1', 2250);
    detector.onPriceUpdate('pool-1', 2250);
    expect(signals).toHaveLength(0);
  });

  it('should not emit signal when price is outside range', () => {
    const config = makeConfig();
    detector.register(config);

    detector.onPriceUpdate('pool-1', 1900); // below range
    detector.onPriceUpdate('pool-1', 1900);
    detector.onPriceUpdate('pool-1', 1900);
    expect(signals).toHaveLength(0);

    detector.onPriceUpdate('pool-1', 2600); // above range
    detector.onPriceUpdate('pool-1', 2600);
    detector.onPriceUpdate('pool-1', 2600);
    expect(signals).toHaveLength(0);
  });

  it('should reset debounce if price oscillates between zones', () => {
    const config = makeConfig();
    detector.register(config);

    detector.onPriceUpdate('pool-1', 2050); // low zone, count 1
    detector.onPriceUpdate('pool-1', 2050); // low zone, count 2
    detector.onPriceUpdate('pool-1', 2400); // high zone, reset to count 1
    detector.onPriceUpdate('pool-1', 2050); // low zone, reset to count 1
    expect(signals).toHaveLength(0);
  });

  it('should respect cooldown', () => {
    const config = makeConfig({ tradingCooldownSeconds: 600 });
    detector.register(config);

    // Enter low zone
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    expect(signals).toHaveLength(1);

    // Return to neutral
    detector.onPriceUpdate('pool-1', 2250);
    detector.onPriceUpdate('pool-1', 2250);
    detector.onPriceUpdate('pool-1', 2250);

    // Set cooldown
    detector.setCooldown('pool-1');

    // Enter low zone again — should be blocked by cooldown
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    expect(signals).toHaveLength(1); // still 1
  });

  it('should only emit on transition from neutral to entry zone', () => {
    const config = makeConfig();
    detector.register(config);

    // Enter low zone
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    expect(signals).toHaveLength(1);

    // Stay in low zone — no additional signal
    detector.onPriceUpdate('pool-1', 2060);
    detector.onPriceUpdate('pool-1', 2060);
    detector.onPriceUpdate('pool-1', 2060);
    expect(signals).toHaveLength(1);
  });

  it('should work with custom entry zone percent', () => {
    // 10% entry zone: low = 2000-2050, high = 2450-2500
    const config = makeConfig({ tradingEntryZonePercent: 10 });
    detector.register(config);

    // 2125 is NOT in 10% low zone (would be in 25% low zone)
    detector.onPriceUpdate('pool-1', 2100);
    detector.onPriceUpdate('pool-1', 2100);
    detector.onPriceUpdate('pool-1', 2100);
    expect(signals).toHaveLength(0);

    // 2030 IS in 10% low zone
    detector.onPriceUpdate('pool-1', 2030);
    detector.onPriceUpdate('pool-1', 2030);
    detector.onPriceUpdate('pool-1', 2030);
    expect(signals).toHaveLength(1);
    expect(signals[0].side).toBe('long');
  });

  it('should unregister and stop tracking', () => {
    const config = makeConfig();
    detector.register(config);
    detector.unregister('pool-1');

    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    detector.onPriceUpdate('pool-1', 2050);
    expect(signals).toHaveLength(0);
  });
});
