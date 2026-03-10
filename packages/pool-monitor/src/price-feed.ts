import { createLogger } from '@trading-bot/common';
import type { PriceUpdate } from '@trading-bot/common';

const logger = createLogger('price-feed');

interface PriceEntry {
  price: string;
  tick: number;
  timestamp: number;
}

export class PriceFeed {
  private prices: Map<string, PriceEntry> = new Map(); // poolConfigId -> latest price

  /** Update price from a PriceUpdate event */
  update(priceUpdate: PriceUpdate): void {
    this.prices.set(priceUpdate.poolConfigId, {
      price: priceUpdate.currentPrice,
      tick: priceUpdate.tick,
      timestamp: priceUpdate.timestamp,
    });
  }

  /** Get latest price for a pool config */
  getPrice(poolConfigId: string): PriceEntry | undefined {
    return this.prices.get(poolConfigId);
  }

  /** Get all latest prices */
  getAllPrices(): Map<string, PriceEntry> {
    return new Map(this.prices);
  }

  /** Remove price tracking for a pool */
  remove(poolConfigId: string): void {
    this.prices.delete(poolConfigId);
  }

  /** Clear all prices */
  clear(): void {
    this.prices.clear();
  }
}
