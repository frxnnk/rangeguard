import { createLogger } from '@trading-bot/common';
import type { HyperliquidClient } from './hyperliquid-client.js';

const logger = createLogger('stop-loss');

interface BackupSL {
  walletId: string;
  asset: string;
  orderIds: number[];
}

export class StopLossManager {
  private hlClient: HyperliquidClient;
  // poolConfigId+walletType -> backup SL info
  private activeSLs: Map<string, BackupSL> = new Map();

  constructor(hlClient: HyperliquidClient) {
    this.hlClient = hlClient;
  }

  /** Calculate backup stop-loss price based on range boundaries */
  calculateBackupSL(
    rangeLower: number,
    rangeUpper: number,
    exitDirection: 'below' | 'above',
    bufferPercent: number = 2,
  ): number {
    if (exitDirection === 'below') {
      // Short hedge: SL when price comes back into range (buy to close)
      return rangeLower * (1 + bufferPercent / 100);
    } else {
      // Long hedge: SL when price comes back down into range (sell to close)
      return rangeUpper * (1 - bufferPercent / 100);
    }
  }

  /** Place backup SL orders on Hyperliquid after hedge opens */
  async placeBackupSL(
    poolConfigId: string,
    walletId: string,
    walletType: 'protection' | 'profit',
    asset: string,
    side: 'short' | 'long',
    size: string,
    rangeLower: number,
    rangeUpper: number,
    exitDirection: 'below' | 'above',
  ): Promise<void> {
    if (!this.hlClient.hasWallet(walletId)) {
      logger.warn({ poolConfigId, walletId }, 'No wallet client for SL placement');
      return;
    }

    const triggerPrice = this.calculateBackupSL(rangeLower, rangeUpper, exitDirection);
    // For short: buy to close when price goes up to trigger
    // For long: sell to close when price drops to trigger
    const isBuy = side === 'short';

    logger.info(
      {
        poolConfigId,
        walletId,
        walletType,
        asset,
        side,
        size,
        triggerPrice: triggerPrice.toFixed(2),
      },
      'Placing backup stop-loss',
    );

    const result = await this.hlClient.placeStopLoss(walletId, asset, isBuy, size, triggerPrice);

    if (result.success && result.orderId) {
      const key = `${poolConfigId}:${walletType}`;
      const existing = this.activeSLs.get(key);
      const orderId = parseInt(result.orderId);

      if (existing) {
        existing.orderIds.push(orderId);
      } else {
        this.activeSLs.set(key, {
          walletId,
          asset,
          orderIds: [orderId],
        });
      }

      logger.info({ poolConfigId, walletType, orderId: result.orderId }, 'Backup SL placed');
    } else {
      logger.error({ poolConfigId, walletType, error: result.error }, 'Failed to place backup SL');
    }
  }

  /** Cancel backup SL orders when hedge closes normally */
  async cancelBackupSL(poolConfigId: string, walletType: 'protection' | 'profit'): Promise<void> {
    const key = `${poolConfigId}:${walletType}`;
    const sl = this.activeSLs.get(key);

    if (!sl || sl.orderIds.length === 0) {
      return;
    }

    logger.info(
      {
        poolConfigId,
        walletType,
        orderIds: sl.orderIds,
      },
      'Cancelling backup SL orders',
    );

    await this.hlClient.cancelOrders(sl.walletId, sl.asset, sl.orderIds);
    this.activeSLs.delete(key);
  }

  /** Cancel all backup SLs for a pool (on range return) */
  async cancelAllForPool(poolConfigId: string): Promise<void> {
    await this.cancelBackupSL(poolConfigId, 'protection');
    await this.cancelBackupSL(poolConfigId, 'profit');
  }

  /** Log that primary SL (range-return) was triggered */
  onRangeReturn(poolConfigId: string, currentPrice: string): void {
    logger.info({ poolConfigId, currentPrice }, 'Primary SL triggered: range return detected');
  }
}
