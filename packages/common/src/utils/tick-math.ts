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
