const Q96 = 2n ** 96n;
const Q192 = Q96 * Q96;

/**
 * Convert sqrtPriceX96 to a human-readable price.
 * price = (sqrtPriceX96 / 2^96)^2
 * Adjusts for token decimal differences.
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  token0Decimals: number = 18,
  token1Decimals: number = 6,
): number {
  const numerator = sqrtPriceX96 * sqrtPriceX96;
  const denominator = Q192;

  // Adjust for decimal differences
  const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);

  // Convert to number with precision
  const price = (Number(numerator) / Number(denominator)) * decimalAdjustment;
  return price;
}

/**
 * Convert tick to price.
 * price = 1.0001^tick
 */
export function tickToPrice(
  tick: number,
  token0Decimals: number = 18,
  token1Decimals: number = 6,
): number {
  const price = Math.pow(1.0001, tick);
  const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
  return price * decimalAdjustment;
}

/**
 * Convert price to tick.
 * tick = log(price) / log(1.0001)
 */
export function priceToTick(
  price: number,
  token0Decimals: number = 18,
  token1Decimals: number = 6,
): number {
  const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
  const adjustedPrice = price / decimalAdjustment;
  const tick = Math.log(adjustedPrice) / Math.log(1.0001);
  return Math.round(tick);
}

/**
 * Format a price for display (respects significant digits).
 */
export function formatPrice(price: number, significantDigits: number = 6): string {
  if (price === 0) return '0';
  if (price >= 1) {
    return price.toFixed(Math.min(significantDigits, 2));
  }
  return price.toPrecision(significantDigits);
}

/**
 * Convert tick to sqrtPriceX96 (bigint).
 * sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
 */
export function tickToSqrtPriceX96(tick: number): bigint {
  const sqrtPrice = Math.sqrt(Math.pow(1.0001, tick));
  // Multiply by 2^96 and convert to bigint
  // Use string conversion to avoid precision loss
  const result = sqrtPrice * Number(Q96);
  return BigInt(Math.round(result));
}

/**
 * Calculate token amounts for a Uniswap V3 position given liquidity and price bounds.
 *
 * Uses the Uniswap V3 liquidity formulas:
 * - Below range: amount0 = L * (1/sqrtLower - 1/sqrtUpper), amount1 = 0
 * - Above range: amount0 = 0, amount1 = L * (sqrtUpper - sqrtLower)
 * - In range:    amount0 = L * (1/sqrtPrice - 1/sqrtUpper), amount1 = L * (sqrtPrice - sqrtLower)
 *
 * All math done in bigint with Q96 precision.
 */
export function calculateTokenAmounts(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
): { amount0: bigint; amount1: bigint } {
  const sqrtLowerX96 = tickToSqrtPriceX96(tickLower);
  const sqrtUpperX96 = tickToSqrtPriceX96(tickUpper);

  let amount0 = 0n;
  let amount1 = 0n;

  if (sqrtPriceX96 <= sqrtLowerX96) {
    // Price below range — all token0
    // amount0 = L * Q96 * (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper)
    amount0 =
      (liquidity * Q96 * (sqrtUpperX96 - sqrtLowerX96)) / (sqrtLowerX96 * sqrtUpperX96);
  } else if (sqrtPriceX96 >= sqrtUpperX96) {
    // Price above range — all token1
    // amount1 = L * (sqrtUpper - sqrtLower) / Q96
    amount1 = (liquidity * (sqrtUpperX96 - sqrtLowerX96)) / Q96;
  } else {
    // Price in range — mix of both
    // amount0 = L * Q96 * (sqrtUpper - sqrtPrice) / (sqrtPrice * sqrtUpper)
    amount0 =
      (liquidity * Q96 * (sqrtUpperX96 - sqrtPriceX96)) / (sqrtPriceX96 * sqrtUpperX96);
    // amount1 = L * (sqrtPrice - sqrtLower) / Q96
    amount1 = (liquidity * (sqrtPriceX96 - sqrtLowerX96)) / Q96;
  }

  return { amount0, amount1 };
}

/**
 * Calculate the USD value of a position given token amounts and prices.
 */
export function calculatePositionValueUsd(
  amount0: bigint,
  decimals0: number,
  price0: number,
  amount1: bigint,
  decimals1: number,
  price1: number,
): number {
  const value0 = (Number(amount0) / 10 ** decimals0) * price0;
  const value1 = (Number(amount1) / 10 ** decimals1) * price1;
  return value0 + value1;
}
