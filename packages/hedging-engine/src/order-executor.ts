import { createLogger } from '@trading-bot/common';
import type { PoolConfig, WalletType } from '@trading-bot/common';
import type { HyperliquidClient } from './hyperliquid-client.js';
import { type OrderResult } from './hyperliquid-client.js';
import type { HedgeParams } from './hedge-calculator.js';
import type { TradeLogRepository } from '@trading-bot/db';

const logger = createLogger('order-executor');

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

  /** Execute hedge on protection wallet (and optionally profit wallet) */
  async openHedge(
    config: PoolConfig,
    params: HedgeParams,
    profitWalletId?: string,
  ): Promise<ExecutionResult> {
    const isBuy = params.side === 'long';

    // 1. Execute on protection wallet
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

    const protectionOrder = await this.hlClient.placeMarketOrder(
      config.protectionWalletId,
      params.asset,
      isBuy,
      params.size,
      params.currentPrice,
      params.leverage,
    );

    this.logTrade(config.protectionWalletId, 'open_hedge_protection', protectionOrder);

    // 2. If profit wallet enabled and exists, mirror the trade
    let profitOrder: OrderResult | undefined;
    if (config.profitWalletEnabled && profitWalletId) {
      logger.info(
        {
          configId: config.id,
          wallet: profitWalletId,
          type: 'profit',
        },
        'Mirroring hedge on profit wallet',
      );

      profitOrder = await this.hlClient.placeMarketOrder(
        profitWalletId,
        params.asset,
        isBuy,
        params.size,
        params.currentPrice,
        params.leverage,
      );

      this.logTrade(profitWalletId, 'open_hedge_profit', profitOrder);
    }

    return { protectionOrder, profitOrder };
  }

  /** Close hedge positions */
  async closeHedge(
    config: PoolConfig,
    asset: string,
    currentPrice: number,
    profitWalletId?: string,
  ): Promise<ExecutionResult> {
    logger.info({ configId: config.id, asset }, 'Closing protection hedge');

    const protectionOrder = await this.hlClient.closePosition(
      config.protectionWalletId,
      asset,
      currentPrice,
    );

    this.logTrade(config.protectionWalletId, 'close_hedge_protection', protectionOrder);

    let profitOrder: OrderResult | undefined;
    if (config.profitWalletEnabled && profitWalletId) {
      logger.info({ configId: config.id, wallet: profitWalletId }, 'Closing profit hedge');

      profitOrder = await this.hlClient.closePosition(profitWalletId, asset, currentPrice);

      this.logTrade(profitWalletId, 'close_hedge_profit', profitOrder);
    }

    return { protectionOrder, profitOrder };
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
