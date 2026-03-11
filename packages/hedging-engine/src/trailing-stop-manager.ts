import { createLogger } from '@rangeguard/common';
import type { RangeTrade } from '@rangeguard/common';
import type { RangeTradesRepository } from '@rangeguard/db';

const logger = createLogger('trailing-stop');

export interface TrailingStopTrigger {
  tradeId: string;
  poolConfigId: string;
  triggerPrice: number;
}

type TrailingStopCallback = (trigger: TrailingStopTrigger) => void;

interface TrackedTrade {
  tradeId: string;
  poolConfigId: string;
  side: 'short' | 'long';
  trailingPercent: number;
  stopLossPrice: number;
  peakPrice: number;
  currentStopPrice: number;
  lastDbWriteAt: number;
}

const DB_WRITE_THROTTLE_MS = 10_000; // Write to DB at most every 10s

/**
 * Manages trailing stops for range trades.
 * Updates peak price and trailing stop in memory on every tick,
 * persists to DB every 10s (crash recovery).
 * Fires callback when stop is hit.
 */
export class TrailingStopManager {
  private tracked: Map<string, TrackedTrade> = new Map();
  private repo: RangeTradesRepository;
  private onStopTriggered: TrailingStopCallback;

  constructor(repo: RangeTradesRepository, onStopTriggered: TrailingStopCallback) {
    this.repo = repo;
    this.onStopTriggered = onStopTriggered;
  }

  /** Start tracking a trade */
  track(trade: RangeTrade): void {
    const entryPrice = parseFloat(trade.entryPrice);
    this.tracked.set(trade.id, {
      tradeId: trade.id,
      poolConfigId: trade.poolConfigId,
      side: trade.side,
      trailingPercent: trade.trailingPercent,
      stopLossPrice: parseFloat(trade.stopLossPrice),
      peakPrice: trade.peakPrice ? parseFloat(trade.peakPrice) : entryPrice,
      currentStopPrice: trade.currentStopPrice
        ? parseFloat(trade.currentStopPrice)
        : parseFloat(trade.stopLossPrice),
      lastDbWriteAt: Date.now(),
    });
    logger.info(
      { tradeId: trade.id, side: trade.side, trailingPercent: trade.trailingPercent },
      'Tracking trailing stop',
    );
  }

  /** Stop tracking a trade */
  untrack(tradeId: string): void {
    this.tracked.delete(tradeId);
  }

  /** Process a price update for a pool — checks all tracked trades for that pool */
  onPriceUpdate(poolConfigId: string, currentPrice: number): void {
    for (const [tradeId, t] of this.tracked) {
      if (t.poolConfigId !== poolConfigId) continue;

      // Check hard stop-loss first
      if (this.isStopLossHit(t, currentPrice)) {
        logger.info(
          { tradeId, currentPrice, stopLossPrice: t.stopLossPrice },
          'Hard stop-loss triggered',
        );
        this.tracked.delete(tradeId);
        this.onStopTriggered({ tradeId, poolConfigId, triggerPrice: currentPrice });
        continue;
      }

      // Update peak and trailing stop
      const updated = this.updatePeakAndStop(t, currentPrice);

      // Check if trailing stop was hit
      if (this.isTrailingStopHit(t, currentPrice)) {
        logger.info(
          { tradeId, currentPrice, currentStopPrice: t.currentStopPrice, peakPrice: t.peakPrice },
          'Trailing stop triggered',
        );
        // Persist final state before removing
        this.repo.updateTrailingStop(
          tradeId,
          t.peakPrice.toString(),
          t.currentStopPrice.toString(),
        );
        this.tracked.delete(tradeId);
        this.onStopTriggered({ tradeId, poolConfigId, triggerPrice: currentPrice });
        continue;
      }

      // Throttled DB persist
      if (updated) {
        const now = Date.now();
        if (now - t.lastDbWriteAt >= DB_WRITE_THROTTLE_MS) {
          this.repo.updateTrailingStop(
            tradeId,
            t.peakPrice.toString(),
            t.currentStopPrice.toString(),
          );
          t.lastDbWriteAt = now;
        }
      }
    }
  }

  /** Restore tracked trades from DB (crash recovery) */
  restoreFromDb(): void {
    const openTrades = this.repo.findOpen();
    for (const trade of openTrades) {
      this.track(trade);
    }
    if (openTrades.length > 0) {
      logger.info({ count: openTrades.length }, 'Restored trailing stops from DB');
    }
  }

  /** Force close all trades for a pool (hedge priority) — returns trade IDs */
  getTrackedForPool(poolConfigId: string): string[] {
    const ids: string[] = [];
    for (const [tradeId, t] of this.tracked) {
      if (t.poolConfigId === poolConfigId) {
        ids.push(tradeId);
      }
    }
    return ids;
  }

  hasOpenTrade(poolConfigId: string): boolean {
    for (const t of this.tracked.values()) {
      if (t.poolConfigId === poolConfigId) return true;
    }
    return false;
  }

  private updatePeakAndStop(t: TrackedTrade, currentPrice: number): boolean {
    if (t.side === 'long') {
      // Long: peak is the highest price seen
      if (currentPrice > t.peakPrice) {
        t.peakPrice = currentPrice;
        // Trailing stop moves up: peak * (1 - trail%)
        const newStop = t.peakPrice * (1 - t.trailingPercent / 100);
        // Stop can only move up, never down
        if (newStop > t.currentStopPrice) {
          t.currentStopPrice = newStop;
          return true;
        }
      }
    } else {
      // Short: peak is the lowest price seen
      if (currentPrice < t.peakPrice) {
        t.peakPrice = currentPrice;
        // Trailing stop moves down: peak * (1 + trail%)
        const newStop = t.peakPrice * (1 + t.trailingPercent / 100);
        // Stop can only move down, never up
        if (newStop < t.currentStopPrice) {
          t.currentStopPrice = newStop;
          return true;
        }
      }
    }
    return false;
  }

  private isStopLossHit(t: TrackedTrade, currentPrice: number): boolean {
    if (t.side === 'long') {
      return currentPrice <= t.stopLossPrice;
    } else {
      return currentPrice >= t.stopLossPrice;
    }
  }

  private isTrailingStopHit(t: TrackedTrade, currentPrice: number): boolean {
    if (t.side === 'long') {
      // Long trailing: price drops below current stop
      return currentPrice <= t.currentStopPrice;
    } else {
      // Short trailing: price rises above current stop
      return currentPrice >= t.currentStopPrice;
    }
  }
}
