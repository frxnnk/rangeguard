import { resolve } from 'path';
import { existsSync } from 'fs';
import { createLogger, setLogSink, sendAlert } from '@rangeguard/common';
import {
  getDatabase,
  closeDatabase,
  runMigrations,
  PoolsRepository,
  WalletsRepository,
  HedgesRepository,
  TradeLogRepository,
  PnlRepository,
  StopLossRepository,
  RangeTradesRepository,
  SettingsRepository,
  LogsRepository,
} from '@rangeguard/db';
import { Vault, KeyManager } from '@rangeguard/security';
import {
  ChainClientManager,
  PoolWatcher,
  RangeDetector,
  PriceFeed,
  LiquidityReader,
} from '@rangeguard/pool-monitor';
import {
  HedgingEngine,
  HyperliquidClient,
  DryRunClient,
  WalletMonitor,
  RangeTradingEngine,
  CircuitBreaker,
} from '@rangeguard/hedging-engine';
import { TypedEventBus } from './event-bus.js';
import { loadConfig, applyDbOverrides, monorepoRoot } from './config.js';

const logger = createLogger('bot');
let lastPriceLogAt = 0;

/** Fire-and-forget alert helper — noop if no webhook configured */
function alert(webhookUrl: string | undefined, message: string): void {
  if (webhookUrl) sendAlert(webhookUrl, message).catch(() => {});
}

async function main() {
  // --- Crash handlers (before anything else) ---
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    alert(process.env.ALERT_WEBHOOK_URL, `\u{1F480} <b>Bot CRASH</b>\nuncaughtException\n<code>${err.message}</code>`);
    setTimeout(() => process.exit(1), 2000); // give alert time to send
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    const msg = reason instanceof Error ? reason.message : String(reason);
    alert(process.env.ALERT_WEBHOOK_URL, `\u{1F480} <b>Bot CRASH</b>\nunhandledRejection\n<code>${msg}</code>`);
    setTimeout(() => process.exit(1), 2000);
  });

  // 1. Load configuration
  let config = loadConfig();
  const webhookUrl = config.alertWebhookUrl;

  logger.info(
    {
      env: config.env,
      dbPath: config.db.path,
      vaultPath: config.vault.path,
      hlApi: config.hyperliquid.apiUrl,
      dryRun: config.dryRun,
    },
    `RangeGuard starting in ${config.env.toUpperCase()} mode`,
  );

  if (config.env === 'mainnet') {
    logger.warn('=== MAINNET MODE — real funds at risk ===');
  }

  // Warn if old non-env-specific DB exists but new one doesn't
  const oldDbPath = resolve(monorepoRoot, 'data', 'bot.db');
  if (existsSync(oldDbPath) && !existsSync(config.db.path) && config.db.path !== oldDbPath) {
    logger.warn(
      { oldPath: oldDbPath, newPath: config.db.path },
      `Found old bot.db — rename it to migrate: mv data/bot.db data/bot-${config.env}.db`,
    );
  }

  // Log warnings for missing config
  if (!config.vault.password) {
    logger.warn('No VAULT_PASSWORD set - wallet operations will fail until password is provided');
  }
  if (!webhookUrl) {
    logger.warn('No ALERT_WEBHOOK_URL set — no external alerts will be sent');
  }

  // 2. Initialize database
  const db = getDatabase(config.db.path);
  runMigrations(db);
  logger.info('Database initialized');

  // 2b. Apply DB settings overrides (DB > .env > defaults)
  const settingsRepo = new SettingsRepository(db);
  config = applyDbOverrides(config, settingsRepo);
  logger.info(
    {
      debounceCount: config.monitoring.debounceCount,
      pollingMs: config.monitoring.pollingIntervalMs,
      walletCheckMs: config.monitoring.walletCheckIntervalMs,
      cooldownMin: config.monitoring.cooldownMinutes,
      hlApi: config.hyperliquid.apiUrl,
      logLevel: config.logLevel,
    },
    'Config loaded (DB overrides applied)',
  );

  // 2c. Set up DB log sink (all loggers will now also write to bot_logs table)
  const logsRepo = new LogsRepository(db);
  setLogSink((level, name, msg, data) => {
    logsRepo.insert(level, name, msg, data);
  });

  // 3. Initialize repositories
  const poolsRepo = new PoolsRepository(db);
  const walletsRepo = new WalletsRepository(db);
  const hedgesRepo = new HedgesRepository(db);
  const tradeLogRepo = new TradeLogRepository(db);
  const pnlRepo = new PnlRepository(db);
  const slRepo = new StopLossRepository(db);
  const rangeTradesRepo = new RangeTradesRepository(db);

  // 4. Initialize security (vault + key manager)
  const vault = new Vault(config.vault.password || '', config.vault.path);
  const keyManager = new KeyManager(vault);

  if (config.vault.password && vault.exists()) {
    keyManager.loadAll();
  }

  // 5. Initialize event bus
  const eventBus = new TypedEventBus();

  // 6. Initialize chain clients
  const chainClients = new ChainClientManager(config.rpc);

  // Log WS connection status changes + alert on disconnect (throttled)
  const wsDisconnectAlerted = new Set<number>();
  chainClients.onWsStatusChange((chainId, status) => {
    if (status === 'connected') {
      logger.info({ chainId }, 'WebSocket connected');
      wsDisconnectAlerted.delete(chainId);
      alert(webhookUrl, `\u{2705} <b>WebSocket Reconectado</b>\nChain: ${chainId}`);
    } else if (status === 'disconnected') {
      logger.warn({ chainId }, 'WebSocket disconnected — falling back to polling');
      // Only alert once per disconnect episode (not on every reconnect cycle)
      if (!wsDisconnectAlerted.has(chainId)) {
        wsDisconnectAlerted.add(chainId);
        alert(webhookUrl, `\u{26A0}\u{FE0F} <b>WebSocket Desconectado</b>\nChain: ${chainId}\nUsando HTTP polling como fallback`);
      }
    } else if (status === 'reconnecting') {
      logger.info({ chainId }, 'WebSocket reconnecting...');
    }
  });

  // 7. Initialize Hyperliquid client and load wallet keys
  // DryRunClient is a structural drop-in for HyperliquidClient — cast so
  // the rest of the code (engine, wallet monitor, etc.) accepts it unchanged.
  const hlClient = (
    config.dryRun ? new DryRunClient() : new HyperliquidClient(config.hyperliquid.apiUrl)
  ) as HyperliquidClient;

  if (config.dryRun) {
    logger.warn('DRY-RUN MODE — no real orders will be sent to Hyperliquid');
  }

  // Load wallet clients from DB + vault
  const allWallets = walletsRepo.findAll();
  for (const wallet of allWallets) {
    if (keyManager.hasKey(wallet.alias)) {
      hlClient.addWallet(wallet.id, wallet.alias, keyManager.getPrivateKey(wallet.alias));
    } else {
      logger.warn({ walletId: wallet.id, alias: wallet.alias }, 'No key found in vault for wallet');
    }
  }

  // 7b. Pre-load asset index cache (avoids lazy resolve on first hedge)
  if (!config.dryRun) {
    try {
      await hlClient.preloadAssetMeta();
    } catch (error) {
      logger.warn({ error }, 'Failed to preload asset meta — will resolve lazily');
    }
  }

  // 8. Initialize circuit breaker (shared between hedge + range trading engines)
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: config.monitoring.circuitBreakerThreshold,
    resetTimeoutMs: config.monitoring.circuitBreakerResetMs,
    onOpen: (poolConfigId, failureCount) => {
      alert(
        webhookUrl,
        `\u{1F6A8} <b>Circuit Breaker ABIERTO</b>\nPool: <code>${poolConfigId}</code>\nFallos consecutivos: ${failureCount}\nOperaciones pausadas por ${Math.round((config.monitoring.circuitBreakerResetMs ?? 300_000) / 60_000)} min`,
      );
    },
  });

  // Initialize hedging engine with event callbacks
  const engine = new HedgingEngine(
    poolsRepo,
    walletsRepo,
    hedgesRepo,
    tradeLogRepo,
    hlClient,
    {
      onHedgeOpened: (event) => eventBus.emit('hedge-opened', event),
      onHedgeClosed: (event) => eventBus.emit('hedge-closed', event),
      onHedgeFailed: (event) => {
        const isNoLiquidity = event.error.includes('No liquidity');
        const emoji = isNoLiquidity ? '\u{26A0}\u{FE0F}' : '\u{274C}';
        const label = isNoLiquidity ? 'Sin Liquidez' : 'Hedge FALLO';
        alert(
          webhookUrl,
          `${emoji} <b>${label}</b>\n${event.side.toUpperCase()} ${event.size} ETH\nPool: <code>${event.poolConfigId.slice(0, 8)}</code>\n${event.error}`,
        );
      },
    },
    slRepo,
    circuitBreaker,
  );

  // 8b. Initialize range trading engine (R10) with mutual exclusion
  const rangeTradingEngine = new RangeTradingEngine(
    poolsRepo,
    rangeTradesRepo,
    tradeLogRepo,
    hlClient,
    {
      onTradeOpened: (event) => eventBus.emit('range-trade-opened', event),
      onTradeClosed: (event) => eventBus.emit('range-trade-closed', event),
    },
    circuitBreaker,
  );

  // Wire mutual exclusion: hedge engine closes range trades before opening hedge
  engine.setRangeTradingBridge(rangeTradingEngine);

  // Restore open range trades from DB (crash recovery)
  rangeTradingEngine.restoreOpenTrades();

  // Cleanup orphaned SL orders from previous sessions
  try {
    await engine.getStopLossManager().cleanupOrphanedSLs();
  } catch (error) {
    logger.warn({ error }, 'Failed to cleanup orphaned SL orders');
  }

  // 9. Initialize price feed
  const priceFeed = new PriceFeed();

  // 10. Initialize range detector
  const rangeDetector = new RangeDetector(
    (event) => {
      eventBus.emit('range-exit', event);
    },
    (event) => {
      eventBus.emit('range-return', event);
    },
    config.monitoring.debounceCount,
    config.monitoring.cooldownMinutes,
  );

  // 11. Initialize pool watcher
  const statusThrottle = new Map<string, { lastState: string; lastWriteAt: number }>();

  const poolWatcher = new PoolWatcher(
    chainClients,
    (update) => {
      priceFeed.update(update);
      eventBus.emit('price-update', update);

      const price = parseFloat(update.currentPrice);
      const now = Date.now();
      if (now - lastPriceLogAt >= 60_000) {
        logger.info({ poolConfigId: update.poolConfigId, price: price.toFixed(2) }, 'Price update');
        lastPriceLogAt = now;

        // Cache price for dashboard charts (once per minute)
        const poolCfg = poolsRepo.findById(update.poolConfigId);
        if (poolCfg) {
          pnlRepo.createPriceCache(poolCfg.hedgeAsset, update.currentPrice, update.chainId);
        }
      }

      rangeDetector.onPriceUpdate(update.poolConfigId, price);

      // Feed range trading engine (R10)
      rangeTradingEngine.onPriceUpdate(update.poolConfigId, price);

      // Update current price in DB — throttled: only on state change or every 30s
      const currentState = rangeDetector.getState(update.poolConfigId) || 'in-range';
      const throttle = statusThrottle.get(update.poolConfigId);
      const stateChanged = !throttle || throttle.lastState !== currentState;
      const stale = !throttle || now - throttle.lastWriteAt >= 30_000;

      if (stateChanged || stale) {
        poolsRepo.updateStatus(update.poolConfigId, currentState, update.currentPrice);
        statusThrottle.set(update.poolConfigId, { lastState: currentState, lastWriteAt: now });
      }
    },
    config.monitoring.pollingIntervalMs,
  );

  // 12. Wire event handlers (with per-wallet mutex to prevent race conditions)
  const walletLocks = new Map<string, Promise<void>>();

  function withWalletLock(walletId: string, fn: () => Promise<void>): Promise<void> {
    const prev = walletLocks.get(walletId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    walletLocks.set(walletId, next);
    return next;
  }

  eventBus.on('range-exit', async (event) => {
    const poolConfig = poolsRepo.findById(event.poolConfigId);
    const walletId = poolConfig?.protectionWalletId ?? event.poolConfigId;
    await withWalletLock(walletId, async () => {
      try {
        await engine.onRangeExit(event);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error, event }, 'Error handling range exit');
        alert(webhookUrl, `\u{274C} <b>Hedge FALLO al abrir</b>\nPool: <code>${event.poolConfigId}</code>\nError: ${msg}`);
      }
    });
  });

  eventBus.on('range-return', async (event) => {
    const poolConfig = poolsRepo.findById(event.poolConfigId);
    const walletId = poolConfig?.protectionWalletId ?? event.poolConfigId;
    await withWalletLock(walletId, async () => {
      try {
        await engine.onRangeReturn(event);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error, event }, 'Error handling range return');
        alert(webhookUrl, `\u{274C} <b>Hedge FALLO al cerrar</b>\nPool: <code>${event.poolConfigId}</code>\nError: ${msg}`);
      }
    });
  });

  eventBus.on('hedge-opened', (event) => {
    try {
      logger.info(
        {
          hedgeTradeId: event.hedgeTradeId,
          poolConfigId: event.poolConfigId,
          walletType: event.walletType,
          side: event.side,
          size: event.size,
        },
        'Hedge opened event',
      );
      alert(
        webhookUrl,
        `\u{1F7E1} <b>Hedge Abierto</b>\n${event.side.toUpperCase()} ${event.size} @ $${parseFloat(event.entryPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}\nPool: <code>${event.poolConfigId}</code>\nWallet: ${event.walletType}`,
      );
    } catch (error) {
      logger.error({ error }, 'Error in hedge-opened handler');
    }
  });

  eventBus.on('hedge-closed', (event) => {
    try {
      logger.info(
        {
          hedgeTradeId: event.hedgeTradeId,
          poolConfigId: event.poolConfigId,
          walletType: event.walletType,
          pnl: event.realizedPnl,
          closeReason: event.closeReason,
        },
        'Hedge closed event',
      );
      const pnlNum = parseFloat(event.realizedPnl);
      const emoji = pnlNum >= 0 ? '\u{1F7E2}' : '\u{1F534}';
      const sign = pnlNum >= 0 ? '+' : '';
      alert(
        webhookUrl,
        `${emoji} <b>Hedge Cerrado</b>\nPnL: <b>${sign}$${pnlNum.toFixed(2)}</b>\nPool: <code>${event.poolConfigId}</code>\nMotivo: ${event.closeReason}`,
      );
    } catch (error) {
      logger.error({ error }, 'Error in hedge-closed handler');
    }
  });

  // Range trade event handlers (R10)
  eventBus.on('range-trade-opened', (event) => {
    logger.info(
      {
        rangeTradeId: event.rangeTradeId,
        poolConfigId: event.poolConfigId,
        side: event.side,
        size: event.size,
        entryPrice: event.entryPrice,
      },
      'Range trade opened',
    );
    alert(
      webhookUrl,
      `\u{1F4C8} <b>Range Trade Abierto</b>\n${event.side.toUpperCase()} ${event.size} @ $${parseFloat(event.entryPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}\nPool: <code>${event.poolConfigId}</code>`,
    );
  });

  eventBus.on('range-trade-closed', (event) => {
    const pnlNum = parseFloat(event.realizedPnl);
    const emoji = pnlNum >= 0 ? '\u{1F7E2}' : '\u{1F534}';
    const sign = pnlNum >= 0 ? '+' : '';
    logger.info(
      {
        rangeTradeId: event.rangeTradeId,
        poolConfigId: event.poolConfigId,
        pnl: event.realizedPnl,
        reason: event.closeReason,
      },
      'Range trade closed',
    );
    alert(
      webhookUrl,
      `${emoji} <b>Range Trade Cerrado</b>\nPnL: <b>${sign}$${pnlNum.toFixed(2)}</b>\nPool: <code>${event.poolConfigId}</code>\nMotivo: ${event.closeReason}`,
    );
  });

  // Reconcile DB hedge state with actual HL positions (detect missed liquidations)
  // Runs after event handlers are wired so reconciliation alerts are sent
  try {
    await engine.reconcilePositions();
  } catch (error) {
    logger.warn({ error }, 'Failed to reconcile positions on startup');
  }

  // 13. Initialize wallet monitor (with liquidation detection)
  const walletMonitor = new WalletMonitor(
    hlClient,
    walletsRepo,
    config.monitoring.walletCheckIntervalMs,
    (wallet, balance) => {
      eventBus.emit('wallet-balance', {
        walletId: wallet.id,
        alias: wallet.alias,
        available: balance.available,
        marginUsed: balance.marginUsed,
        total: balance.total,
        isLow: balance.isLow,
        timestamp: Date.now(),
      });

      if (balance.isLow) {
        alert(
          webhookUrl,
          `\u{26A0}\u{FE0F} <b>Balance Bajo</b>\nWallet: <b>${wallet.alias}</b>\nDisponible: $${parseFloat(balance.available).toFixed(2)}\nUmbral: $${wallet.lowBalanceThreshold}`,
        );
      }
    },
    hedgesRepo,
    (event) => {
      // Liquidation detected — mark hedge as liquidated in DB
      const hedge = hedgesRepo.findById(event.hedgeTradeId);
      if (hedge && hedge.status === 'open') {
        hedgesRepo.close(hedge.id, '0', '0', 'liquidated', false);
        logger.error(
          { hedgeTradeId: hedge.id, walletId: event.walletId, asset: event.asset },
          'Position liquidated on Hyperliquid',
        );
        alert(
          webhookUrl,
          `\u{1F480} <b>LIQUIDACION</b>\nActivo: ${event.asset}\nHedge: <code>${hedge.id}</code>\nWallet: <code>${event.walletId}</code>\nLa posicion ya no existe en Hyperliquid`,
        );
      }
    },
    pnlRepo,
    rangeTradesRepo,
  );

  // 14. Start monitoring active pools
  const watchedPoolIds = new Set<string>();
  const poolRangeCache = new Map<string, string>(); // poolId -> "lower:upper:direction"

  const syncPools = async () => {
    const activePools = poolsRepo.findActive();
    const activeIds = new Set(activePools.map((p) => p.id));

    // Add newly activated pools
    for (const pool of activePools) {
      const rangeKey = `${pool.rangeLower}:${pool.rangeUpper}:${pool.protectionDirection}:${pool.hedgeRatio}:${pool.hedgeCooldownSeconds}:${pool.debounceCount}:${pool.rangeBufferPercent}:${pool.tradingEnabled}:${pool.tradingEntryZonePercent}:${pool.tradingCooldownSeconds}:${pool.leverage}:${pool.tradingLeverage}`;

      if (!watchedPoolIds.has(pool.id)) {
        rangeDetector.register(pool);
        rangeTradingEngine.register(pool);
        await poolWatcher.watch(pool);
        watchedPoolIds.add(pool.id);
        poolRangeCache.set(pool.id, rangeKey);
        logger.info({ poolConfigId: pool.id, name: pool.name }, 'Pool added to monitoring');

        // Pre-set leverage fire-and-forget (removes API call from hot path)
        if (hlClient.hasWallet(pool.protectionWalletId)) {
          hlClient
            .presetLeverage(pool.protectionWalletId, pool.hedgeAsset, pool.leverage)
            .catch((err) => logger.warn({ poolId: pool.id, err }, 'Failed to pre-set leverage'));
        }
      } else if (poolRangeCache.get(pool.id) !== rangeKey) {
        // Range parameters changed in DB — update the detectors
        rangeDetector.updateConfig(
          pool.id,
          pool.rangeLower,
          pool.rangeUpper,
          pool.protectionDirection,
          pool.hedgeCooldownSeconds,
          pool.debounceCount,
          pool.rangeBufferPercent,
        );
        rangeTradingEngine.updateConfig(pool);
        poolRangeCache.set(pool.id, rangeKey);
        logger.info(
          {
            poolConfigId: pool.id,
            rangeLower: pool.rangeLower,
            rangeUpper: pool.rangeUpper,
            direction: pool.protectionDirection,
          },
          'Range parameters updated from DB',
        );
      }
    }

    // Remove deactivated pools
    for (const id of watchedPoolIds) {
      if (!activeIds.has(id)) {
        poolWatcher.unwatch(id);
        rangeDetector.unregister(id);
        rangeTradingEngine.unregister(id);
        watchedPoolIds.delete(id);
        poolRangeCache.delete(id);
        logger.info({ poolConfigId: id }, 'Pool removed from monitoring');
      }
    }
  };

  // Initial sync
  await syncPools();
  logger.info({ count: watchedPoolIds.size }, 'Active pools loaded');

  // Log price source per watcher (WS vs polling)
  const sources = poolWatcher.getSources();
  for (const [key, source] of sources) {
    logger.info({ watcher: key, source }, 'Price source');
  }
  const wsCount = [...sources.values()].filter((s) => s === 'ws').length;
  const pollingCount = sources.size - wsCount;
  if (pollingCount > 0 && wsCount === 0) {
    logger.warn(
      'All watchers using HTTP polling — set WS_ARBITRUM/WS_ETHEREUM env vars for lower latency',
    );
  }

  // Re-sync pools every 10s to detect dashboard changes
  const poolSyncInterval = setInterval(async () => {
    try {
      await syncPools();
    } catch (error) {
      logger.error({ error }, 'Failed to sync pools');
    }
  }, 10_000);

  // 15. Start wallet monitor
  walletMonitor.start();

  // Write heartbeat to DB for dashboard status check
  const heartbeatInterval = setInterval(() => {
    try {
      // Use price_cache table to store heartbeat
      pnlRepo.createPriceCache('__bot_heartbeat', Date.now().toString());
    } catch {
      // ignore heartbeat write errors
    }
  }, 10_000);

  // 16. DB cleanup — purge old price_cache and pnl_snapshots every hour
  const cleanupInterval = setInterval(
    () => {
      try {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
        pnlRepo.cleanupPriceCache(sevenDaysAgo);
        pnlRepo.cleanupPnlSnapshots(ninetyDaysAgo);
        logsRepo.cleanup(sevenDaysAgo);
      } catch (error) {
        logger.warn({ error }, 'DB cleanup failed');
      }
    },
    60 * 60 * 1000,
  ); // every hour

  // 17. LP position auto-sync — reads on-chain value every 5 minutes
  const liquidityReader = new LiquidityReader(chainClients);
  const lpSyncInterval = setInterval(
    async () => {
      try {
        const activePools = poolsRepo.findActive();
        for (const pool of activePools) {
          if (pool.poolAmountSource !== 'on-chain' || !pool.lpTokenId) continue;
          try {
            const position = await liquidityReader.readPosition(
              pool.chainId,
              pool.lpTokenId,
              pool.poolAddress,
            );
            poolsRepo.updatePoolAmount(pool.id, position.valueUsd.toFixed(2), Date.now());
          } catch (error) {
            logger.warn(
              { poolConfigId: pool.id, error },
              'Failed to sync LP position — will retry next cycle',
            );
          }
        }
      } catch (error) {
        logger.warn({ error }, 'LP sync cycle failed');
      }
    },
    5 * 60 * 1000,
  ); // every 5 minutes

  // 18. Daily summary — sends PnL report to Telegram every 24h at midnight UTC
  const sendDailySummary = () => {
    try {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const hedgeStats = hedgesRepo.statsSince(since);
      const rangeStats = rangeTradesRepo.statsSince(since);
      const openHedges = hedgesRepo.findOpen().length;
      const openRangeTrades = rangeTradesRepo.findOpen().length;
      const totalPnl = hedgeStats.totalPnl + rangeStats.totalPnl;
      const totalTrades = hedgeStats.totalTrades + rangeStats.totalTrades;
      const pnlEmoji = totalPnl >= 0 ? '\u{1F7E2}' : '\u{1F534}';
      const sign = totalPnl >= 0 ? '+' : '';

      const lines = [
        `\u{1F4CA} <b>Resumen Diario</b>`,
        ``,
        `<b>Hedges:</b> ${hedgeStats.totalTrades} trades | PnL: ${hedgeStats.totalPnl >= 0 ? '+' : ''}$${hedgeStats.totalPnl.toFixed(2)} | W/L: ${hedgeStats.wins}/${hedgeStats.losses}`,
        `<b>Range Trades:</b> ${rangeStats.totalTrades} trades | PnL: ${rangeStats.totalPnl >= 0 ? '+' : ''}$${rangeStats.totalPnl.toFixed(2)} | W/L: ${rangeStats.wins}/${rangeStats.losses}`,
        ``,
        `${pnlEmoji} <b>PnL Total (24h):</b> ${sign}$${totalPnl.toFixed(2)}`,
        `\u{1F4C8} <b>Trades cerrados:</b> ${totalTrades}`,
        `\u{1F4C2} <b>Posiciones abiertas:</b> ${openHedges} hedges, ${openRangeTrades} range trades`,
        `\u{1F4BB} <b>Pools activos:</b> ${watchedPoolIds.size}`,
      ];

      alert(webhookUrl, lines.join('\n'));
      logger.info({ hedgeStats, rangeStats }, 'Daily summary sent');
    } catch (error) {
      logger.warn({ error }, 'Failed to send daily summary');
    }
  };

  // Schedule first run at next midnight UTC, then every 24h
  const msUntilMidnight = (() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  })();
  const dailySummaryTimeout = setTimeout(() => {
    sendDailySummary();
    dailySummaryInterval = setInterval(sendDailySummary, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  let dailySummaryInterval: ReturnType<typeof setInterval> | undefined;

  alert(webhookUrl, `\u{26A1} <b>Bot Iniciado</b>\nPools activos: ${watchedPoolIds.size}\nEntorno: ${config.env}`);
  logger.info('Bot is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    alert(webhookUrl, '\u{26D4} <b>Bot Detenido</b>');

    // Force exit after 30s if cleanup hangs
    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timeout — forcing exit');
      process.exit(1);
    }, 30_000);

    clearInterval(poolSyncInterval);
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
    clearInterval(lpSyncInterval);
    clearTimeout(dailySummaryTimeout);
    if (dailySummaryInterval) clearInterval(dailySummaryInterval);
    walletMonitor.stop();
    poolWatcher.unwatchAll();
    eventBus.removeAllListeners();
    await chainClients.destroyAll();
    keyManager.clear();
    closeDatabase();

    clearTimeout(forceTimer);
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal error');
  alert(process.env.ALERT_WEBHOOK_URL, `\u{1F480} <b>Error Fatal</b>\n<code>${error.message || error}</code>`);
  setTimeout(() => process.exit(1), 2000);
});
