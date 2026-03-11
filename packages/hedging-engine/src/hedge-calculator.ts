import { createLogger } from '@rangeguard/common';
import type { PoolConfig, HedgeSide } from '@rangeguard/common';

const logger = createLogger('hedge-calculator');

export interface HedgeParams {
  asset: string;
  side: HedgeSide;
  size: string; // in USD
  leverage: number;
  currentPrice: number;
}

export class HedgeCalculator {
  /**
   * Calculate hedge parameters from pool config.
   * The user manually entered the pool amount, so we use that directly.
   *
   * - Price exits below range -> SHORT (hedge against IL from price drop)
   * - Price exits above range -> LONG (hedge against IL from price rise)
   */
  calculate(
    config: PoolConfig,
    currentPrice: number,
    exitDirection: 'below' | 'above',
  ): HedgeParams {
    if (currentPrice <= 0) {
      throw new Error('Current price must be positive');
    }

    const poolAmountUsd = parseFloat(config.poolAmount);
    if (poolAmountUsd <= 0 || isNaN(poolAmountUsd)) {
      throw new Error('Pool amount must be a positive number');
    }

    const side: HedgeSide = exitDirection === 'below' ? 'short' : 'long';

    // hedgeRatio: 1.0 = full hedge, 0.5 = half, etc.
    const hedgeRatio = config.hedgeRatio ?? 1.0;

    // The pool amount is the total value.
    // Size for HL = (poolAmount * hedgeRatio) / currentPrice (convert USD to asset units)
    const sizeInAsset = (poolAmountUsd * hedgeRatio) / currentPrice;

    // Round to reasonable precision
    const size = formatSize(sizeInAsset, config.hedgeAsset);

    if (parseFloat(size) === 0) {
      throw new Error(
        'Calculated hedge size rounds to zero — pool amount too small for current price',
      );
    }

    logger.info(
      {
        configId: config.id,
        asset: config.hedgeAsset,
        side,
        poolAmountUsd,
        hedgeRatio,
        currentPrice,
        sizeInAsset: size,
        leverage: config.leverage,
      },
      'Hedge calculated',
    );

    return {
      asset: config.hedgeAsset,
      side,
      size,
      leverage: config.leverage,
      currentPrice,
    };
  }
}

function formatSize(size: number, asset: string): string {
  // Different assets have different precision on HL
  switch (asset) {
    case 'BTC':
      return size.toFixed(5);
    case 'ETH':
      return size.toFixed(4);
    default:
      return size.toFixed(2);
  }
}
