import { createLogger } from '@rangeguard/common';
import type { CreatePoolConfig, RangeExitEvent, RangeReturnEvent } from '@rangeguard/common';
import { createTestDb } from '@rangeguard/db/test-utils';
import {
  PoolsRepository,
  WalletsRepository,
  HedgesRepository,
  TradeLogRepository,
  RangeTradesRepository,
  StopLossRepository,
} from '@rangeguard/db';
import { RangeDetector } from '@rangeguard/pool-monitor';
import {
  HedgingEngine,
  DryRunClient,
  RangeTradingEngine,
  type HyperliquidClient,
} from '@rangeguard/hedging-engine';
import type { PricePoint } from './data-loader.js';
import type { Trade } from './analyzer.js';

const logger = createLogger('backtest');

export interface BacktestConfig {
  pair: string; // e.g. 'ETH/USDC'
  hedgeAsset: string; // e.g. 'ETH'
  rangeLower: number;
  rangeUpper: number;
  poolAmountUsd: number;
  leverage: number;
  hedgeRatio: number;
  debounceCount: number;
  cooldownSeconds: number; // per-pool hedge cooldown
  // Range trading params (optional, null = hedge-only mode)
  trading?: {
    enabled: boolean;
    leverage: number;
    stopLossPercent: number;
    trailingPercent: number;
    entryZonePercent: number;
    cooldownSeconds: number;
    maxSizeUsd: number;
  };
}

export interface BacktestResult {
  config: BacktestConfig;
  hedgeTrades: Trade[];
  rangeTrades: Trade[];
  pricePoints: number;
  startTime: number;
  endTime: number;
}

/**
 * Run a backtest by feeding price data through the full engine stack.
 * Uses in-memory DB + DryRunClient — no real orders, no network calls.
 */
export async function runBacktest(
  prices: PricePoint[],
  config: BacktestConfig,
): Promise<BacktestResult> {
  if (prices.length === 0) {
    throw new Error('No price data provided');
  }

  // Create in-memory DB
  const db = createTestDb();

  const poolsRepo = new PoolsRepository(db);
  const walletsRepo = new WalletsRepository(db);
  const hedgesRepo = new HedgesRepository(db);
  const tradeLogRepo = new TradeLogRepository(db);
  const slRepo = new StopLossRepository(db);
  const rangeTradesRepo = new RangeTradesRepository(db);

  // Create wallet
  const wallet = walletsRepo.create({
    address: '0x0000000000000000000000000000000000000001',
    alias: 'backtest-wallet',
    walletType: 'protection',
  });

  // Create pool config
  const [token0, token1] = config.pair.split('/');
  const poolData: CreatePoolConfig = {
    name: `Backtest ${config.pair}`,
    chainId: 42161,
    chainName: 'Arbitrum',
    poolAddress: '0x0000000000000000000000000000000000000000',
    token0Symbol: token0,
    token1Symbol: token1,
    feeTier: 3000,
    rangeLower: config.rangeLower,
    rangeUpper: config.rangeUpper,
    poolAmount: config.poolAmountUsd.toString(),
    hedgeAsset: config.hedgeAsset,
    leverage: config.leverage,
    hedgeRatio: config.hedgeRatio,
    hedgeCooldownSeconds: config.cooldownSeconds,
    protectionDirection: 'both',
    protectionWalletId: wallet.id,
    profitWalletEnabled: false,
    protectionActive: true,
    tradingEnabled: config.trading?.enabled ?? false,
    tradingLeverage: config.trading?.leverage ?? 5,
    tradingStopLossPercent: config.trading?.stopLossPercent ?? 2.0,
    tradingTrailingPercent: config.trading?.trailingPercent ?? 1.5,
    tradingEntryZonePercent: config.trading?.entryZonePercent ?? 25,
    tradingCooldownSeconds: config.trading?.cooldownSeconds ?? 300,
    tradingMaxSizeUsd: config.trading?.maxSizeUsd ?? 1000,
  };

  const poolConfig = poolsRepo.create(poolData);

  // Create HL client (dry-run)
  const hlClient = new DryRunClient() as unknown as HyperliquidClient;
  (hlClient as unknown as DryRunClient).addWallet(wallet.id, 'backtest-wallet', 'fake-key');

  // Collect events
  const hedgeEvents: Array<{ type: 'open' | 'close'; timestamp: number; data: Record<string, unknown> }> = [];

  // Create hedging engine
  const engine = new HedgingEngine(
    poolsRepo,
    walletsRepo,
    hedgesRepo,
    tradeLogRepo,
    hlClient,
    {
      onHedgeOpened: (event) => {
        hedgeEvents.push({ type: 'open', timestamp: event.timestamp, data: event as unknown as Record<string, unknown> });
      },
      onHedgeClosed: (event) => {
        hedgeEvents.push({ type: 'close', timestamp: event.timestamp, data: event as unknown as Record<string, unknown> });
      },
    },
    slRepo,
  );

  // Create range trading engine
  const rangeTradingEngine = new RangeTradingEngine(
    poolsRepo,
    rangeTradesRepo,
    tradeLogRepo,
    hlClient,
    {
      onTradeOpened: () => {},
      onTradeClosed: () => {},
    },
  );

  // Wire mutual exclusion
  engine.setRangeTradingBridge(rangeTradingEngine);

  // Create range detector with global debounce, per-pool cooldown is handled internally
  const rangeDetector = new RangeDetector(
    async (event: RangeExitEvent) => {
      try {
        await engine.onRangeExit(event);
      } catch (error) {
        logger.debug({ error }, 'Backtest: range exit error');
      }
    },
    async (event: RangeReturnEvent) => {
      try {
        await engine.onRangeReturn(event);
      } catch (error) {
        logger.debug({ error }, 'Backtest: range return error');
      }
    },
    config.debounceCount,
    Math.ceil(config.cooldownSeconds / 60), // global fallback
  );

  // Register pool
  rangeDetector.register(poolConfig);
  rangeTradingEngine.register(poolConfig);

  // Feed prices sequentially
  logger.info(
    {
      pair: config.pair,
      range: `${config.rangeLower}-${config.rangeUpper}`,
      prices: prices.length,
      period: `${new Date(prices[0].timestamp).toISOString()} → ${new Date(prices[prices.length - 1].timestamp).toISOString()}`,
    },
    'Starting backtest',
  );

  for (const point of prices) {
    // Mock Date.now() to the candle timestamp for realistic cooldown behavior
    const originalNow = Date.now;
    Date.now = () => point.timestamp;

    rangeDetector.onPriceUpdate(poolConfig.id, point.price);
    rangeTradingEngine.onPriceUpdate(poolConfig.id, point.price);
    poolsRepo.updateStatus(poolConfig.id, 'in-range', point.price.toString());

    // Restore Date.now
    Date.now = originalNow;

    // Allow async operations to settle (DryRunClient is mostly sync)
    await new Promise((r) => setTimeout(r, 0));
  }

  // Allow any final async operations
  await new Promise((r) => setTimeout(r, 100));

  // Collect results from DB
  const hedgeTrades = collectHedgeTrades(hedgesRepo, poolConfig.id, prices);
  const rangeTrades = collectRangeTrades(rangeTradesRepo, poolConfig.id, prices);

  db.close();

  const result: BacktestResult = {
    config,
    hedgeTrades,
    rangeTrades,
    pricePoints: prices.length,
    startTime: prices[0].timestamp,
    endTime: prices[prices.length - 1].timestamp,
  };

  logger.info(
    {
      hedgeTrades: hedgeTrades.length,
      rangeTrades: rangeTrades.length,
    },
    'Backtest complete',
  );

  return result;
}

function collectHedgeTrades(
  hedgesRepo: HedgesRepository,
  poolConfigId: string,
  prices: PricePoint[],
): Trade[] {
  const allHedges = hedgesRepo.findByPool(poolConfigId);
  const lastPrice = prices[prices.length - 1].price;

  return allHedges
    .filter((h) => h.status !== 'open') // only count closed trades
    .map((h) => {
      const entryPrice = parseFloat(h.entryPrice);
      const exitPrice = h.exitPrice ? parseFloat(h.exitPrice) : lastPrice;
      const size = parseFloat(h.size);
      let pnl: number;
      if (h.side === 'short') {
        pnl = (entryPrice - exitPrice) * size;
      } else {
        pnl = (exitPrice - entryPrice) * size;
      }

      return {
        side: h.side as 'long' | 'short',
        entryPrice,
        exitPrice,
        size,
        pnl,
        fees: parseFloat(h.fees || '0'),
        entryTime: h.openedAt,
        exitTime: h.closedAt ?? h.openedAt,
        closeReason: h.closeReason ?? 'unknown',
        isFalseBreakout: !!h.isFalseBreakout,
      };
    });
}

function collectRangeTrades(
  rangeTradesRepo: RangeTradesRepository,
  poolConfigId: string,
  prices: PricePoint[],
): Trade[] {
  const allTrades = rangeTradesRepo.findByPool(poolConfigId);
  const lastPrice = prices[prices.length - 1].price;

  return allTrades
    .filter((t) => t.status !== 'open')
    .map((t) => {
      const entryPrice = parseFloat(t.entryPrice);
      const exitPrice = t.exitPrice ? parseFloat(t.exitPrice) : lastPrice;
      const size = parseFloat(t.size);
      let pnl: number;
      if (t.side === 'long') {
        pnl = (exitPrice - entryPrice) * size;
      } else {
        pnl = (entryPrice - exitPrice) * size;
      }

      return {
        side: t.side as 'long' | 'short',
        entryPrice,
        exitPrice,
        size,
        pnl,
        fees: parseFloat(t.fees || '0'),
        entryTime: t.openedAt,
        exitTime: t.closedAt ?? t.openedAt,
        closeReason: t.closeReason ?? 'unknown',
        isFalseBreakout: false,
      };
    });
}
