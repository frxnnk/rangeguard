import { describe, it, expect, beforeEach } from 'vitest';
import type { PoolConfig } from '@rangeguard/common';
import { HedgeCalculator } from './hedge-calculator.js';

function makeConfig(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return {
    id: 'test-pool',
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

describe('HedgeCalculator', () => {
  let calc: HedgeCalculator;

  beforeEach(() => {
    calc = new HedgeCalculator();
  });

  describe('side selection', () => {
    it('should return side=short when exit direction is below', () => {
      const config = makeConfig();
      const result = calc.calculate(config, 2000, 'below');
      expect(result.side).toBe('short');
    });

    it('should return side=long when exit direction is above', () => {
      const config = makeConfig();
      const result = calc.calculate(config, 2000, 'above');
      expect(result.side).toBe('long');
    });
  });

  describe('size calculation', () => {
    it('should compute size as poolAmount / currentPrice', () => {
      const config = makeConfig({ poolAmount: '10000', hedgeAsset: 'ETH' });
      const result = calc.calculate(config, 2000, 'below');
      // 10000 / 2000 = 5.0, ETH uses 4 decimals
      expect(result.size).toBe('5.0000');
    });

    it('should format BTC with 5 decimals', () => {
      const config = makeConfig({ poolAmount: '50000', hedgeAsset: 'BTC' });
      const result = calc.calculate(config, 50000, 'below');
      // 50000 / 50000 = 1.0
      expect(result.size).toBe('1.00000');
    });

    it('should format ETH with 4 decimals', () => {
      const config = makeConfig({ poolAmount: '10000', hedgeAsset: 'ETH' });
      const result = calc.calculate(config, 3000, 'below');
      // 10000 / 3000 = 3.3333...
      expect(result.size).toBe('3.3333');
    });

    it('should format other assets with 2 decimals', () => {
      const config = makeConfig({ poolAmount: '10000', hedgeAsset: 'SOL' });
      const result = calc.calculate(config, 100, 'below');
      // 10000 / 100 = 100.0
      expect(result.size).toBe('100.00');
    });
  });

  describe('hedge ratio', () => {
    it('should apply hedgeRatio to size calculation', () => {
      const config = makeConfig({ poolAmount: '10000', hedgeAsset: 'ETH', hedgeRatio: 0.5 });
      const result = calc.calculate(config, 2000, 'below');
      // 10000 * 0.5 / 2000 = 2.5
      expect(result.size).toBe('2.5000');
    });

    it('should default to 1.0 when hedgeRatio is undefined', () => {
      const config = makeConfig({ poolAmount: '10000', hedgeAsset: 'ETH' });
      // hedgeRatio not set in makeConfig defaults, should behave as 1.0
      const result = calc.calculate(config, 2000, 'below');
      expect(result.size).toBe('5.0000');
    });

    it('should support hedgeRatio > 1.0', () => {
      const config = makeConfig({ poolAmount: '10000', hedgeAsset: 'ETH', hedgeRatio: 1.5 });
      const result = calc.calculate(config, 2000, 'below');
      // 10000 * 1.5 / 2000 = 7.5
      expect(result.size).toBe('7.5000');
    });
  });

  describe('passthrough fields', () => {
    it('should pass through leverage from config', () => {
      const config = makeConfig({ leverage: 5 });
      const result = calc.calculate(config, 2000, 'below');
      expect(result.leverage).toBe(5);
    });

    it('should pass through hedgeAsset as asset', () => {
      const config = makeConfig({ hedgeAsset: 'BTC' });
      const result = calc.calculate(config, 50000, 'below');
      expect(result.asset).toBe('BTC');
    });
  });

  describe('input validation', () => {
    it('should throw if currentPrice is 0', () => {
      const config = makeConfig();
      expect(() => calc.calculate(config, 0, 'below')).toThrow();
    });

    it('should throw if currentPrice is negative', () => {
      const config = makeConfig();
      expect(() => calc.calculate(config, -100, 'below')).toThrow();
    });

    it('should throw if poolAmount is 0', () => {
      const config = makeConfig({ poolAmount: '0' });
      expect(() => calc.calculate(config, 2000, 'below')).toThrow();
    });

    it('should throw if poolAmount is NaN', () => {
      const config = makeConfig({ poolAmount: 'abc' });
      expect(() => calc.calculate(config, 2000, 'below')).toThrow();
    });

    it('should throw if calculated size rounds to 0', () => {
      // 0.001 / 100000 = 0.00000001, which rounds to '0.00' for non-BTC/ETH
      const config = makeConfig({ poolAmount: '0.001', hedgeAsset: 'SOL' });
      expect(() => calc.calculate(config, 100000, 'below')).toThrow();
    });
  });
});
