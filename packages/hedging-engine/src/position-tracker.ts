import { createLogger } from '@trading-bot/common';
import type { HedgeTrade } from '@trading-bot/common';
import type { HedgesRepository } from '@trading-bot/db';

const logger = createLogger('position-tracker');

export class PositionTracker {
  private hedgesRepo: HedgesRepository;

  constructor(hedgesRepo: HedgesRepository) {
    this.hedgesRepo = hedgesRepo;
  }

  /** Check if a pool has open hedges */
  hasOpenHedge(poolConfigId: string): boolean {
    const open = this.hedgesRepo.findOpenByPool(poolConfigId);
    return open.length > 0;
  }

  /** Get open hedges for a pool */
  getOpenHedges(poolConfigId: string): HedgeTrade[] {
    return this.hedgesRepo.findOpenByPool(poolConfigId);
  }

  /** Get all open hedges */
  getAllOpenHedges(): HedgeTrade[] {
    return this.hedgesRepo.findOpen();
  }

  /** Record a new hedge trade */
  recordOpen(
    poolConfigId: string,
    walletId: string,
    walletType: 'protection' | 'profit',
    asset: string,
    side: 'short' | 'long',
    size: string,
    entryPrice: string,
    leverage: number,
    hlOrderId?: string,
    fees?: string,
  ): HedgeTrade {
    const trade = this.hedgesRepo.create({
      poolConfigId,
      walletId,
      walletType,
      asset,
      side,
      size,
      entryPrice,
      leverage,
      fees,
      hlOrderId,
    });
    logger.info({ tradeId: trade.id, poolConfigId, side, size, fees }, 'Hedge trade recorded');
    return trade;
  }

  /** Record hedge closure */
  recordClose(
    tradeId: string,
    exitPrice: string,
    realizedPnl: string,
    closeReason: 'range_return' | 'manual' | 'liquidated',
    isFalseBreakout: boolean,
    closeFees?: string,
  ): void {
    this.hedgesRepo.close(tradeId, exitPrice, realizedPnl, closeReason, isFalseBreakout, closeFees);
    logger.info(
      { tradeId, exitPrice, realizedPnl, closeReason, isFalseBreakout, closeFees },
      'Hedge trade closed',
    );
  }
}
