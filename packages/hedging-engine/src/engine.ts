import { createLogger } from '@trading-bot/common';
import type {
  RangeExitEvent,
  RangeReturnEvent,
  HedgeOpenedEvent,
  HedgeClosedEvent,
} from '@trading-bot/common';
import type {
  PoolsRepository,
  HedgesRepository,
  WalletsRepository,
  TradeLogRepository,
  StopLossRepository,
} from '@trading-bot/db';
import { HedgeCalculator } from './hedge-calculator.js';
import { OrderExecutor } from './order-executor.js';
import { PositionTracker } from './position-tracker.js';
import { StopLossManager } from './stop-loss-manager.js';
import type { HyperliquidClient } from './hyperliquid-client.js';

const logger = createLogger('engine');

export interface HedgeEventCallbacks {
  onHedgeOpened?: (event: HedgeOpenedEvent) => void;
  onHedgeClosed?: (event: HedgeClosedEvent) => void;
}

export class HedgingEngine {
  private poolsRepo: PoolsRepository;
  private walletsRepo: WalletsRepository;
  private calculator: HedgeCalculator;
  private executor: OrderExecutor;
  private tracker: PositionTracker;
  private slManager: StopLossManager;
  private hlClient: HyperliquidClient;
  private callbacks: HedgeEventCallbacks;

  constructor(
    poolsRepo: PoolsRepository,
    walletsRepo: WalletsRepository,
    hedgesRepo: HedgesRepository,
    tradeLogRepo: TradeLogRepository,
    hlClient: HyperliquidClient,
    callbacks?: HedgeEventCallbacks,
    slRepo?: StopLossRepository,
  ) {
    this.poolsRepo = poolsRepo;
    this.walletsRepo = walletsRepo;
    this.calculator = new HedgeCalculator();
    this.executor = new OrderExecutor(hlClient, tradeLogRepo);
    this.tracker = new PositionTracker(hedgesRepo);
    this.slManager = new StopLossManager(hlClient, slRepo);
    this.hlClient = hlClient;
    this.callbacks = callbacks ?? {};
  }

  /** Handle range exit: open hedges */
  async onRangeExit(event: RangeExitEvent): Promise<void> {
    const config = this.poolsRepo.findById(event.poolConfigId);
    if (!config) {
      logger.error({ poolConfigId: event.poolConfigId }, 'Pool config not found');
      return;
    }

    if (!config.protectionActive) {
      logger.info({ poolConfigId: config.id }, 'Protection disabled, skipping hedge');
      return;
    }

    // Check if already hedged
    if (this.tracker.hasOpenHedge(config.id)) {
      logger.warn({ poolConfigId: config.id }, 'Already has open hedge, skipping');
      return;
    }

    // Check if protection wallet has a private key loaded
    if (!this.hlClient.hasWallet(config.protectionWalletId)) {
      logger.warn(
        { poolConfigId: config.id, walletId: config.protectionWalletId },
        'Protection wallet has no private key loaded — skipping hedge. Run "pnpm setup-keys" to configure.',
      );
      return;
    }

    const currentPrice = parseFloat(event.currentPrice);
    const params = this.calculator.calculate(config, currentPrice, event.direction);

    // Find profit wallet if enabled
    const profitWallet = config.profitWalletEnabled
      ? this.walletsRepo.findProfitWallet()
      : undefined;

    logger.info(
      {
        poolConfigId: config.id,
        direction: event.direction,
        asset: params.asset,
        side: params.side,
        size: params.size,
        leverage: params.leverage,
      },
      'Executing hedge',
    );

    // Execute orders
    const result = await this.executor.openHedge(config, params, profitWallet?.id);

    // Record in DB + emit events + place backup SL
    if (result.protectionOrder.success) {
      const trade = this.tracker.recordOpen(
        config.id,
        config.protectionWalletId,
        'protection',
        params.asset,
        params.side,
        result.protectionOrder.filledSize ?? params.size,
        result.protectionOrder.avgPrice ?? currentPrice.toString(),
        params.leverage,
        result.protectionOrder.orderId,
        result.protectionOrder.estimatedFees,
      );

      this.poolsRepo.updateStatus(
        config.id,
        event.direction === 'below' ? 'out-of-range-below' : 'out-of-range-above',
        event.currentPrice,
      );

      // Emit hedge-opened event
      this.callbacks.onHedgeOpened?.({
        hedgeTradeId: trade.id,
        poolConfigId: config.id,
        walletId: config.protectionWalletId,
        walletType: 'protection',
        side: params.side,
        size: result.protectionOrder.filledSize ?? params.size,
        entryPrice: result.protectionOrder.avgPrice ?? currentPrice.toString(),
        timestamp: Date.now(),
      });

      // Place backup stop-loss on HL
      await this.slManager.placeBackupSL(
        config.id,
        config.protectionWalletId,
        'protection',
        params.asset,
        params.side,
        result.protectionOrder.filledSize ?? params.size,
        event.rangeLower,
        event.rangeUpper,
        event.direction,
      );
    }

    if (result.profitOrder?.success && profitWallet) {
      const trade = this.tracker.recordOpen(
        config.id,
        profitWallet.id,
        'profit',
        params.asset,
        params.side,
        result.profitOrder.filledSize ?? params.size,
        result.profitOrder.avgPrice ?? currentPrice.toString(),
        params.leverage,
        result.profitOrder.orderId,
        result.profitOrder.estimatedFees,
      );

      // Emit hedge-opened event for profit wallet
      this.callbacks.onHedgeOpened?.({
        hedgeTradeId: trade.id,
        poolConfigId: config.id,
        walletId: profitWallet.id,
        walletType: 'profit',
        side: params.side,
        size: result.profitOrder.filledSize ?? params.size,
        entryPrice: result.profitOrder.avgPrice ?? currentPrice.toString(),
        timestamp: Date.now(),
      });

      // Place backup SL on profit wallet too
      await this.slManager.placeBackupSL(
        config.id,
        profitWallet.id,
        'profit',
        params.asset,
        params.side,
        result.profitOrder.filledSize ?? params.size,
        event.rangeLower,
        event.rangeUpper,
        event.direction,
      );
    }
  }

  /** Handle range return: close hedges (automatic stop-loss) */
  async onRangeReturn(event: RangeReturnEvent): Promise<void> {
    const config = this.poolsRepo.findById(event.poolConfigId);
    if (!config) return;

    this.slManager.onRangeReturn(config.id, event.currentPrice);

    const openHedges = this.tracker.getOpenHedges(config.id);
    if (openHedges.length === 0) {
      logger.info({ poolConfigId: config.id }, 'No open hedges to close');
      this.poolsRepo.updateStatus(config.id, 'in-range', event.currentPrice);
      return;
    }

    // Check if protection wallet has a private key loaded
    if (!this.hlClient.hasWallet(config.protectionWalletId)) {
      logger.warn(
        { poolConfigId: config.id, walletId: config.protectionWalletId },
        'Protection wallet has no private key loaded — cannot close hedges. Run "pnpm setup-keys" to configure.',
      );
      return;
    }

    const currentPrice = parseFloat(event.currentPrice);
    const profitWallet = this.walletsRepo.findProfitWallet();

    // Cancel backup SL orders before closing
    await this.slManager.cancelAllForPool(config.id);

    // Close all open hedges for this pool
    const result = await this.executor.closeHedge(
      config,
      openHedges[0].asset,
      currentPrice,
      profitWallet?.id,
    );

    // Map close results to wallet types for fee attribution
    const closeFeeByWalletType: Record<string, string | undefined> = {
      protection: result.protectionOrder.estimatedFees,
      profit: result.profitOrder?.estimatedFees,
    };

    // Record closures + emit events
    for (const hedge of openHedges) {
      const entryPrice = parseFloat(hedge.entryPrice);
      let pnl: number;

      if (hedge.side === 'short') {
        pnl = (entryPrice - currentPrice) * parseFloat(hedge.size);
      } else {
        pnl = (currentPrice - entryPrice) * parseFloat(hedge.size);
      }

      const isFalseBreakout = pnl < 0;
      const closeFees = closeFeeByWalletType[hedge.walletType];

      this.tracker.recordClose(
        hedge.id,
        currentPrice.toString(),
        pnl.toFixed(2),
        'range_return',
        isFalseBreakout,
        closeFees,
      );

      // Emit hedge-closed event
      this.callbacks.onHedgeClosed?.({
        hedgeTradeId: hedge.id,
        poolConfigId: config.id,
        walletId: hedge.walletId,
        walletType: hedge.walletType,
        realizedPnl: pnl.toFixed(2),
        isFalseBreakout,
        closeReason: 'range_return',
        timestamp: Date.now(),
      });
    }

    this.poolsRepo.updateStatus(config.id, 'in-range', event.currentPrice);

    logger.info(
      {
        poolConfigId: config.id,
        closedCount: openHedges.length,
      },
      'All hedges closed on range return',
    );
  }

  /** Close hedges manually for a pool */
  async closeManually(poolConfigId: string, currentPrice: number): Promise<{ closed: number }> {
    const config = this.poolsRepo.findById(poolConfigId);
    if (!config) {
      throw new Error(`Pool config not found: ${poolConfigId}`);
    }

    const openHedges = this.tracker.getOpenHedges(poolConfigId);
    if (openHedges.length === 0) {
      return { closed: 0 };
    }

    if (!this.hlClient.hasWallet(config.protectionWalletId)) {
      throw new Error('Protection wallet has no private key loaded');
    }

    // Cancel backup SL orders
    await this.slManager.cancelAllForPool(poolConfigId);

    const profitWallet = this.walletsRepo.findProfitWallet();

    // Close positions
    const result = await this.executor.closeHedge(
      config,
      openHedges[0].asset,
      currentPrice,
      profitWallet?.id,
    );

    const closeFeeByWalletType: Record<string, string | undefined> = {
      protection: result.protectionOrder.estimatedFees,
      profit: result.profitOrder?.estimatedFees,
    };

    // Record closures
    for (const hedge of openHedges) {
      const entryPrice = parseFloat(hedge.entryPrice);
      let pnl: number;

      if (hedge.side === 'short') {
        pnl = (entryPrice - currentPrice) * parseFloat(hedge.size);
      } else {
        pnl = (currentPrice - entryPrice) * parseFloat(hedge.size);
      }

      const isFalseBreakout = pnl < 0;
      const closeFees = closeFeeByWalletType[hedge.walletType];

      this.tracker.recordClose(
        hedge.id,
        currentPrice.toString(),
        pnl.toFixed(2),
        'manual',
        isFalseBreakout,
        closeFees,
      );

      this.callbacks.onHedgeClosed?.({
        hedgeTradeId: hedge.id,
        poolConfigId,
        walletId: hedge.walletId,
        walletType: hedge.walletType,
        realizedPnl: pnl.toFixed(2),
        isFalseBreakout,
        closeReason: 'manual',
        timestamp: Date.now(),
      });
    }

    this.poolsRepo.updateStatus(poolConfigId, 'in-range', currentPrice.toString());

    logger.info({ poolConfigId, closedCount: openHedges.length }, 'Hedges closed manually');
    return { closed: openHedges.length };
  }

  /** Get the position tracker for external queries */
  getTracker(): PositionTracker {
    return this.tracker;
  }

  /** Get the stop-loss manager (for orphan cleanup on startup) */
  getStopLossManager(): StopLossManager {
    return this.slManager;
  }

  /** Reconcile DB state with HL positions (run on startup to detect missed liquidations) */
  async reconcilePositions(): Promise<void> {
    const openHedges = this.tracker.getAllOpenHedges();
    if (openHedges.length === 0) {
      logger.info('No open hedges to reconcile');
      return;
    }

    logger.info({ count: openHedges.length }, 'Reconciling hedge positions...');

    // Group by walletId
    const byWallet = new Map<string, typeof openHedges>();
    for (const hedge of openHedges) {
      const list = byWallet.get(hedge.walletId) ?? [];
      list.push(hedge);
      byWallet.set(hedge.walletId, list);
    }

    let reconciled = 0;

    for (const [walletId, hedges] of byWallet) {
      if (!this.hlClient.hasWallet(walletId)) {
        logger.warn({ walletId }, 'Cannot reconcile — wallet not loaded');
        continue;
      }

      let positions: { asset: string; size: string }[];
      try {
        positions = await this.hlClient.getPositions(walletId);
      } catch (error) {
        logger.warn({ walletId, error }, 'Failed to get positions for reconciliation');
        continue;
      }

      const positionAssets = new Set(
        positions.filter((p) => parseFloat(p.size) !== 0).map((p) => p.asset),
      );

      for (const hedge of hedges) {
        if (!positionAssets.has(hedge.asset)) {
          logger.warn(
            { hedgeTradeId: hedge.id, walletId, asset: hedge.asset },
            'Reconciliation: position missing from HL — marking as liquidated',
          );

          this.tracker.recordClose(hedge.id, '0', '0', 'liquidated', false);

          this.callbacks.onHedgeClosed?.({
            hedgeTradeId: hedge.id,
            poolConfigId: hedge.poolConfigId,
            walletId: hedge.walletId,
            walletType: hedge.walletType,
            realizedPnl: '0',
            isFalseBreakout: false,
            closeReason: 'liquidated',
            timestamp: Date.now(),
          });

          reconciled++;
        }
      }
    }

    logger.info({ reconciled }, 'Reconciliation complete');
  }
}
