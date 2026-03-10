import { resolve } from 'path';
import {
  getDatabase,
  closeDatabase,
  runMigrations,
  PoolsRepository,
  WalletsRepository,
} from '@trading-bot/db';

// Resolve DB path relative to monorepo root (scripts/ is one level deep)
const monorepoRoot = resolve(__dirname, '..');
const dbPath = process.env.DB_PATH || resolve(monorepoRoot, 'data', 'bot.db');

const db = getDatabase(dbPath);
runMigrations(db);

// Clean existing data in FK-safe order (works even if bot/dashboard hold the DB open)
db.exec(`
  DELETE FROM pnl_snapshots;
  DELETE FROM trade_log;
  DELETE FROM hedge_trades;
  DELETE FROM price_cache;
  DELETE FROM pool_configs;
  DELETE FROM wallets;
`);

const walletsRepo = new WalletsRepository(db);
const poolsRepo = new PoolsRepository(db);

// Seed wallets
console.log('Seeding wallets...');

const protectionWallet1 = walletsRepo.create({
  alias: 'pool-eth-arb',
  address: '0x0000000000000000000000000000000000000001',
  walletType: 'protection',
  lowBalanceThreshold: '100',
});

const protectionWallet2 = walletsRepo.create({
  alias: 'pool-btc-eth',
  address: '0x0000000000000000000000000000000000000002',
  walletType: 'protection',
  lowBalanceThreshold: '100',
});

const profitWallet = walletsRepo.create({
  alias: 'profit-global',
  address: '0x0000000000000000000000000000000000000003',
  walletType: 'profit',
  lowBalanceThreshold: '200',
});

console.log('Wallets created:', [
  protectionWallet1.alias,
  protectionWallet2.alias,
  profitWallet.alias,
]);

// Seed pool configs
console.log('Seeding pool configs...');

poolsRepo.create({
  name: 'ETH/USDC Arbitrum Narrow',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0xC6962004f452bE9203591991D15f6b388e09E8D0',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  rangeLower: 2000,
  rangeUpper: 2500,
  poolAmount: '10000',
  hedgeAsset: 'ETH',
  leverage: 10,
  protectionDirection: 'both',
  protectionWalletId: protectionWallet1.id,
  profitWalletEnabled: true,
  protectionActive: true,
});

poolsRepo.create({
  name: 'ETH/USDC Arbitrum Wide',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0xC6962004f452bE9203591991D15f6b388e09E8D0',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  rangeLower: 1800,
  rangeUpper: 3000,
  poolAmount: '25000',
  hedgeAsset: 'ETH',
  leverage: 10,
  protectionDirection: 'below',
  protectionWalletId: protectionWallet2.id,
  profitWalletEnabled: false,
  protectionActive: false,
});

console.log('Seed complete!');
closeDatabase();
