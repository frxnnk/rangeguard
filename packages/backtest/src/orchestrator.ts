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
  /**
   * Perpetual funding rate per hour (as a fraction, e.g. 0.000_0125 = 0.00125%/h).
   * Default: 0.01% per 8h = 0.000_0125/h. Shorts pay longs in normal contango.
   * Negative fundingPnl = cost to the hedge position.
   */
  fundingRatePerHour?: number;
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
  const hedgeEvents: Array<{
    type: 'open' | 'close';
    timestamp: number;
    data: Record<string, unknown>;
  }> = [];

  // Create hedging engine
  const engine = new HedgingEngine(
    poolsRepo,
    walletsRepo,
    hedgesRepo,
    tradeLogRepo,
    hlClient,
    {
      onHedgeOpened: (event) => {
        hedgeEvents.push({
          type: 'open',
          timestamp: event.timestamp,
          data: event as unknown as Record<string, unknown>,
        });
      },
      onHedgeClosed: (event) => {
        hedgeEvents.push({
          type: 'close',
          timestamp: event.timestamp,
          data: event as unknown as Record<string, unknown>,
        });
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

  // Collect pending async operations so we can await them per-candle.
  // RangeDetector calls callbacks synchronously (fire-and-forget), so without
  // this the loop can fire multiple onRangeExit before the first one writes to DB,
  // causing duplicate hedge opens.
  let pendingOps: Promise<void>[] = [];

  const rangeDetector = new RangeDetector(
    (event: RangeExitEvent) => {
      pendingOps.push(
        engine.onRangeExit(event).catch((error) => {
          logger.debug({ error }, 'Backtest: range exit error');
        }),
      );
    },
    (event: RangeReturnEvent) => {
      pendingOps.push(
        engine.onRangeReturn(event).catch((error) => {
          logger.debug({ error }, 'Backtest: range return error');
        }),
      );
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

  // Process all prices — await any async engine operations per candle
  // to prevent race conditions (multiple hedges opening simultaneously).
  for (let i = 0; i < prices.length; i++) {
    const point = prices[i];

    // Mock Date.now() to the candle timestamp for realistic cooldown behavior
    const originalNow = Date.now;
    Date.now = () => point.timestamp;

    rangeDetector.onPriceUpdate(poolConfig.id, point.price);
    rangeTradingEngine.onPriceUpdate(poolConfig.id, point.price);

    // Restore Date.now
    Date.now = originalNow;

    // Drain any async operations triggered by this candle before moving on
    if (pendingOps.length > 0) {
      await Promise.all(pendingOps);
      pendingOps = [];
    }
  }

  // Force-close any open positions at last price (they'd otherwise be excluded)
  const lastPrice = prices[prices.length - 1].price;
  const lastTimestamp = prices[prices.length - 1].timestamp;
  forceCloseOpenHedges(hedgesRepo, poolConfig.id, lastPrice, lastTimestamp);
  forceCloseOpenRangeTrades(rangeTradesRepo, poolConfig.id, lastPrice, lastTimestamp);

  // Collect results from DB
  // Default funding rate: 0.01% per 8h = 0.00125% per hour = 0.0000125 per hour
  const fundingRate = config.fundingRatePerHour ?? 0.000_012_5;
  const hedgeTrades = collectHedgeTrades(hedgesRepo, poolConfig.id, prices, fundingRate);
  const rangeTrades = collectRangeTrades(rangeTradesRepo, poolConfig.id, prices, fundingRate);

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

function forceCloseOpenHedges(
  hedgesRepo: HedgesRepository,
  poolConfigId: string,
  lastPrice: number,
  lastTimestamp: number,
): void {
  const openHedges = hedgesRepo.findByPool(poolConfigId).filter((h) => h.status === 'open');
  for (const h of openHedges) {
    const entryPrice = parseFloat(h.entryPrice);
    const size = parseFloat(h.size);
    const pnl =
      h.side === 'short' ? (entryPrice - lastPrice) * size : (lastPrice - entryPrice) * size;
    const closeFees = lastPrice * size * 0.00035; // estimate taker fee

    // Mock Date.now to the last candle timestamp
    const originalNow = Date.now;
    Date.now = () => lastTimestamp;
    hedgesRepo.close(
      h.id,
      lastPrice.toString(),
      pnl.toFixed(2),
      'manual',
      false,
      closeFees.toFixed(4),
    );
    Date.now = originalNow;
  }
}

function forceCloseOpenRangeTrades(
  rangeTradesRepo: RangeTradesRepository,
  poolConfigId: string,
  lastPrice: number,
  lastTimestamp: number,
): void {
  const openTrades = rangeTradesRepo.findByPool(poolConfigId).filter((t) => t.status === 'open');
  for (const t of openTrades) {
    const entryPrice = parseFloat(t.entryPrice);
    const size = parseFloat(t.size);
    const pnl =
      t.side === 'long' ? (lastPrice - entryPrice) * size : (entryPrice - lastPrice) * size;
    const closeFees = lastPrice * size * 0.00035;

    const originalNow = Date.now;
    Date.now = () => lastTimestamp;
    rangeTradesRepo.close(
      t.id,
      lastPrice.toString(),
      pnl.toFixed(2),
      'manual',
      closeFees.toFixed(4),
    );
    Date.now = originalNow;
  }
}

function collectHedgeTrades(
  hedgesRepo: HedgesRepository,
  poolConfigId: string,
  prices: PricePoint[],
  fundingRatePerHour: number,
): Trade[] {
  const allHedges = hedgesRepo.findByPool(poolConfigId);
  const lastPrice = prices[prices.length - 1].price;

  return allHedges.map((h) => {
    const entryPrice = parseFloat(h.entryPrice);
    const exitPrice = h.exitPrice ? parseFloat(h.exitPrice) : lastPrice;
    const size = parseFloat(h.size);
    let pnl: number;
    if (h.side === 'short') {
      pnl = (entryPrice - exitPrice) * size;
    } else {
      pnl = (exitPrice - entryPrice) * size;
    }

    // Funding cost: position notional × rate × hours held
    // In normal contango, shorts pay funding → negative PnL for short hedges
    const entryTime = h.openedAt;
    const exitTime = h.closedAt ?? h.openedAt;
    const hoursHeld = (exitTime - entryTime) / 3_600_000;
    const avgNotional = ((entryPrice + exitPrice) / 2) * size;
    // Shorts pay in contango (positive rate), longs receive
    const fundingSign = h.side === 'short' ? -1 : 1;
    const fundingPnl = fundingSign * avgNotional * fundingRatePerHour * hoursHeld;

    return {
      side: h.side as 'long' | 'short',
      entryPrice,
      exitPrice,
      size,
      pnl,
      fees: parseFloat(h.fees || '0'),
      fundingPnl,
      entryTime,
      exitTime,
      closeReason: h.closeReason ?? 'unknown',
      isFalseBreakout: !!h.isFalseBreakout,
    };
  });
}

function collectRangeTrades(
  rangeTradesRepo: RangeTradesRepository,
  poolConfigId: string,
  prices: PricePoint[],
  fundingRatePerHour: number,
): Trade[] {
  const allTrades = rangeTradesRepo.findByPool(poolConfigId);
  const lastPrice = prices[prices.length - 1].price;

  return allTrades.map((t) => {
    const entryPrice = parseFloat(t.entryPrice);
    const exitPrice = t.exitPrice ? parseFloat(t.exitPrice) : lastPrice;
    const size = parseFloat(t.size);
    let pnl: number;
    if (t.side === 'long') {
      pnl = (exitPrice - entryPrice) * size;
    } else {
      pnl = (entryPrice - exitPrice) * size;
    }

    const entryTime = t.openedAt;
    const exitTime = t.closedAt ?? t.openedAt;
    const hoursHeld = (exitTime - entryTime) / 3_600_000;
    const avgNotional = ((entryPrice + exitPrice) / 2) * size;
    const fundingSign = t.side === 'short' ? -1 : 1;
    const fundingPnl = fundingSign * avgNotional * fundingRatePerHour * hoursHeld;

    return {
      side: t.side as 'long' | 'short',
      entryPrice,
      exitPrice,
      size,
      pnl,
      fees: parseFloat(t.fees || '0'),
      fundingPnl,
      entryTime,
      exitTime,
      closeReason: t.closeReason ?? 'unknown',
      isFalseBreakout: false,
    };
  });
}
