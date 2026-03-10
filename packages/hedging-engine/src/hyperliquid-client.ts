import * as hl from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { createLogger, withRetry, HL_SLIPPAGE_BPS } from '@trading-bot/common';

const logger = createLogger('hl-client');

interface WalletClientEntry {
  alias: string;
  address: string;
  transport: hl.HttpTransport;
  walletClient: hl.WalletClient;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  filledSize?: string;
  avgPrice?: string;
  estimatedFees?: string;
  error?: string;
  latencyMs: number;
}

export interface PositionInfo {
  asset: string;
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  leverage: number;
  liquidationPrice?: string;
}

export interface AccountBalance {
  available: string;
  marginUsed: string;
  total: string;
}

export class HyperliquidClient {
  private clients: Map<string, WalletClientEntry> = new Map(); // walletId -> client
  private apiUrl: string;
  private isTestnet: boolean;
  private assetIndexCache: Map<string, number> = new Map(); // coin name -> asset index

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
    this.isTestnet = apiUrl.includes('testnet');
  }

  /** Initialize a wallet client from a private key */
  addWallet(walletId: string, alias: string, privateKey: string): void {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = new hl.HttpTransport({
      url: this.isTestnet ? 'https://hyperliquid-testnet.xyz' : 'https://hyperliquid.xyz',
    });
    const walletClient = new hl.WalletClient({
      wallet: account,
      transport,
      isTestnet: this.isTestnet,
    });

    this.clients.set(walletId, {
      alias,
      address: account.address,
      transport,
      walletClient,
    });

    logger.info({ walletId, alias, address: account.address }, 'Wallet client initialized');
  }

  /** Remove a wallet client */
  removeWallet(walletId: string): void {
    this.clients.delete(walletId);
  }

  private getWalletClient(walletId: string): WalletClientEntry {
    const client = this.clients.get(walletId);
    if (!client) {
      throw new Error(`No wallet client for walletId: ${walletId}`);
    }
    return client;
  }

  /** Resolve a coin name (e.g. "ETH") to its numeric asset index */
  private async resolveAssetIndex(transport: hl.HttpTransport, coin: string): Promise<number> {
    const cached = this.assetIndexCache.get(coin);
    if (cached !== undefined) return cached;

    const publicClient = new hl.PublicClient({ transport });
    const meta = await publicClient.meta();
    for (let i = 0; i < meta.universe.length; i++) {
      this.assetIndexCache.set(meta.universe[i].name, i);
    }

    const index = this.assetIndexCache.get(coin);
    if (index === undefined) {
      throw new Error(`Unknown asset: ${coin}`);
    }
    return index;
  }

  /** Place a market order (IOC limit with slippage) */
  async placeMarketOrder(
    walletId: string,
    asset: string,
    isBuy: boolean,
    size: string,
    currentPrice: number,
    leverage: number,
  ): Promise<OrderResult> {
    const start = Date.now();

    try {
      const client = this.getWalletClient(walletId);

      // Calculate limit price with slippage
      const slippageMultiplier = isBuy ? 1 + HL_SLIPPAGE_BPS / 10000 : 1 - HL_SLIPPAGE_BPS / 10000;
      const limitPrice = currentPrice * slippageMultiplier;

      // Resolve coin name to asset index
      const assetIndex = await this.resolveAssetIndex(client.transport, asset);

      // Set leverage first
      await withRetry(
        async () => {
          await client.walletClient.updateLeverage({
            asset: assetIndex,
            leverage,
            isCross: true,
          });
        },
        { maxRetries: 2, baseDelayMs: 500 },
      );

      logger.info({ walletId, asset, leverage }, 'Leverage set');

      // Place IOC order
      const result = await withRetry(
        async () => {
          return await client.walletClient.order({
            orders: [
              {
                a: assetIndex,
                b: isBuy,
                p: roundPrice(limitPrice),
                s: size,
                t: { limit: { tif: 'Ioc' } },
                r: false,
              },
            ],
            grouping: 'na',
          });
        },
        { maxRetries: 2, baseDelayMs: 500 },
      );

      const latencyMs = Date.now() - start;
      const status = result.response?.data?.statuses?.[0];

      if (status && 'filled' in status) {
        logger.info(
          {
            walletId,
            alias: client.alias,
            asset,
            side: isBuy ? 'long' : 'short',
            size,
            avgPrice: status.filled.avgPx,
            latencyMs,
          },
          'Order filled',
        );

        // Check for partial fill
        const filledSize = parseFloat(status.filled.totalSz);
        const requestedSize = parseFloat(size);
        if (filledSize < requestedSize * 0.99) {
          logger.warn(
            {
              walletId,
              asset,
              requestedSize: size,
              filledSize: status.filled.totalSz,
              fillRatio: ((filledSize / requestedSize) * 100).toFixed(1) + '%',
            },
            'Partial fill detected',
          );
        }

        return {
          success: true,
          orderId: status.filled.oid?.toString(),
          filledSize: status.filled.totalSz,
          avgPrice: status.filled.avgPx,
          latencyMs,
        };
      }

      logger.warn({ walletId, asset, status }, 'Order not filled');
      return {
        success: false,
        error: 'Order not filled - possibly insufficient liquidity',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ walletId, asset, error: errMsg }, 'Order failed');
      return { success: false, error: errMsg, latencyMs };
    }
  }

  /** Close a position (market order to reduce) */
  async closePosition(walletId: string, asset: string, currentPrice: number): Promise<OrderResult> {
    const start = Date.now();

    try {
      const client = this.getWalletClient(walletId);

      // Get current position to know size and direction
      const positions = await this.getPositions(walletId);
      const position = positions.find((p) => p.asset === asset);

      if (!position || position.size === '0') {
        return {
          success: true,
          latencyMs: Date.now() - start,
        };
      }

      const posSize = parseFloat(position.size);
      const isBuy = posSize < 0; // If short, buy to close
      const absSize = Math.abs(posSize).toString();

      const slippageMultiplier = isBuy ? 1 + HL_SLIPPAGE_BPS / 10000 : 1 - HL_SLIPPAGE_BPS / 10000;
      const limitPrice = currentPrice * slippageMultiplier;

      // Resolve coin name to asset index
      const assetIndex = await this.resolveAssetIndex(client.transport, asset);

      const result = await withRetry(
        async () => {
          return await client.walletClient.order({
            orders: [
              {
                a: assetIndex,
                b: isBuy,
                p: roundPrice(limitPrice),
                s: absSize,
                t: { limit: { tif: 'Ioc' } },
                r: true,
              },
            ],
            grouping: 'na',
          });
        },
        { maxRetries: 2, baseDelayMs: 500 },
      );

      const latencyMs = Date.now() - start;
      const status = result.response?.data?.statuses?.[0];

      if (status && 'filled' in status) {
        logger.info(
          {
            walletId,
            asset,
            closedSize: absSize,
            avgPrice: status.filled.avgPx,
            latencyMs,
          },
          'Position closed',
        );

        return {
          success: true,
          orderId: status.filled.oid?.toString(),
          filledSize: status.filled.totalSz,
          avgPrice: status.filled.avgPx,
          latencyMs,
        };
      }

      return {
        success: false,
        error: 'Close order not filled',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ walletId, asset, error: errMsg }, 'Close position failed');
      return { success: false, error: errMsg, latencyMs };
    }
  }

  /** Get all positions for a wallet */
  async getPositions(walletId: string): Promise<PositionInfo[]> {
    const client = this.getWalletClient(walletId);
    const transport = client.transport;

    const publicClient = new hl.PublicClient({ transport });
    const state = await publicClient.clearinghouseState({ user: client.address as `0x${string}` });

    return state.assetPositions
      .filter((p: any) => parseFloat(p.position.szi) !== 0)
      .map((p: any) => ({
        asset: p.position.coin,
        size: p.position.szi,
        entryPrice: p.position.entryPx,
        unrealizedPnl: p.position.unrealizedPnl,
        leverage: parseInt(p.position.leverage?.value ?? '1'),
        liquidationPrice: p.position.liquidationPx,
      }));
  }

  /** Get account balance for a wallet (perps + spot for unified accounts) */
  async getBalance(walletId: string): Promise<AccountBalance> {
    const client = this.getWalletClient(walletId);
    const transport = client.transport;

    const publicClient = new hl.PublicClient({ transport });
    const state = await publicClient.clearinghouseState({ user: client.address as `0x${string}` });

    const crossMarginSummary = state.crossMarginSummary;
    let accountValue = parseFloat(crossMarginSummary.accountValue ?? '0');
    const marginUsed = parseFloat(crossMarginSummary.totalMarginUsed ?? '0');

    // On unified accounts (testnet), funds may be in spot — check spotClearinghouseState too
    if (accountValue === 0) {
      try {
        const spotState = await publicClient.spotClearinghouseState({
          user: client.address as `0x${string}`,
        });
        const usdcBalance = spotState.balances?.find((b: any) => b.coin === 'USDC');
        if (usdcBalance) {
          accountValue = parseFloat(usdcBalance.total ?? '0');
        }
      } catch {
        // spotClearinghouseState may not be available on all versions
      }
    }

    const available = Math.max(0, accountValue - marginUsed);
    return {
      available: available.toString(),
      marginUsed: crossMarginSummary.totalMarginUsed ?? '0',
      total: accountValue.toString(),
    };
  }

  /** Place a stop-loss trigger order on HL (backup SL) */
  async placeStopLoss(
    walletId: string,
    asset: string,
    isBuy: boolean,
    size: string,
    triggerPrice: number,
  ): Promise<OrderResult> {
    const start = Date.now();

    try {
      const client = this.getWalletClient(walletId);
      const assetIndex = await this.resolveAssetIndex(client.transport, asset);

      // For market trigger orders, set limit price with slippage for execution
      const slippageMultiplier = isBuy ? 1 + HL_SLIPPAGE_BPS / 10000 : 1 - HL_SLIPPAGE_BPS / 10000;
      const limitPrice = triggerPrice * slippageMultiplier;

      const result = await withRetry(
        async () => {
          return await client.walletClient.order({
            orders: [
              {
                a: assetIndex,
                b: isBuy,
                p: roundPrice(limitPrice),
                s: size,
                t: { trigger: { triggerPx: roundPrice(triggerPrice), isMarket: true, tpsl: 'sl' } },
                r: true,
              },
            ],
            grouping: 'na',
          });
        },
        { maxRetries: 2, baseDelayMs: 500 },
      );

      const latencyMs = Date.now() - start;
      const status = result.response?.data?.statuses?.[0];

      if (status && 'resting' in status) {
        logger.info(
          {
            walletId,
            asset,
            triggerPrice: roundPrice(triggerPrice),
            side: isBuy ? 'buy' : 'sell',
            size,
            orderId: status.resting.oid,
            latencyMs,
          },
          'Stop-loss order placed',
        );

        return {
          success: true,
          orderId: status.resting.oid?.toString(),
          latencyMs,
        };
      }

      logger.warn({ walletId, asset, status }, 'Stop-loss order may not have been placed');
      return {
        success: false,
        error: 'SL order not confirmed as resting',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ walletId, asset, error: errMsg }, 'Stop-loss order failed');
      return { success: false, error: errMsg, latencyMs };
    }
  }

  /** Cancel open orders for an asset */
  async cancelOrders(walletId: string, asset: string, orderIds: number[]): Promise<boolean> {
    try {
      const client = this.getWalletClient(walletId);
      const assetIndex = await this.resolveAssetIndex(client.transport, asset);

      await withRetry(
        async () => {
          await client.walletClient.cancel({
            cancels: orderIds.map((o) => ({ a: assetIndex, o })),
          });
        },
        { maxRetries: 2, baseDelayMs: 500 },
      );

      logger.info({ walletId, asset, orderIds }, 'Orders cancelled');
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { walletId, asset, orderIds, error: errMsg },
        'Failed to cancel orders (may already be filled)',
      );
      return false;
    }
  }

  /** Check if a wallet client exists */
  hasWallet(walletId: string): boolean {
    return this.clients.has(walletId);
  }
}

function roundPrice(price: number): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 1000) return price.toFixed(1);
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(5);
}
