import { createLogger } from '@trading-bot/common';
import type { PoolConfig, RangeTradeOpenedEvent, RangeTradeClosedEvent } from '@trading-bot/common';
import type { PoolsRepository, RangeTradesRepository, TradeLogRepository } from '@trading-bot/db';
import { EntryZoneDetector, type EntrySignal } from './entry-zone-detector.js';
import { TrailingStopManager, type TrailingStopTrigger } from './trailing-stop-manager.js';
import { OrderExecutor } from './order-executor.js';
import type { HyperliquidClient } from './hyperliquid-client.js';

const logger = createLogger('range-trading');

export interface RangeTradeEventCallbacks {
  onTradeOpened?: (event: RangeTradeOpenedEvent) => void;
  onTradeClosed?: (event: RangeTradeClosedEvent) => void;
}

/**
 * Range Trading Engine (R10)
 *
 * Trades mean-reversion within the LP range:
 * - Long when price enters the low zone
 * - Short when price enters the high zone
 * - Trailing stop + hard stop-loss
 * - One position at a time per pool
 * - Hedge takes priority (forceClose)
 */
export class RangeTradingEngine {
  private poolsRepo: PoolsRepository;
  private tradesRepo: RangeTradesRepository;
  private executor: OrderExecutor;
  private hlClient: HyperliquidClient;
  private entryDetector: EntryZoneDetector;
  private trailingManager: TrailingStopManager;
  private callbacks: RangeTradeEventCallbacks;

  constructor(
    poolsRepo: PoolsRepository,
    tradesRepo: RangeTradesRepository,
    tradeLogRepo: TradeLogRepository,
    hlClient: HyperliquidClient,
    callbacks?: RangeTradeEventCallbacks,
  ) {
    this.poolsRepo = poolsRepo;
    this.tradesRepo = tradesRepo;
    this.executor = new OrderExecutor(hlClient, tradeLogRepo);
    this.hlClient = hlClient;
    this.callbacks = callbacks ?? {};

    this.entryDetector = new EntryZoneDetector((signal) => this.onEntrySignal(signal));

    this.trailingManager = new TrailingStopManager(tradesRepo, (trigger) =>
      this.onTrailingStopTriggered(trigger),
    );
  }

  /** Register a pool for range trading */
  register(config: PoolConfig): void {
    if (!config.tradingEnabled) return;
    this.entryDetector.register(config);
    logger.info({ configId: config.id }, 'Pool registered for range trading');
  }

  /** Unregister a pool */
  unregister(configId: string): void {
    this.entryDetector.unregister(configId);
  }

  /** Update config (e.g., user edited pool) */
  updateConfig(config: PoolConfig): void {
    this.entryDetector.updateConfig(
      config.id,
      config.rangeLower,
      config.rangeUpper,
      config.tradingEntryZonePercent,
      config.tradingCooldownSeconds,
    );
  }

  /** Process a price update — feeds both entry zone detector and trailing stop */
  onPriceUpdate(poolConfigId: string, currentPrice: number): void {
    this.entryDetector.onPriceUpdate(poolConfigId, currentPrice);
    this.trailingManager.onPriceUpdate(poolConfigId, currentPrice);
  }

  /** Restore open trades from DB on startup */
  restoreOpenTrades(): void {
    this.trailingManager.restoreFromDb();
  }

  /** Force close any open range trade for a pool (called by hedge engine before opening hedge) */
  async forceClose(poolConfigId: string, currentPrice: number): Promise<void> {
    const openTrades = this.tradesRepo.findOpenByPool(poolConfigId);
    if (openTrades.length === 0) return;

    const config = this.poolsRepo.findById(poolConfigId);
    if (!config) return;

    logger.warn(
      { poolConfigId, openCount: openTrades.length },
      'Force-closing range trades for hedge priority',
    );

    for (const trade of openTrades) {
      await this.closeTrade(trade.id, currentPrice, 'hedge_priority');
    }
  }

  /** Close a trade manually */
  async closeManually(tradeId: string, currentPrice: number): Promise<void> {
    await this.closeTrade(tradeId, currentPrice, 'manual');
  }

  /** Check if pool has an open range trade */
  hasOpenTrade(poolConfigId: string): boolean {
    return this.trailingManager.hasOpenTrade(poolConfigId);
  }

  /** Handle entry signal from entry zone detector */
  private async onEntrySignal(signal: EntrySignal): Promise<void> {
    const config = this.poolsRepo.findById(signal.poolConfigId);
    if (!config || !config.tradingEnabled) return;

    // One position at a time
    if (this.trailingManager.hasOpenTrade(config.id)) {
      logger.info({ configId: config.id }, 'Already has open range trade, skipping entry');
      return;
    }

    // Check wallet key is loaded
    if (!this.hlClient.hasWallet(config.protectionWalletId)) {
      logger.warn(
        { configId: config.id, walletId: config.protectionWalletId },
        'Wallet has no private key loaded — skipping range trade',
      );
      return;
    }

    // Calculate position size
    const sizeUsd = Math.min(config.tradingMaxSizeUsd, parseFloat(config.poolAmount) * 0.5);
    const sizeInAsset = sizeUsd / signal.currentPrice;
    const size = formatSize(sizeInAsset, config.hedgeAsset);

    if (parseFloat(size) === 0) {
      logger.warn({ configId: config.id }, 'Calculated range trade size rounds to zero');
      return;
    }

    // Calculate stop-loss price
    const slPercent = config.tradingStopLossPercent / 100;
    let stopLossPrice: number;
    if (signal.side === 'long') {
      stopLossPrice = signal.currentPrice * (1 - slPercent);
    } else {
      stopLossPrice = signal.currentPrice * (1 + slPercent);
    }

    logger.info(
      {
        configId: config.id,
        zone: signal.zone,
        side: signal.side,
        size,
        price: signal.currentPrice,
        stopLoss: stopLossPrice.toFixed(2),
        trailing: config.tradingTrailingPercent,
      },
      'Opening range trade',
    );

    // Execute order on HL (leverage is set inside placeMarketOrder)
    try {
      const result = await this.executor.openRangeTrade(
        config,
        signal.side,
        size,
        signal.currentPrice,
      );

      if (!result.success) {
        logger.error({ configId: config.id, error: result.error }, 'Failed to open range trade');
        return;
      }

      // Record in DB
      const trade = this.tradesRepo.create({
        poolConfigId: config.id,
        walletId: config.protectionWalletId,
        asset: config.hedgeAsset,
        side: signal.side,
        size: result.filledSize ?? size,
        entryPrice: result.avgPrice ?? signal.currentPrice.toString(),
        leverage: config.tradingLeverage,
        stopLossPrice: stopLossPrice.toFixed(2),
        trailingPercent: config.tradingTrailingPercent,
        fees: result.estimatedFees,
        hlOrderId: result.orderId,
      });

      // Start tracking trailing stop
      this.trailingManager.track(trade);

      // Emit event
      this.callbacks.onTradeOpened?.({
        rangeTradeId: trade.id,
        poolConfigId: config.id,
        walletId: config.protectionWalletId,
        side: signal.side,
        size: result.filledSize ?? size,
        entryPrice: result.avgPrice ?? signal.currentPrice.toString(),
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error({ configId: config.id, error }, 'Exception opening range trade');
    }
  }

  /** Handle trailing stop / stop-loss trigger */
  private async onTrailingStopTriggered(trigger: TrailingStopTrigger): Promise<void> {
    const trade = this.tradesRepo.findById(trigger.tradeId);
    if (!trade || trade.status !== 'open') return;

    const isStopLoss =
      (trigger.triggerPrice <= parseFloat(trade.stopLossPrice) && trade.side === 'long') ||
      (trigger.triggerPrice >= parseFloat(trade.stopLossPrice) && trade.side === 'short');
    const reason = isStopLoss ? 'stop_loss' : 'trailing_stop';

    await this.closeTrade(trigger.tradeId, trigger.triggerPrice, reason);
  }

  /** Close a trade with reason */
  private async closeTrade(
    tradeId: string,
    currentPrice: number,
    reason: 'trailing_stop' | 'stop_loss' | 'hedge_priority' | 'manual',
  ): Promise<void> {
    const trade = this.tradesRepo.findById(tradeId);
    if (!trade || trade.status !== 'open') return;

    const config = this.poolsRepo.findById(trade.poolConfigId);
    if (!config) return;

    logger.info({ tradeId, reason, currentPrice, side: trade.side }, 'Closing range trade');

    try {
      // Execute close on HL
      const result = await this.executor.closeRangeTrade(
        config,
        trade.asset,
        trade.side,
        trade.size,
        currentPrice,
      );

      // Calculate PnL
      const entryPrice = parseFloat(trade.entryPrice);
      let pnl: number;
      if (trade.side === 'long') {
        pnl = (currentPrice - entryPrice) * parseFloat(trade.size);
      } else {
        pnl = (entryPrice - currentPrice) * parseFloat(trade.size);
      }

      // Record closure
      this.tradesRepo.close(
        tradeId,
        currentPrice.toString(),
        pnl.toFixed(2),
        reason,
        result.estimatedFees,
      );
      this.trailingManager.untrack(tradeId);

      // Set cooldown
      this.entryDetector.setCooldown(trade.poolConfigId);

      // Emit event
      this.callbacks.onTradeClosed?.({
        rangeTradeId: tradeId,
        poolConfigId: trade.poolConfigId,
        walletId: trade.walletId,
        realizedPnl: pnl.toFixed(2),
        closeReason: reason,
        timestamp: Date.now(),
      });

      logger.info({ tradeId, pnl: pnl.toFixed(2), reason }, 'Range trade closed');
    } catch (error) {
      logger.error({ tradeId, error }, 'Failed to close range trade');
    }
  }
}

function formatSize(size: number, asset: string): string {
  switch (asset) {
    case 'BTC':
      return size.toFixed(5);
    case 'ETH':
      return size.toFixed(4);
    default:
      return size.toFixed(2);
  }
}
