/**
 * Minimal testnet seed for Railway deploy.
 * Creates ONLY a real ETH/USDC pool config linked to the protection wallet.
 * NO fake hedges, NO fake prices, NO fake data — the bot generates everything real.
 *
 * Env vars (optional):
 *   POOL_RANGE_LOWER  — default 1800
 *   POOL_RANGE_UPPER  — default 2200
 *   POOL_AMOUNT       — default 50 (USD, small for testnet)
 *   POOL_LEVERAGE     — default 5
 */
import { resolve } from 'path';
import { resolveEnv, defaultDbPath } from '../packages/common/src/utils/env.js';
import { getDatabase, closeDatabase } from '../packages/db/src/connection.js';
import { runMigrations } from '../packages/db/src/migrations/001_initial.js';
import { PoolsRepository } from '../packages/db/src/repositories/pools.repo.js';
import { WalletsRepository } from '../packages/db/src/repositories/wallets.repo.js';

const monorepoRoot = resolve(import.meta.dirname!, '..');
const env = resolveEnv();
const dbPath = process.env.DB_PATH || defaultDbPath(monorepoRoot, env);

const db = getDatabase(dbPath);
runMigrations(db);

const walletsRepo = new WalletsRepository(db);
const poolsRepo = new PoolsRepository(db);

// Find the protection wallet (created by bootstrap-vault.ts)
const wallets = walletsRepo.findAll();
const protectionWallet = wallets.find((w) => w.walletType === 'protection');

if (!protectionWallet) {
  console.error('ERROR: No protection wallet found. Run bootstrap-vault.ts first.');
  closeDatabase();
  process.exit(1);
}

// Check if pool already exists (idempotent)
const existingPools = poolsRepo.findActive();
if (existingPools.length > 0) {
  console.log(`Pool already exists (${existingPools[0].name}) — skipping seed`);
  closeDatabase();
  process.exit(0);
}

const rangeLower = Number(process.env.POOL_RANGE_LOWER) || 1800;
const rangeUpper = Number(process.env.POOL_RANGE_UPPER) || 2200;
const poolAmount = process.env.POOL_AMOUNT || '50';
const leverage = Number(process.env.POOL_LEVERAGE) || 5;

const pool = poolsRepo.create({
  name: 'ETH/USDC Arbitrum 0.05%',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0xC6962004f452bE9203591991D15f6b388e09E8D0',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  rangeLower,
  rangeUpper,
  poolAmount,
  hedgeAsset: 'ETH',
  leverage,
  protectionDirection: 'both',
  protectionWalletId: protectionWallet.id,
  profitWalletEnabled: false,
  protectionActive: true,
  hedgeRatio: 1.0,
  hedgeCooldownSeconds: 300,
});

console.log('Testnet seed complete:');
console.log(`  Pool: ${pool.name}`);
console.log(`  Range: $${rangeLower} - $${rangeUpper}`);
console.log(`  Amount: $${poolAmount} (leverage ${leverage}x)`);
console.log(`  Wallet: ${protectionWallet.alias} (${protectionWallet.address})`);
console.log(`  Direction: both`);

closeDatabase();
