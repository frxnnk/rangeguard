import { describe, it, expect } from 'vitest';
import {
  tickToSqrtPriceX96,
  calculateTokenAmounts,
  calculatePositionValueUsd,
  sqrtPriceX96ToPrice,
  tickToPrice,
  priceToTick,
} from './tick-math.js';

describe('tickToSqrtPriceX96', () => {
  it('returns Q96 for tick 0 (price = 1.0)', () => {
    const result = tickToSqrtPriceX96(0);
    const Q96 = 2n ** 96n;
    // At tick 0, sqrtPrice = 1.0, so sqrtPriceX96 = Q96
    expect(result).toBe(Q96);
  });

  it('returns correct value for positive tick', () => {
    const result = tickToSqrtPriceX96(1000);
    // sqrt(1.0001^1000) * 2^96 ≈ 83795849020095419204...
    expect(result).toBeGreaterThan(0n);
    // Verify round-trip: convert back to price and compare
    const price = sqrtPriceX96ToPrice(result, 18, 18);
    const expectedPrice = tickToPrice(1000, 18, 18);
    expect(price).toBeCloseTo(expectedPrice, 2);
  });

  it('returns correct value for negative tick', () => {
    const result = tickToSqrtPriceX96(-1000);
    const Q96 = 2n ** 96n;
    expect(result).toBeLessThan(Q96); // price < 1
    expect(result).toBeGreaterThan(0n);
  });
});

describe('calculateTokenAmounts', () => {
  // Using a realistic ETH/USDC scenario
  // Tick at ETH=$2000 with 18/6 decimals: tick ≈ priceToTick(2000, 18, 6)
  const tickLower = priceToTick(1800, 18, 6);
  const tickUpper = priceToTick(2200, 18, 6);
  const liquidity = 1_000_000_000_000n; // 1e12

  it('returns only token0 when price is below range', () => {
    const sqrtPrice = tickToSqrtPriceX96(priceToTick(1700, 18, 6));
    const { amount0, amount1 } = calculateTokenAmounts(liquidity, sqrtPrice, tickLower, tickUpper);
    expect(amount0).toBeGreaterThan(0n);
    expect(amount1).toBe(0n);
  });

  it('returns only token1 when price is above range', () => {
    const sqrtPrice = tickToSqrtPriceX96(priceToTick(2300, 18, 6));
    const { amount0, amount1 } = calculateTokenAmounts(liquidity, sqrtPrice, tickLower, tickUpper);
    expect(amount0).toBe(0n);
    expect(amount1).toBeGreaterThan(0n);
  });

  it('returns both tokens when price is in range', () => {
    const sqrtPrice = tickToSqrtPriceX96(priceToTick(2000, 18, 6));
    const { amount0, amount1 } = calculateTokenAmounts(liquidity, sqrtPrice, tickLower, tickUpper);
    expect(amount0).toBeGreaterThan(0n);
    expect(amount1).toBeGreaterThan(0n);
  });

  it('returns zero amounts for zero liquidity', () => {
    const sqrtPrice = tickToSqrtPriceX96(priceToTick(2000, 18, 6));
    const { amount0, amount1 } = calculateTokenAmounts(0n, sqrtPrice, tickLower, tickUpper);
    expect(amount0).toBe(0n);
    expect(amount1).toBe(0n);
  });
});

describe('calculatePositionValueUsd', () => {
  it('calculates correct USD value', () => {
    // 1 ETH (18 decimals) + 2000 USDC (6 decimals)
    const amount0 = 1_000_000_000_000_000_000n; // 1e18 = 1 ETH
    const amount1 = 2_000_000_000n; // 2e9 = 2000 USDC
    const value = calculatePositionValueUsd(amount0, 18, 2000, amount1, 6, 1);
    expect(value).toBeCloseTo(4000, 0); // 1 ETH * $2000 + 2000 USDC * $1
  });

  it('handles zero amounts', () => {
    const value = calculatePositionValueUsd(0n, 18, 2000, 0n, 6, 1);
    expect(value).toBe(0);
  });

  it('handles only token0', () => {
    const amount0 = 500_000_000_000_000_000n; // 0.5 ETH
    const value = calculatePositionValueUsd(amount0, 18, 2000, 0n, 6, 1);
    expect(value).toBeCloseTo(1000, 0);
  });

  it('handles only token1', () => {
    const amount1 = 5_000_000_000n; // 5000 USDC
    const value = calculatePositionValueUsd(0n, 18, 2000, amount1, 6, 1);
    expect(value).toBeCloseTo(5000, 0);
  });
});
