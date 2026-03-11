/**
 * Seeds the database with realistic demo data for presentations.
 * Creates pools, wallets, closed hedges with PnL/fees, an open hedge
 * with unrealized PnL snapshot, and price history for charts.
 */
import { resolve } from 'path';
import { resolveEnv, defaultDbPath } from '../packages/common/src/utils/env.js';
import { getDatabase, closeDatabase } from '../packages/db/src/connection.js';
import { runMigrations } from '../packages/db/src/migrations/001_initial.js';
import { PoolsRepository } from '../packages/db/src/repositories/pools.repo.js';
import { WalletsRepository } from '../packages/db/src/repositories/wallets.repo.js';
import { PnlRepository } from '../packages/db/src/repositories/pnl.repo.js';

const monorepoRoot = resolve(import.meta.dirname!, '..');
const env = resolveEnv();
const dbPath = process.env.DB_PATH || defaultDbPath(monorepoRoot, env);

const db = getDatabase(dbPath);
runMigrations(db);

// Clean existing data (FK-safe order)
console.log('Cleaning existing data...');
db.exec(`
  DELETE FROM pnl_snapshots;
  DELETE FROM price_cache;
  DELETE FROM trade_log;
  DELETE FROM bot_logs;
  DELETE FROM range_trades;
  DELETE FROM hedge_trades;
  DELETE FROM stop_loss_orders;
  DELETE FROM pool_configs;
  DELETE FROM wallets;
`);

const walletsRepo = new WalletsRepository(db);
const poolsRepo = new PoolsRepository(db);
const pnlRepo = new PnlRepository(db);

// --- Wallets ---
console.log('Creating wallets...');

const wallet1 = walletsRepo.create({
  alias: 'hedge-eth-primary',
  address: '0x769b1202df5275cf15365108bddba4754eb83847',
  walletType: 'protection',
  lowBalanceThreshold: '100',
});

const wallet2 = walletsRepo.create({
  alias: 'hedge-eth-secondary',
  address: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  walletType: 'protection',
  lowBalanceThreshold: '100',
});

const profitWallet = walletsRepo.create({
  alias: 'profit-global',
  address: '0xc09107ac7fc4e35d297bc920d2f18a3720fb0c66',
  walletType: 'profit',
  lowBalanceThreshold: '200',
});

// Set demo balances
walletsRepo.updateBalance(wallet1.id, {
  available: '847.32',
  marginUsed: '152.68',
  total: '1000.00',
  isLow: false,
});
walletsRepo.updateBalance(wallet2.id, {
  available: '1243.50',
  marginUsed: '0',
  total: '1243.50',
  isLow: false,
});
walletsRepo.updateBalance(profitWallet.id, {
  available: '520.00',
  marginUsed: '0',
  total: '520.00',
  isLow: false,
});

// --- Pools ---
console.log('Creating pools...');

const pool1 = poolsRepo.create({
  name: 'ETH/USDC Arbitrum 0.05%',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0xC6962004f452bE9203591991D15f6b388e09E8D0',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  rangeLower: 2000,
  rangeUpper: 2400,
  poolAmount: '15000',
  hedgeAsset: 'ETH',
  leverage: 10,
  protectionDirection: 'both',
  protectionWalletId: wallet1.id,
  profitWalletEnabled: true,
  protectionActive: true,
});

const pool2 = poolsRepo.create({
  name: 'ETH/USDC Arbitrum 0.3%',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0x17c14D2c404D167802b16C450d3c99F88F2c4F4d',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 3000,
  rangeLower: 1800,
  rangeUpper: 2800,
  poolAmount: '30000',
  hedgeAsset: 'ETH',
  leverage: 5,
  protectionDirection: 'below',
  protectionWalletId: wallet2.id,
  profitWalletEnabled: false,
  protectionActive: false,
});

// --- Closed hedges (history) ---
console.log('Creating hedge history...');
const now = Date.now();

// Helper: insert hedge with specific timestamp
const insertHedge = db.prepare(`
  INSERT INTO hedge_trades (
    id, pool_config_id, wallet_id, wallet_type, asset, side,
    size, entry_price, leverage, status, fees, hl_order_id, opened_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, NULL, ?)
`);

const closeHedge = db.prepare(`
  UPDATE hedge_trades SET
    status = 'closed', exit_price = ?, realized_pnl = ?,
    close_reason = ?, is_false_breakout = ?, closed_at = ?,
    fees = CAST(CAST(fees AS REAL) + ? AS TEXT)
  WHERE id = ?
`);

// Hedge 1: 3 days ago — profitable, range return (short ETH @ $2410 → closed @ $2350)
const h1Id = 'demo-hedge-001';
insertHedge.run(
  h1Id,
  pool1.id,
  wallet1.id,
  'protection',
  'ETH',
  'short',
  '0.50',
  '2410.00',
  10,
  '0.0422',
  now - 3 * 86400000,
);
closeHedge.run('2350.00', '30.00', 'range_return', 0, now - 3 * 86400000 + 7200000, 0.0411, h1Id);

// Hedge 2: 2 days ago — false breakout loss (short ETH @ $2420 → closed @ $2450)
const h2Id = 'demo-hedge-002';
insertHedge.run(
  h2Id,
  pool1.id,
  wallet1.id,
  'protection',
  'ETH',
  'short',
  '0.30',
  '2420.00',
  10,
  '0.0254',
  now - 2 * 86400000,
);
closeHedge.run('2450.00', '-9.00', 'range_return', 1, now - 2 * 86400000 + 3600000, 0.0257, h2Id);

// Hedge 3: 1.5 days ago — profitable on pool2 (short ETH @ $1790 → $1750)
const h3Id = 'demo-hedge-003';
insertHedge.run(
  h3Id,
  pool2.id,
  wallet2.id,
  'protection',
  'ETH',
  'short',
  '1.20',
  '1790.00',
  5,
  '0.0752',
  now - 1.5 * 86400000,
);
closeHedge.run('1750.00', '48.00', 'range_return', 0, now - 1.5 * 86400000 + 5400000, 0.0735, h3Id);

// Hedge 4: 18 hours ago — manual close (short ETH @ $2405 → $2390)
const h4Id = 'demo-hedge-004';
insertHedge.run(
  h4Id,
  pool1.id,
  wallet1.id,
  'protection',
  'ETH',
  'short',
  '0.45',
  '2405.00',
  10,
  '0.0379',
  now - 18 * 3600000,
);
closeHedge.run('2390.00', '6.75', 'manual', 0, now - 18 * 3600000 + 1800000, 0.0376, h4Id);

// --- Open hedge (active) ---
console.log('Creating active hedge...');
const h5Id = 'demo-hedge-005';
insertHedge.run(
  h5Id,
  pool1.id,
  wallet1.id,
  'protection',
  'ETH',
  'short',
  '0.55',
  '2415.00',
  10,
  '0.0465',
  now - 45 * 60000,
);

// Set pool1 status to out-of-range since it has an open hedge
poolsRepo.updateStatus(pool1.id, 'out-of-range-above', '2430.00');
poolsRepo.updateStatus(pool2.id, 'in-range', '2150.00');

// PnL snapshot for the open hedge (unrealized PnL)
pnlRepo.createSnapshot(pool1.id, 'protection', '-8.25', '0.0465', '0');

// --- Price history (48h of ETH prices for charts) ---
console.log('Creating price history...');
const priceStmt = db.prepare(
  'INSERT INTO price_cache (asset, price, chain_id, recorded_at) VALUES (?, ?, ?, ?)',
);

const basePrice = 2350;
for (let i = 96; i >= 0; i--) {
  const ts = now - i * 30 * 60 * 1000; // every 30 min
  // Simulate price movement: gradual rise with noise
  const trend = (96 - i) * 0.8; // slight uptrend
  const wave = Math.sin(i / 6) * 40; // oscillation
  const noise = (Math.random() - 0.5) * 15; // random noise
  const price = basePrice + trend + wave + noise;
  priceStmt.run('ETH', price.toFixed(2), 42161, ts);
}

// --- Bot heartbeat (so dashboard shows "Online") ---
pnlRepo.createPriceCache('__bot_heartbeat', now.toString());

console.log('Demo seed complete!');
console.log(`  Wallets: 3`);
console.log(`  Pools: 2 (1 out-of-range, 1 in-range)`);
console.log(`  Hedges: 4 closed + 1 open`);
console.log(`  Price points: 97`);
closeDatabase();
