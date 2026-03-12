/**
 * Uniswap V3 concentrated liquidity LP position simulator.
 * Calculates IL (impermanent loss) and estimated fee income over time.
 *
 * Uses floating-point math with human-readable prices (not Q96 bigints)
 * since we only need approximate values for backtest analysis.
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

  // Fee accrual rate: per millisecond
  const dailyFees = poolAmountUsd * (feeAprPercent / 100) / 365;
  const msPerDay = 86_400_000;

  const startTime = prices[0].timestamp;
  const snapshots: LpSnapshot[] = [];

  // Sample snapshots (every ~100 points to avoid huge arrays)
  const step = Math.max(1, Math.floor(prices.length / 500));

  for (let i = 0; i < prices.length; i += step) {
    const { timestamp, price } = prices[i];
    const elapsed = timestamp - startTime;

    const currentValue = positionValue(L, price, rangeLower, rangeUpper);
    const hodl = initial.amount0 * price + initial.amount1;
    const il = currentValue - hodl;
    const ilPct = hodl !== 0 ? (il / hodl) * 100 : 0;
    const fees = dailyFees * (elapsed / msPerDay);
    const netLp = il + fees;

    snapshots.push({
      timestamp,
      price,
      positionValue: currentValue,
      hodlValue: hodl,
      il,
      ilPercent: ilPct,
      accumulatedFees: fees,
      netLpPnl: netLp,
    });
  }

  // Always include the last point
  const last = prices[prices.length - 1];
  const totalElapsed = last.timestamp - startTime;
  const finalValue = positionValue(L, last.price, rangeLower, rangeUpper);
  const finalHodl = initial.amount0 * last.price + initial.amount1;
  const totalIL = finalValue - finalHodl;
  const totalFees = dailyFees * (totalElapsed / msPerDay);

  return {
    entryPrice,
    finalPrice: last.price,
    liquidity: L,
    positionValueStart: startValue,
    positionValueEnd: finalValue,
    hodlValueEnd: finalHodl,
    totalIL,
    ilPercent: finalHodl !== 0 ? (totalIL / finalHodl) * 100 : 0,
    totalFees,
    netLpPnl: totalIL + totalFees,
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
    snapshots: [],
  };
}
