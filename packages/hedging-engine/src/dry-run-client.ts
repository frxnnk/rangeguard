import { createLogger } from '@rangeguard/common';
import type { OrderResult, PositionInfo, AccountBalance } from './hyperliquid-client.js';

const logger = createLogger('dry-run');

interface SimulatedPosition {
  asset: string;
  size: number; // positive = long, negative = short
  entryPrice: number;
  leverage: number;
}

/**
 * Drop-in replacement for HyperliquidClient that simulates order execution.
 * Logs all operations but never sends real orders to Hyperliquid.
 * Tracks simulated positions in memory so DB, trailing stops, and events run normally.
 */
export class DryRunClient {
  private wallets: Set<string> = new Set();
  private aliases: Map<string, string> = new Map(); // walletId -> alias
  private positions: Map<string, SimulatedPosition[]> = new Map(); // walletId -> positions

  constructor() {
    logger.info('DryRunClient initialized — no real orders will be placed');
  }

  addWallet(walletId: string, alias: string, _privateKey: string): void {
    this.wallets.add(walletId);
    this.aliases.set(walletId, alias);
    this.positions.set(walletId, []);
    logger.info({ walletId, alias }, 'Wallet registered (dry-run)');
  }

  removeWallet(walletId: string): void {
    this.wallets.delete(walletId);
    this.aliases.delete(walletId);
    this.positions.delete(walletId);
  }

  hasWallet(walletId: string): boolean {
    return this.wallets.has(walletId);
  }

  async placeMarketOrder(
    walletId: string,
    asset: string,
    isBuy: boolean,
    size: string,
    currentPrice: number,
    leverage: number,
  ): Promise<OrderResult> {
    const side = isBuy ? 'BUY' : 'SELL';
    const alias = this.aliases.get(walletId) ?? walletId.slice(0, 8);

    logger.info(
      { wallet: alias, asset, side, size, price: currentPrice, leverage },
      'DRY-RUN: Would place market order',
    );

    // Simulate a small latency
    const latencyMs = 50 + Math.round(Math.random() * 100);

    // Track position in memory
    const positions = this.positions.get(walletId) ?? [];
    const sizeNum = parseFloat(size) * (isBuy ? 1 : -1);
    const existing = positions.find((p) => p.asset === asset);

    if (existing) {
      const newSize = existing.size + sizeNum;
      if (Math.abs(newSize) < 1e-8) {
        // Position closed
        const idx = positions.indexOf(existing);
        positions.splice(idx, 1);
      } else {
        existing.size = newSize;
      }
    } else {
      positions.push({
        asset,
        size: sizeNum,
        entryPrice: currentPrice,
        leverage,
      });
    }

    const estimatedFees = (parseFloat(size) * currentPrice * 0.00035).toFixed(4);

    return {
      success: true,
      orderId: `dry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filledSize: size,
      avgPrice: currentPrice.toString(),
      estimatedFees,
      latencyMs,
    };
  }

  async closePosition(walletId: string, asset: string, currentPrice: number): Promise<OrderResult> {
    const alias = this.aliases.get(walletId) ?? walletId.slice(0, 8);
    const positions = this.positions.get(walletId) ?? [];
    const pos = positions.find((p) => p.asset === asset);

    if (!pos) {
      logger.warn({ wallet: alias, asset }, 'DRY-RUN: No position to close');
      return { success: true, latencyMs: 10 };
    }

    const absSize = Math.abs(pos.size);
    const isBuy = pos.size < 0; // close short = buy, close long = sell
    const side = isBuy ? 'BUY' : 'SELL';

    logger.info(
      { wallet: alias, asset, side, size: absSize.toFixed(4), price: currentPrice },
      'DRY-RUN: Would close position',
    );

    // Remove from tracked positions
    const idx = positions.indexOf(pos);
    positions.splice(idx, 1);

    const estimatedFees = (absSize * currentPrice * 0.00035).toFixed(4);

    return {
      success: true,
      orderId: `dry-close-${Date.now()}`,
      filledSize: absSize.toString(),
      avgPrice: currentPrice.toString(),
      estimatedFees,
      latencyMs: 50 + Math.round(Math.random() * 100),
    };
  }

  async getPositions(walletId: string): Promise<PositionInfo[]> {
    const positions = this.positions.get(walletId) ?? [];
    return positions.map((p) => ({
      asset: p.asset,
      size: p.size.toString(),
      entryPrice: p.entryPrice.toString(),
      unrealizedPnl: '0',
      leverage: p.leverage,
      liquidationPrice: undefined,
    }));
  }

  async getBalance(_walletId: string): Promise<AccountBalance> {
    // Return simulated balance (10 000 USDC)
    return { available: '10000', marginUsed: '0', total: '10000' };
  }

  async placeStopLoss(
    walletId: string,
    asset: string,
    isBuy: boolean,
    size: string,
    triggerPrice: number,
  ): Promise<OrderResult> {
    const alias = this.aliases.get(walletId) ?? walletId.slice(0, 8);

    logger.info(
      { wallet: alias, asset, isBuy, size, triggerPrice: triggerPrice.toFixed(2) },
      'DRY-RUN: Would place stop-loss',
    );

    return {
      success: true,
      orderId: `dry-sl-${Date.now()}`,
      latencyMs: 20,
    };
  }

  async cancelOrders(walletId: string, asset: string, orderIds: number[]): Promise<boolean> {
    const alias = this.aliases.get(walletId) ?? walletId.slice(0, 8);

    logger.info({ wallet: alias, asset, orderIds }, 'DRY-RUN: Would cancel orders');

    return true;
  }

  async preloadAssetMeta(): Promise<void> {}

  async presetLeverage(_walletId: string, _asset: string, _leverage: number): Promise<void> {}
}
