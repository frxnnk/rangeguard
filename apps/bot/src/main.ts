import { createLogger, sendAlert } from '@trading-bot/common';
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
} from '@trading-bot/db';
import { Vault, KeyManager } from '@trading-bot/security';
import {
  ChainClientManager,
  PoolWatcher,
  RangeDetector,
  PriceFeed,
} from '@trading-bot/pool-monitor';
import {
  HedgingEngine,
  HyperliquidClient,
  DryRunClient,
  WalletMonitor,
  RangeTradingEngine,
} from '@trading-bot/hedging-engine';
import { TypedEventBus } from './event-bus.js';
import { loadConfig } from './config.js';

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
    alert(process.env.ALERT_WEBHOOK_URL, `💀 Bot crashed: uncaughtException — ${err.message}`);
    setTimeout(() => process.exit(1), 2000); // give alert time to send
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    const msg = reason instanceof Error ? reason.message : String(reason);
    alert(process.env.ALERT_WEBHOOK_URL, `💀 Bot crashed: unhandledRejection — ${msg}`);
    setTimeout(() => process.exit(1), 2000);
  });

  logger.info('Starting Trading Bot...');

  // 1. Load configuration
  const config = loadConfig();
  const webhookUrl = config.alertWebhookUrl;

  // Log warnings for missing config
  if (!config.vault.password) {
    logger.warn('No VAULT_PASSWORD set - wallet operations will fail until password is provided');
  }
  if (!webhookUrl) {
    logger.warn('No ALERT_WEBHOOK_URL set — no external alerts will be sent');
  }
  if (config.hyperliquid.apiUrl.includes('testnet')) {
    logger.warn('Using Hyperliquid TESTNET — not mainnet');
  }

  // 2. Initialize database
  const db = getDatabase(config.db.path);
  runMigrations(db);
  logger.info('Database initialized');

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

  // 8. Initialize hedging engine with event callbacks
  const engine = new HedgingEngine(
    poolsRepo,
    walletsRepo,
    hedgesRepo,
    tradeLogRepo,
    hlClient,
    {
      onHedgeOpened: (event) => eventBus.emit('hedge-opened', event),
      onHedgeClosed: (event) => eventBus.emit('hedge-closed', event),
    },
    slRepo,
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

      // Update current price in DB periodically
      poolsRepo.updateStatus(
        update.poolConfigId,
        rangeDetector.getState(update.poolConfigId) || 'in-range',
        update.currentPrice,
      );
    },
    config.monitoring.pollingIntervalMs,
  );

  // 12. Wire event handlers
  eventBus.on('range-exit', async (event) => {
    try {
      await engine.onRangeExit(event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error, event }, 'Error handling range exit');
      alert(webhookUrl, `🔴 Hedge open FAILED for pool ${event.poolConfigId}: ${msg}`);
    }
  });

  eventBus.on('range-return', async (event) => {
    try {
      await engine.onRangeReturn(event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error, event }, 'Error handling range return');
      alert(webhookUrl, `🔴 Hedge close FAILED for pool ${event.poolConfigId}: ${msg}`);
    }
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
        `🟡 Hedge opened: ${event.side.toUpperCase()} ${event.size} @ $${event.entryPrice} (pool: ${event.poolConfigId}, wallet: ${event.walletType})`,
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
      const emoji = pnlNum >= 0 ? '🟢' : '🔴';
      const sign = pnlNum >= 0 ? '+' : '';
      alert(
        webhookUrl,
        `${emoji} Hedge closed: PnL ${sign}$${pnlNum.toFixed(2)} (pool: ${event.poolConfigId}, reason: ${event.closeReason})`,
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
      `📈 Range trade opened: ${event.side.toUpperCase()} ${event.size} @ $${event.entryPrice} (pool: ${event.poolConfigId})`,
    );
  });

  eventBus.on('range-trade-closed', (event) => {
    const pnlNum = parseFloat(event.realizedPnl);
    const emoji = pnlNum >= 0 ? '🟢' : '🔴';
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
      `${emoji} Range trade closed: PnL ${sign}$${pnlNum.toFixed(2)} (reason: ${event.closeReason})`,
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
          `⚠️ Low balance: wallet "${wallet.alias}" has $${parseFloat(balance.available).toFixed(2)} (threshold: $${wallet.lowBalanceThreshold})`,
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
          `💀 LIQUIDATED: ${event.asset} hedge ${hedge.id} on wallet ${event.walletId} — position no longer exists on HL`,
        );
      }
    },
    pnlRepo,
  );

  // 14. Start monitoring active pools
  const watchedPoolIds = new Set<string>();
  const poolRangeCache = new Map<string, string>(); // poolId -> "lower:upper:direction"

  const syncPools = async () => {
    const activePools = poolsRepo.findActive();
    const activeIds = new Set(activePools.map((p) => p.id));

    // Add newly activated pools
    for (const pool of activePools) {
      const rangeKey = `${pool.rangeLower}:${pool.rangeUpper}:${pool.protectionDirection}`;

      if (!watchedPoolIds.has(pool.id)) {
        rangeDetector.register(pool);
        rangeTradingEngine.register(pool);
        await poolWatcher.watch(pool);
        watchedPoolIds.add(pool.id);
        poolRangeCache.set(pool.id, rangeKey);
        logger.info({ poolConfigId: pool.id, name: pool.name }, 'Pool added to monitoring');
      } else if (poolRangeCache.get(pool.id) !== rangeKey) {
        // Range parameters changed in DB — update the detectors
        rangeDetector.updateConfig(
          pool.id,
          pool.rangeLower,
          pool.rangeUpper,
          pool.protectionDirection,
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

  // Re-sync pools every 30s to detect dashboard changes
  const poolSyncInterval = setInterval(async () => {
    try {
      await syncPools();
    } catch (error) {
      logger.error({ error }, 'Failed to sync pools');
    }
  }, 30_000);

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
      } catch (error) {
        logger.warn({ error }, 'DB cleanup failed');
      }
    },
    60 * 60 * 1000,
  ); // every hour

  alert(webhookUrl, `⚡ Bot started — monitoring ${watchedPoolIds.size} pool(s)`);
  logger.info('Bot is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    alert(webhookUrl, '⛔ Bot shutting down');

    // Force exit after 30s if cleanup hangs
    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timeout — forcing exit');
      process.exit(1);
    }, 30_000);

    clearInterval(poolSyncInterval);
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
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
  alert(process.env.ALERT_WEBHOOK_URL, `💀 Bot fatal error: ${error.message || error}`);
  setTimeout(() => process.exit(1), 2000);
});
