/**
 * Range Trading Simulation Script
 *
 * Simulates a full range trade lifecycle:
 * 1. Price enters low zone -> long entry
 * 2. Price rises -> trailing stop adjusts up
 * 3. Price drops -> trailing stop triggered -> close
 *
 * Usage:
 *   npx tsx scripts/simulate-range-trading.ts [--live]
 *
 * Without --live: uses DryRunClient (no real orders)
 * With --live: uses real HyperliquidClient against testnet
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use relative imports — scripts/ is not a workspace package,
// so @trading-bot/* specifiers cannot be resolved from here.
import { createLogger } from '../packages/common/src/utils/logger.js';
import type { CreatePoolConfig } from '../packages/common/src/types/pool-config.js';
import type {
  RangeTradeOpenedEvent,
  RangeTradeClosedEvent,
} from '../packages/common/src/types/events.js';
import { createTestDb } from '../packages/db/src/test-utils.js';
import { PoolsRepository } from '../packages/db/src/repositories/pools.repo.js';
import { RangeTradesRepository } from '../packages/db/src/repositories/range-trades.repo.js';
import { TradeLogRepository } from '../packages/db/src/repositories/trade-log.repo.js';
import { WalletsRepository } from '../packages/db/src/repositories/wallets.repo.js';
import { RangeTradingEngine } from '../packages/hedging-engine/src/range-trading-engine.js';
import { DryRunClient } from '../packages/hedging-engine/src/dry-run-client.js';
import { HyperliquidClient } from '../packages/hedging-engine/src/hyperliquid-client.js';

const logger = createLogger('simulate');

// --- Configuration ---
const SIMULATED_POOL: CreatePoolConfig = {
  name: 'SIM ETH/USDC',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0x0000000000000000000000000000000000000000',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  rangeLower: 2000,
  rangeUpper: 2400,
  poolAmount: '10000',
  hedgeAsset: 'ETH',
  leverage: 5,
  protectionDirection: 'both',
  protectionWalletId: '', // filled at runtime
  profitWalletEnabled: false,
  protectionActive: true,
  tradingEnabled: true,
  tradingLeverage: 5,
  tradingStopLossPercent: 3,
  tradingTrailingPercent: 1.5,
  tradingEntryZonePercent: 25,
  tradingCooldownSeconds: 0, // no cooldown for simulation
  tradingMaxSizeUsd: 500,
};

// Price sequences for simulation
// Range: 2000-2400, entry zone 25% => low zone 2000-2100, high zone 2300-2400
const PRICE_SEQUENCES = {
  // Scenario 1: Long trade with trailing stop profit
  longTrailingProfit: [
    // Start in neutral zone
    { price: 2200, label: 'Start in neutral' },
    // Move toward low zone
    { price: 2120, label: 'Moving toward low zone' },
    // Enter low zone (need 3 consecutive for debounce)
    { price: 2080, label: 'Enter low zone (1/3)' },
    { price: 2075, label: 'Low zone confirmation (2/3)' },
    { price: 2070, label: 'Low zone confirmed (3/3) -> LONG ENTRY' },
    // Price rises (trailing stop adjusts up)
    { price: 2100, label: 'Price rising' },
    { price: 2150, label: 'Price rising more' },
    { price: 2200, label: 'Price at mid-range' },
    { price: 2250, label: 'New peak!' },
    { price: 2280, label: 'Higher peak!' },
    // Price drops — trailing stop should trigger
    // Trail 1.5% from peak of 2280 = stop at 2280 * 0.985 = 2245.8
    { price: 2260, label: 'Price dropping' },
    { price: 2250, label: 'Price still above stop' },
    { price: 2240, label: 'Below trailing stop -> CLOSE' },
  ],

  // Scenario 2: Short trade with stop-loss
  shortStopLoss: [
    { price: 2200, label: 'Start in neutral' },
    { price: 2280, label: 'Moving toward high zone' },
    { price: 2320, label: 'Enter high zone (1/3)' },
    { price: 2330, label: 'High zone confirmation (2/3)' },
    { price: 2340, label: 'High zone confirmed (3/3) -> SHORT ENTRY' },
    // Price drops (good for short)
    { price: 2310, label: 'Price dropping (favorable)' },
    { price: 2290, label: 'Short in profit' },
    // Price reverses hard — stop loss triggers
    // SL 3% from entry ~2340 = 2340 * 1.03 = 2410.2
    { price: 2350, label: 'Price reversing' },
    { price: 2380, label: 'Getting close to SL' },
    { price: 2420, label: 'Above stop-loss -> CLOSE (SL hit)' },
  ],

  // Scenario 3: Long trade with trailing stop lock-in
  longTrailingLockIn: [
    { price: 2200, label: 'Start in neutral' },
    { price: 2090, label: 'Enter low zone (1/3)' },
    { price: 2085, label: 'Low zone (2/3)' },
    { price: 2080, label: 'Low zone (3/3) -> LONG ENTRY' },
    // Slow grind up
    { price: 2100, label: 'Grinding up' },
    { price: 2120, label: 'Still going' },
    { price: 2140, label: 'Peak at 2140' },
    // Trail 1.5% = stop at 2140 * 0.985 = 2107.9
    { price: 2120, label: 'Pullback' },
    { price: 2110, label: 'Near trailing stop' },
    { price: 2105, label: 'Below trailing stop -> CLOSE (small profit)' },
  ],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSimulation(scenario: keyof typeof PRICE_SEQUENCES, useLive: boolean) {
  const prices = PRICE_SEQUENCES[scenario];
  logger.info(
    { scenario, steps: prices.length, mode: useLive ? 'LIVE' : 'DRY-RUN' },
    '=== Starting simulation ===',
  );

  // Create in-memory DB (uses better-sqlite3 + migrations from db package)
  const db = createTestDb();

  const poolsRepo = new PoolsRepository(db);
  const rangeTradesRepo = new RangeTradesRepository(db);
  const tradeLogRepo = new TradeLogRepository(db);
  const walletsRepo = new WalletsRepository(db);

  // Create a simulated wallet
  const wallet = walletsRepo.create({
    address: '0x769b1202df5275cf15365108bddba4754eb83847',
    alias: `sim-wallet-${scenario}`,
    walletType: 'protection',
  });

  // Create pool config
  const poolConfig = poolsRepo.create({
    ...SIMULATED_POOL,
    protectionWalletId: wallet.id,
  });

  // Enable trading columns (the create uses defaults, so update to ensure enabled)
  poolsRepo.update(poolConfig.id, {
    tradingEnabled: true,
    tradingLeverage: 5,
    tradingStopLossPercent: 3,
    tradingTrailingPercent: 1.5,
    tradingEntryZonePercent: 25,
    tradingCooldownSeconds: 0,
    tradingMaxSizeUsd: 500,
  });

  // Re-read the pool config with updated trading columns
  const updatedConfig = poolsRepo.findById(poolConfig.id)!;

  // Create HL client (dry-run or live)
  let hlClient: DryRunClient | HyperliquidClient;
  if (useLive) {
    const { Vault } = await import('../packages/security/src/vault.js');
    const { KeyManager } = await import('../packages/security/src/key-manager.js');

    const apiUrl = process.env.HL_API_URL ?? 'https://api.hyperliquid-testnet.xyz';
    const realClient = new HyperliquidClient(apiUrl);

    const vaultPassword = process.env.VAULT_PASSWORD;
    if (!vaultPassword) {
      logger.error('VAULT_PASSWORD env var required for --live mode');
      process.exit(1);
    }

    const vaultPath =
      process.env.VAULT_PATH ?? resolve(process.env.HOME ?? '~', '.trading-bot-cgr', 'vault.enc');
    const vault = new Vault(vaultPassword, vaultPath);
    const keyManager = new KeyManager(vault);

    if (vault.exists()) {
      keyManager.loadAll();
    }

    const walletAlias = 'sim-wallet';
    if (keyManager.hasKey(walletAlias)) {
      realClient.addWallet(wallet.id, walletAlias, keyManager.getPrivateKey(walletAlias));
    } else {
      logger.error(
        `Wallet key "${walletAlias}" not found in vault. Use dry-run mode or add key with pnpm setup-keys`,
      );
      process.exit(1);
    }
    hlClient = realClient;
  } else {
    hlClient = new DryRunClient();
    hlClient.addWallet(wallet.id, `sim-wallet-${scenario}`, 'fake-private-key');
  }

  // Track events
  const events: Array<{ type: string; data: RangeTradeOpenedEvent | RangeTradeClosedEvent }> = [];

  // Create engine
  const engine = new RangeTradingEngine(poolsRepo, rangeTradesRepo, tradeLogRepo, hlClient as any, {
    onTradeOpened: (event: RangeTradeOpenedEvent) => {
      events.push({ type: 'opened', data: event });
      logger.info(
        { side: event.side, size: event.size, entryPrice: event.entryPrice },
        'TRADE OPENED',
      );
    },
    onTradeClosed: (event: RangeTradeClosedEvent) => {
      events.push({ type: 'closed', data: event });
      logger.info({ pnl: event.realizedPnl, reason: event.closeReason }, 'TRADE CLOSED');
    },
  });

  // Register pool
  engine.register(updatedConfig);

  // Feed price sequence
  for (const step of prices) {
    logger.info({ price: step.price }, step.label);

    // Update pool current price in DB (engine reads from DB on entry signal)
    poolsRepo.updateStatus(updatedConfig.id, 'in-range', step.price.toString());

    engine.onPriceUpdate(updatedConfig.id, step.price);

    // Small delay to let async operations complete
    await sleep(useLive ? 3000 : 100);
  }

  // Wait for any pending async operations
  await sleep(useLive ? 5000 : 500);

  // Report results
  console.log('\n' + '='.repeat(60));
  console.log(`SIMULATION RESULTS: ${scenario}`);
  console.log('='.repeat(60));
  console.log(`Mode: ${useLive ? 'LIVE (HL Testnet)' : 'DRY-RUN'}`);
  console.log(`Price steps: ${prices.length}`);
  console.log(`Events fired: ${events.length}`);

  for (const event of events) {
    if (event.type === 'opened') {
      const d = event.data as RangeTradeOpenedEvent;
      console.log(`  [OPEN]  ${d.side.toUpperCase()} ${d.size} @ $${d.entryPrice}`);
    } else if (event.type === 'closed') {
      const d = event.data as RangeTradeClosedEvent;
      console.log(`  [CLOSE] PnL $${d.realizedPnl} (${d.closeReason})`);
    }
  }

  // Check DB state
  const allTrades = rangeTradesRepo.findByPool(updatedConfig.id);
  console.log(`\nDB trades: ${allTrades.length}`);
  for (const trade of allTrades) {
    console.log(
      `  ${trade.side.toUpperCase()} ${trade.size} @ $${trade.entryPrice} -> ${trade.status}` +
        (trade.exitPrice ? ` exit $${trade.exitPrice} PnL $${trade.realizedPnl}` : '') +
        (trade.peakPrice ? ` peak $${trade.peakPrice}` : ''),
    );
  }

  const stats = rangeTradesRepo.statsByPool(updatedConfig.id);
  console.log(
    `\nStats: ${stats.totalTrades} trades, PnL: $${stats.totalPnl.toFixed(2)}, Fees: $${stats.totalFees.toFixed(4)}, W/L: ${stats.wins}/${stats.losses}`,
  );
  console.log('='.repeat(60) + '\n');

  db.close();
  return events.length > 0;
}

async function main() {
  const useLive = process.argv.includes('--live');

  console.log(`\nRange Trading Simulator -- ${useLive ? 'LIVE TESTNET' : 'DRY-RUN'} mode\n`);

  if (useLive) {
    console.log('WARNING: LIVE MODE -- Real orders will be placed on HL testnet!\n');
  }

  const scenarios = Object.keys(PRICE_SEQUENCES) as Array<keyof typeof PRICE_SEQUENCES>;
  let allPassed = true;

  for (const scenario of scenarios) {
    try {
      const success = await runSimulation(scenario, useLive);
      if (!success) {
        logger.error({ scenario }, 'No events fired -- simulation may have failed');
        allPassed = false;
      }
    } catch (error) {
      logger.error({ scenario, error }, 'Simulation failed');
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log('All simulations completed successfully!\n');
  } else {
    console.log('Some simulations had issues.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
