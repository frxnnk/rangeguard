import { createLogger } from '@trading-bot/common';
import {
  getDatabase,
  closeDatabase,
  runMigrations,
  PoolsRepository,
  WalletsRepository,
  HedgesRepository,
  TradeLogRepository,
  PnlRepository,
} from '@trading-bot/db';
import { Vault, KeyManager } from '@trading-bot/security';
import {
  ChainClientManager,
  PoolWatcher,
  RangeDetector,
  PriceFeed,
} from '@trading-bot/pool-monitor';
import { HedgingEngine, HyperliquidClient, WalletMonitor } from '@trading-bot/hedging-engine';
import { TypedEventBus } from './event-bus.js';
import { loadConfig } from './config.js';

const logger = createLogger('bot');
let lastPriceLogAt = 0;

async function main() {
  logger.info('Starting Trading Bot...');

  // 1. Load configuration
  const config = loadConfig();

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

  // 4. Initialize security (vault + key manager)
  if (!config.vault.password) {
    logger.warn('No VAULT_PASSWORD set - wallet operations will fail until password is provided');
  }

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
  const hlClient = new HyperliquidClient(config.hyperliquid.apiUrl);

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
  const engine = new HedgingEngine(poolsRepo, walletsRepo, hedgesRepo, tradeLogRepo, hlClient, {
    onHedgeOpened: (event) => eventBus.emit('hedge-opened', event),
    onHedgeClosed: (event) => eventBus.emit('hedge-closed', event),
  });

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
      logger.error({ error, event }, 'Error handling range exit');
    }
  });

  eventBus.on('range-return', async (event) => {
    try {
      await engine.onRangeReturn(event);
    } catch (error) {
      logger.error({ error, event }, 'Error handling range return');
    }
  });

  eventBus.on('hedge-opened', (event) => {
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
  });

  eventBus.on('hedge-closed', (event) => {
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
  });

  // 13. Initialize wallet monitor
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
    },
  );

  // 14. Start monitoring active pools
  const watchedPoolIds = new Set<string>();

  const syncPools = async () => {
    const activePools = poolsRepo.findActive();
    const activeIds = new Set(activePools.map((p) => p.id));

    // Add newly activated pools
    for (const pool of activePools) {
      if (!watchedPoolIds.has(pool.id)) {
        rangeDetector.register(pool);
        await poolWatcher.watch(pool);
        watchedPoolIds.add(pool.id);
        logger.info({ poolConfigId: pool.id, name: pool.name }, 'Pool added to monitoring');
      }
    }

    // Remove deactivated pools
    for (const id of watchedPoolIds) {
      if (!activeIds.has(id)) {
        poolWatcher.unwatch(id);
        rangeDetector.unregister(id);
        watchedPoolIds.delete(id);
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

  logger.info('Bot is running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');

    clearInterval(poolSyncInterval);
    clearInterval(heartbeatInterval);
    walletMonitor.stop();
    poolWatcher.unwatchAll();
    eventBus.removeAllListeners();
    await chainClients.destroyAll();
    keyManager.clear();
    closeDatabase();

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
  process.exit(1);
});
