import { createLogger } from '@rangeguard/common';
import type { StopLossRepository } from '@rangeguard/db';
import type { HyperliquidClient } from './hyperliquid-client.js';

const logger = createLogger('stop-loss');

interface BackupSL {
  walletId: string;
  asset: string;
  orderIds: number[];
}

export class StopLossManager {
  private hlClient: HyperliquidClient;
  private slRepo?: StopLossRepository;
  // In-memory cache: poolConfigId+walletType -> backup SL info
  private activeSLs: Map<string, BackupSL> = new Map();

  constructor(hlClient: HyperliquidClient, slRepo?: StopLossRepository) {
    this.hlClient = hlClient;
    this.slRepo = slRepo;
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
      const orderId = parseInt(result.orderId);
      const existing = this.activeSLs.get(key);

      if (existing) {
        existing.orderIds.push(orderId);
      } else {
        this.activeSLs.set(key, {
          walletId,
          asset,
          orderIds: [orderId],
        });
      }

      // Persist to DB
      this.slRepo?.create(poolConfigId, walletId, walletType, asset, orderId);

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
      // Try from DB if not in memory (e.g. after restart)
      if (this.slRepo) {
        const dbOrders = this.slRepo.findActive(poolConfigId, walletType);
        if (dbOrders.length > 0) {
          const walletId = dbOrders[0].walletId;
          const asset = dbOrders[0].asset;
          const orderIds = dbOrders.map((o) => o.hlOrderId);

          logger.info({ poolConfigId, walletType, orderIds }, 'Cancelling SL orders from DB');
          await this.hlClient.cancelOrders(walletId, asset, orderIds);
          this.slRepo.markCancelled(poolConfigId, walletType);
        }
      }
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

    // Update DB
    this.slRepo?.markCancelled(poolConfigId, walletType);
  }

  /** Cancel all backup SLs for a pool (on range return) */
  async cancelAllForPool(poolConfigId: string): Promise<void> {
    await this.cancelBackupSL(poolConfigId, 'protection');
    await this.cancelBackupSL(poolConfigId, 'profit');
  }

  /** Cancel orphaned SL orders from a previous bot session */
  async cleanupOrphanedSLs(): Promise<void> {
    if (!this.slRepo) return;

    const activeOrders = this.slRepo.findAllActive();
    if (activeOrders.length === 0) return;

    logger.info({ count: activeOrders.length }, 'Found orphaned SL orders — attempting cleanup');

    // Group by walletId + asset for batch cancellation
    const groups = new Map<string, { walletId: string; asset: string; orderIds: number[] }>();
    for (const order of activeOrders) {
      const key = `${order.walletId}:${order.asset}`;
      const group = groups.get(key);
      if (group) {
        group.orderIds.push(order.hlOrderId);
      } else {
        groups.set(key, {
          walletId: order.walletId,
          asset: order.asset,
          orderIds: [order.hlOrderId],
        });
      }
    }

    for (const group of groups.values()) {
      if (!this.hlClient.hasWallet(group.walletId)) {
        logger.warn({ walletId: group.walletId }, 'Cannot cancel orphaned SLs — no wallet key');
        continue;
      }

      try {
        await this.hlClient.cancelOrders(group.walletId, group.asset, group.orderIds);
        this.slRepo.markCancelledByIds(group.orderIds);
        logger.info(
          { walletId: group.walletId, asset: group.asset, count: group.orderIds.length },
          'Orphaned SL orders cancelled',
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(
          { walletId: group.walletId, asset: group.asset, error: msg },
          'Failed to cancel some orphaned SLs (may already be filled/cancelled)',
        );
        // Mark as cancelled anyway — they're either already gone or we can't cancel them
        this.slRepo.markCancelledByIds(group.orderIds);
      }
    }
  }

  /** Log that primary SL (range-return) was triggered */
  onRangeReturn(poolConfigId: string, currentPrice: string): void {
    logger.info({ poolConfigId, currentPrice }, 'Primary SL triggered: range return detected');
  }
}
