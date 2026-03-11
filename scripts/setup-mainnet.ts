/**
 * Automated mainnet setup script.
 * Generates real private keys, stores them in the encrypted vault,
 * and seeds the DB with wallet addresses.
 *
 * WARNING: Wallets generated here will manage REAL FUNDS on Hyperliquid mainnet.
 *
 * Usage: pnpm setup-mainnet
 */
import { resolve } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';
import { createECDH, randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { Vault } from '../packages/security/src/vault.js';

// Force mainnet environment
process.env.RANGEGUARD_ENV = 'mainnet';

// Load .env from monorepo root
const envPath = resolve(import.meta.dirname!, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key] && val) process.env[key] = val;
  }
}

import { getDatabase, closeDatabase } from '../packages/db/src/connection.js';
import { runMigrations } from '../packages/db/src/migrations/001_initial.js';
import { PoolsRepository } from '../packages/db/src/repositories/pools.repo.js';
import { WalletsRepository } from '../packages/db/src/repositories/wallets.repo.js';

// Resolve keccak from hedging-engine's transitive deps
const hedgingRequire = createRequire(
  resolve(import.meta.dirname!, '..', 'packages', 'hedging-engine', 'src', 'index.ts'),
);
const { keccak_256 } = hedgingRequire('@noble/hashes/sha3') as {
  keccak_256: (data: Uint8Array) => Uint8Array;
};

function generateWallet(): { privateKey: string; address: string } {
  const ec = createECDH('secp256k1');
  const privKeyBuf = randomBytes(32);
  ec.setPrivateKey(privKeyBuf);
  const pubKey = ec.getPublicKey().subarray(1); // remove 0x04 prefix
  const hash = keccak_256(pubKey);
  const address = '0x' + Buffer.from(hash).subarray(-20).toString('hex');
  const privateKey = '0x' + privKeyBuf.toString('hex');
  return { privateKey, address };
}

// --- Config ---
const monorepoRoot = resolve(import.meta.dirname!, '..');
const dbPath = process.env.DB_PATH || resolve(monorepoRoot, 'data', 'bot-mainnet.db');
const vaultPath = process.env.VAULT_PATH || resolve(homedir(), '.rangeguard', 'vault-mainnet.enc');
const vaultPassword = process.env.VAULT_PASSWORD;

if (!vaultPassword) {
  console.error('ERROR: VAULT_PASSWORD not set in .env');
  process.exit(1);
}

// --- Generate wallets ---
console.log('\n' + '='.repeat(70));
console.log('  MAINNET SETUP — las wallets generadas manejarán FONDOS REALES');
console.log('='.repeat(70) + '\n');

const wallets = [
  { alias: 'pool-eth-arb', type: 'protection' as const },
  { alias: 'profit-global', type: 'profit' as const },
];

const generated = wallets.map((w) => {
  const { privateKey, address } = generateWallet();
  return { ...w, privateKey, address };
});

// --- Store keys in vault ---
console.log('Storing private keys in vault...');
const vault = new Vault(vaultPassword, vaultPath);

for (const w of generated) {
  vault.setKey(w.alias, w.privateKey);
  console.log(`  -> ${w.alias} -> ${w.address}`);
}

// Verify vault
const aliases = vault.listAliases();
console.log(`\nVault contains ${aliases.length} keys: ${aliases.join(', ')}`);
console.log(`Vault path: ${vaultPath}`);

// --- Seed DB ---
console.log('\nSeeding database...');
const db = getDatabase(dbPath);
runMigrations(db);

// Clean existing data
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

// Create wallets with real addresses
const protectionWallet = walletsRepo.create({
  alias: generated[0].alias,
  address: generated[0].address,
  walletType: generated[0].type,
  lowBalanceThreshold: '100',
});

const profitWallet = walletsRepo.create({
  alias: generated[1].alias,
  address: generated[1].address,
  walletType: generated[1].type,
  lowBalanceThreshold: '200',
});

console.log(`  -> Wallets created in DB`);

// Seed pool config (real Uniswap V3 WETH/USDC 0.05% pool on Arbitrum)
// protectionActive: false for safety — activate manually after funding
poolsRepo.create({
  name: 'ETH/USDC Arbitrum',
  chainId: 42161,
  chainName: 'Arbitrum',
  poolAddress: '0xC6962004f452bE9203591991D15f6b388e09E8D0',
  token0Symbol: 'WETH',
  token1Symbol: 'USDC',
  feeTier: 500,
  rangeLower: 2000,
  rangeUpper: 2500,
  poolAmount: '1000',
  hedgeAsset: 'ETH',
  leverage: 5,
  protectionDirection: 'both',
  protectionWalletId: protectionWallet.id,
  profitWalletEnabled: true,
  protectionActive: false, // SAFETY: must be manually activated
});

console.log(`  -> Pool config created (protectionActive: false — activar manualmente)`);

closeDatabase();

// --- Summary (NO private keys printed for security) ---
console.log('\n' + '='.repeat(70));
console.log('  SETUP COMPLETE');
console.log('='.repeat(70) + '\n');
console.log('Wallets generadas (solo addresses — keys seguras en el vault):');
for (const w of generated) {
  console.log(`  ${w.alias} (${w.type})`);
  console.log(`    Address: ${w.address}`);
  console.log();
}
console.log(`DB:    ${dbPath}`);
console.log(`Vault: ${vaultPath}`);
console.log();
console.log('Next steps:');
console.log('  1. Fund wallets on Hyperliquid mainnet (deposit USDC)');
console.log('  2. Run: pnpm dev:bot:mainnet');
console.log('  3. Run: pnpm dev:dashboard:mainnet');
console.log('  4. Activate pool protection from the dashboard');
console.log();
console.log('Use `pnpm setup-keys` para exportar keys del vault si las necesita.');
console.log();
