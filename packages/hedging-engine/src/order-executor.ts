import { createLogger } from '@rangeguard/common';
import type { PoolConfig } from '@rangeguard/common';
import type { HyperliquidClient } from './hyperliquid-client.js';
import { type OrderResult } from './hyperliquid-client.js';
import type { HedgeParams } from './hedge-calculator.js';
import type { TradeLogRepository } from '@rangeguard/db';

const logger = createLogger('order-executor');

/** HL taker fee rate: 0.035% */
const HL_TAKER_FEE_RATE = 0.00035;

function estimateFee(filledSize?: string, avgPrice?: string): string | undefined {
  if (!filledSize || !avgPrice) return undefined;
  const fee = parseFloat(filledSize) * parseFloat(avgPrice) * HL_TAKER_FEE_RATE;
  return fee.toFixed(4);
}

export interface ExecutionResult {
  protectionOrder: OrderResult;
  profitOrder?: OrderResult;
}

export class OrderExecutor {
  private hlClient: HyperliquidClient;
  private tradeLog: TradeLogRepository;

  constructor(hlClient: HyperliquidClient, tradeLog: TradeLogRepository) {
    this.hlClient = hlClient;
    this.tradeLog = tradeLog;
  }

  /** Execute hedge on protection wallet (and optionally profit wallet in parallel) */
  async openHedge(
    config: PoolConfig,
    params: HedgeParams,
    profitWalletId?: string,
  ): Promise<ExecutionResult> {
    const isBuy = params.side === 'long';

    logger.info(
      {
        configId: config.id,
        wallet: config.protectionWalletId,
        type: 'protection',
        asset: params.asset,
        side: params.side,
        size: params.size,
      },
      'Opening protection hedge',
    );

    // Build promises
    const protectionPromise = this.hlClient.placeMarketOrder(
      config.protectionWalletId,
      params.asset,
      isBuy,
      params.size,
      params.currentPrice,
      params.leverage,
    );

    const hasProfitWallet = config.profitWalletEnabled && profitWalletId;
    if (hasProfitWallet) {
      logger.info(
        { configId: config.id, wallet: profitWalletId, type: 'profit' },
        'Mirroring hedge on profit wallet',
      );
    }

    const profitPromise = hasProfitWallet
      ? this.hlClient.placeMarketOrder(
          profitWalletId,
          params.asset,
          isBuy,
          params.size,
          params.currentPrice,
          params.leverage,
        )
      : undefined;

    // Execute in parallel
    const [protectionResult, profitResult] = await Promise.allSettled([
      protectionPromise,
      profitPromise ?? Promise.resolve(undefined),
    ]);

    // Extract protection result
    const protectionOrder: OrderResult =
      protectionResult.status === 'fulfilled'
        ? protectionResult.value
        : { success: false, error: (protectionResult.reason as Error).message, latencyMs: 0 };
    protectionOrder.estimatedFees = estimateFee(
      protectionOrder.filledSize,
      protectionOrder.avgPrice,
    );
    this.logTrade(config.protectionWalletId, 'open_hedge_protection', protectionOrder);

    // Extract profit result
    let profitOrder: OrderResult | undefined;
    if (hasProfitWallet && profitResult.status === 'fulfilled' && profitResult.value) {
      profitOrder = profitResult.value;
      profitOrder.estimatedFees = estimateFee(profitOrder.filledSize, profitOrder.avgPrice);
      this.logTrade(profitWalletId!, 'open_hedge_profit', profitOrder);
    } else if (hasProfitWallet && profitResult.status === 'rejected') {
      const errMsg = (profitResult.reason as Error).message;
      logger.error({ configId: config.id, error: errMsg }, 'Profit wallet order failed');
      this.logTrade(profitWalletId!, 'open_hedge_profit', {
        success: false,
        error: errMsg,
        latencyMs: 0,
      });
    }

    return { protectionOrder, profitOrder };
  }

  /** Close hedge positions (protection + profit in parallel) */
  async closeHedge(
    config: PoolConfig,
    asset: string,
    currentPrice: number,
    profitWalletId?: string,
  ): Promise<ExecutionResult> {
    logger.info({ configId: config.id, asset }, 'Closing hedge positions');

    const protectionPromise = this.hlClient.closePosition(
      config.protectionWalletId,
      asset,
      currentPrice,
    );

    const hasProfitWallet = config.profitWalletEnabled && profitWalletId;
    const profitPromise = hasProfitWallet
      ? this.hlClient.closePosition(profitWalletId, asset, currentPrice)
      : undefined;

    const [protectionResult, profitResult] = await Promise.allSettled([
      protectionPromise,
      profitPromise ?? Promise.resolve(undefined),
    ]);

    const protectionOrder: OrderResult =
      protectionResult.status === 'fulfilled'
        ? protectionResult.value
        : { success: false, error: (protectionResult.reason as Error).message, latencyMs: 0 };
    protectionOrder.estimatedFees = estimateFee(
      protectionOrder.filledSize,
      protectionOrder.avgPrice,
    );
    this.logTrade(config.protectionWalletId, 'close_hedge_protection', protectionOrder);

    let profitOrder: OrderResult | undefined;
    if (hasProfitWallet && profitResult.status === 'fulfilled' && profitResult.value) {
      profitOrder = profitResult.value;
      profitOrder.estimatedFees = estimateFee(profitOrder.filledSize, profitOrder.avgPrice);
      this.logTrade(profitWalletId!, 'close_hedge_profit', profitOrder);
    } else if (hasProfitWallet && profitResult.status === 'rejected') {
      const errMsg = (profitResult.reason as Error).message;
      logger.error({ configId: config.id, error: errMsg }, 'Profit wallet close failed');
      this.logTrade(profitWalletId!, 'close_hedge_profit', {
        success: false,
        error: errMsg,
        latencyMs: 0,
      });
    }

    return { protectionOrder, profitOrder };
  }

  /** Open a range trade on the protection wallet */
  async openRangeTrade(
    config: PoolConfig,
    side: 'short' | 'long',
    size: string,
    currentPrice: number,
  ): Promise<OrderResult> {
    const isBuy = side === 'long';

    logger.info(
      {
        configId: config.id,
        wallet: config.protectionWalletId,
        type: 'range_trade',
        asset: config.hedgeAsset,
        side,
        size,
      },
      'Opening range trade',
    );

    const result = await this.hlClient.placeMarketOrder(
      config.protectionWalletId,
      config.hedgeAsset,
      isBuy,
      size,
      currentPrice,
      config.tradingLeverage,
    );
    result.estimatedFees = estimateFee(result.filledSize, result.avgPrice);

    this.logTrade(config.protectionWalletId, 'open_range_trade', result);
    return result;
  }

  /** Close a range trade position */
  async closeRangeTrade(
    config: PoolConfig,
    asset: string,
    side: 'short' | 'long',
    size: string,
    currentPrice: number,
  ): Promise<OrderResult> {
    logger.info({ configId: config.id, asset, side }, 'Closing range trade');

    const result = await this.hlClient.closePosition(
      config.protectionWalletId,
      asset,
      currentPrice,
    );
    result.estimatedFees = estimateFee(result.filledSize, result.avgPrice);

    this.logTrade(config.protectionWalletId, 'close_range_trade', result);
    return result;
  }

  private logTrade(walletId: string, action: string, result: OrderResult): void {
    try {
      this.tradeLog.create({
        walletId,
        action,
        responsePayload: JSON.stringify(result),
        success: result.success,
        errorMessage: result.error,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to log trade');
    }
  }
}
