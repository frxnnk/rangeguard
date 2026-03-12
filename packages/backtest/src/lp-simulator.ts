/**
 * Uniswap V3 concentrated liquidity LP position simulator.
 * Calculates IL (impermanent loss) and estimated fee income over time.
 *
 * Uses floating-point math with human-readable prices (not Q96 bigints)
 * since we only need approximate values for backtest analysis.
 *
 * IMPORTANT: Fees only accrue when price is IN-RANGE. An out-of-range
 * position earns zero trading fees.
 */

export interface LpConfig {
  poolAmountUsd: number;
  rangeLower: number; // price
  rangeUpper: number; // price
  entryPrice: number; // price at LP entry
  feeAprPercent: number; // estimated pool APR for fees (e.g. 20)
}

export interface LpSnapshot {
  timestamp: number;
  price: number;
  positionValue: number;
  hodlValue: number;
  il: number; // always ≤ 0
  ilPercent: number;
  accumulatedFees: number;
  netLpPnl: number; // il + fees (can be positive if fees > IL)
  inRange: boolean;
}

export interface LpMetrics {
  entryPrice: number;
  finalPrice: number;
  liquidity: number;
  positionValueStart: number;
  positionValueEnd: number;
  hodlValueEnd: number;
  totalIL: number;
  ilPercent: number;
  totalFees: number;
  netLpPnl: number; // totalIL + totalFees
  timeInRangePercent: number;
  snapshots: LpSnapshot[];
}

/**
 * Calculate liquidity L from pool value, entry price, and range.
 *
 * For price P₀ in range [Pa, Pb]:
 *   V = L × (2√P₀ − P₀/√Pb − √Pa)
 *   L = V / (2√P₀ − P₀/√Pb − √Pa)
 */
export function calculateLiquidity(
  poolAmountUsd: number,
  entryPrice: number,
  rangeLower: number,
  rangeUpper: number,
): number {
  const sqrtP = Math.sqrt(entryPrice);
  const sqrtPa = Math.sqrt(rangeLower);
  const sqrtPb = Math.sqrt(rangeUpper);

  // Clamp entry price to range for the formula
  const clampedSqrtP = Math.max(sqrtPa, Math.min(sqrtPb, sqrtP));

  const denominator = 2 * clampedSqrtP - entryPrice / sqrtPb - sqrtPa;
  if (denominator <= 0) return 0;

  return poolAmountUsd / denominator;
}

/**
 * Calculate token amounts for a V3 position at a given price.
 */
export function tokenAmounts(
  L: number,
  price: number,
  rangeLower: number,
  rangeUpper: number,
): { amount0: number; amount1: number } {
  const sqrtP = Math.sqrt(price);
  const sqrtPa = Math.sqrt(rangeLower);
  const sqrtPb = Math.sqrt(rangeUpper);

  if (price <= rangeLower) {
    // All token0 (risky asset)
    return {
      amount0: L * (1 / sqrtPa - 1 / sqrtPb),
      amount1: 0,
    };
  }

  if (price >= rangeUpper) {
    // All token1 (stablecoin)
    return {
      amount0: 0,
      amount1: L * (sqrtPb - sqrtPa),
    };
  }

  // In range: mix of both
  return {
    amount0: L * (1 / sqrtP - 1 / sqrtPb),
    amount1: L * (sqrtP - sqrtPa),
  };
}

/**
 * Calculate position value in USD at a given price.
 * token0 = risky asset (priced at `price`), token1 = stablecoin (priced at $1).
 */
export function positionValue(
  L: number,
  price: number,
  rangeLower: number,
  rangeUpper: number,
): number {
  const { amount0, amount1 } = tokenAmounts(L, price, rangeLower, rangeUpper);
  return amount0 * price + amount1;
}

/**
 * Simulate an LP position across a series of price points.
 * Returns IL, fee estimates, and snapshots at each point.
 *
 * Fees only accrue when price is within [rangeLower, rangeUpper].
 */
export function simulateLp(
  config: LpConfig,
  prices: Array<{ timestamp: number; price: number }>,
): LpMetrics {
  const { poolAmountUsd, rangeLower, rangeUpper, entryPrice, feeAprPercent } = config;

  if (prices.length === 0) {
    return emptyMetrics(config);
  }

  const L = calculateLiquidity(poolAmountUsd, entryPrice, rangeLower, rangeUpper);
  if (L <= 0) {
    return emptyMetrics(config);
  }

  // Initial token amounts (what the LP holds at entry)
  const initial = tokenAmounts(L, entryPrice, rangeLower, rangeUpper);
  const startValue = initial.amount0 * entryPrice + initial.amount1;

  // Fee accrual rate: per millisecond (only when in-range)
  const dailyFees = poolAmountUsd * (feeAprPercent / 100) / 365;
  const msPerDay = 86_400_000;
  const feeRatePerMs = dailyFees / msPerDay;

  const snapshots: LpSnapshot[] = [];

  // Track cumulative fees and in-range time by iterating ALL price points
  let accumulatedFees = 0;
  let inRangeMs = 0;
  let prevTimestamp = prices[0].timestamp;
  const totalElapsed = prices[prices.length - 1].timestamp - prices[0].timestamp;

  // Sample snapshots (every ~step points to avoid huge arrays)
  const step = Math.max(1, Math.floor(prices.length / 500));

  for (let i = 0; i < prices.length; i++) {
    const { timestamp, price } = prices[i];
    const dt = timestamp - prevTimestamp;
    const inRange = price >= rangeLower && price <= rangeUpper;

    // Only accrue fees when in-range
    if (inRange && dt > 0) {
      accumulatedFees += feeRatePerMs * dt;
      inRangeMs += dt;
    }

    prevTimestamp = timestamp;

    // Only emit snapshots at sampled intervals
    if (i % step !== 0 && i !== prices.length - 1) continue;

    const currentValue = positionValue(L, price, rangeLower, rangeUpper);
    const hodl = initial.amount0 * price + initial.amount1;
    const il = currentValue - hodl;
    const ilPct = hodl !== 0 ? (il / hodl) * 100 : 0;

    snapshots.push({
      timestamp,
      price,
      positionValue: currentValue,
      hodlValue: hodl,
      il,
      ilPercent: ilPct,
      accumulatedFees,
      netLpPnl: il + accumulatedFees,
      inRange,
    });
  }

  // Final metrics
  const last = prices[prices.length - 1];
  const finalValue = positionValue(L, last.price, rangeLower, rangeUpper);
  const finalHodl = initial.amount0 * last.price + initial.amount1;
  const totalIL = finalValue - finalHodl;
  const timeInRangePercent = totalElapsed > 0 ? (inRangeMs / totalElapsed) * 100 : 100;

  return {
    entryPrice,
    finalPrice: last.price,
    liquidity: L,
    positionValueStart: startValue,
    positionValueEnd: finalValue,
    hodlValueEnd: finalHodl,
    totalIL,
    ilPercent: finalHodl !== 0 ? (totalIL / finalHodl) * 100 : 0,
    totalFees: accumulatedFees,
    netLpPnl: totalIL + accumulatedFees,
    timeInRangePercent,
    snapshots,
  };
}

function emptyMetrics(config: LpConfig): LpMetrics {
  return {
    entryPrice: config.entryPrice,
    finalPrice: config.entryPrice,
    liquidity: 0,
    positionValueStart: config.poolAmountUsd,
    positionValueEnd: config.poolAmountUsd,
    hodlValueEnd: config.poolAmountUsd,
    totalIL: 0,
    ilPercent: 0,
    totalFees: 0,
    netLpPnl: 0,
    timeInRangePercent: 100,
    snapshots: [],
  };
}
