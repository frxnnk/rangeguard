/**
 * Bootstrap vault from WALLET_KEYS env var.
 * Designed for Railway/Docker where interactive CLI is not available.
 *
 * Format: WALLET_KEYS=alias:type:0xprivatekey,alias2:type2:0xprivatekey2
 *   - alias: wallet name (e.g. pool-eth-arb)
 *   - type: "protection" or "profit"
 *   - privatekey: hex private key with 0x prefix
 *
 * Example:
 *   WALLET_KEYS=pool-eth-arb:protection:0xabc123...,profit-global:profit:0xdef456...
 *
 * This script:
 *   1. Parses WALLET_KEYS
 *   2. Derives ETH addresses from the private keys
 *   3. Creates/updates the encrypted vault file
 *   4. Creates wallet records in the DB (if they don't exist)
 */
import { resolve } from 'path';
import { homedir } from 'os';
import { createECDH } from 'crypto';
import { createRequire } from 'module';
import { Vault } from '../packages/security/src/vault.js';
import { getDatabase, closeDatabase } from '../packages/db/src/connection.js';
import { runMigrations } from '../packages/db/src/migrations/001_initial.js';
import { WalletsRepository } from '../packages/db/src/repositories/wallets.repo.js';

// Resolve keccak from hedging-engine's transitive deps
const hedgingRequire = createRequire(
  resolve(import.meta.dirname!, '..', 'packages', 'hedging-engine', 'src', 'index.ts'),
);
const { keccak_256 } = hedgingRequire('@noble/hashes/sha3') as {
  keccak_256: (data: Uint8Array) => Uint8Array;
};

function deriveAddress(privateKeyHex: string): string {
  const privKeyBuf = Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex');
  const ec = createECDH('secp256k1');
  ec.setPrivateKey(privKeyBuf);
  const pubKey = ec.getPublicKey().subarray(1); // remove 0x04 prefix
  const hash = keccak_256(pubKey);
  return '0x' + Buffer.from(hash).subarray(-20).toString('hex');
}

// --- Config ---
const walletKeysRaw = process.env.WALLET_KEYS;
if (!walletKeysRaw) {
  console.log('WALLET_KEYS not set — skipping vault bootstrap');
  process.exit(0);
}

const vaultPassword = process.env.VAULT_PASSWORD;
if (!vaultPassword) {
  console.error('ERROR: WALLET_KEYS is set but VAULT_PASSWORD is missing');
  process.exit(1);
}

const monorepoRoot = resolve(import.meta.dirname!, '..');
const dbPath = process.env.DB_PATH || resolve(monorepoRoot, 'data', 'bot.db');
const vaultPath =
  process.env.VAULT_PATH || resolve(homedir(), '.trading-bot-cgr', 'vault.enc');

// --- Parse WALLET_KEYS ---
console.log('Bootstrapping vault from WALLET_KEYS...');

const entries = walletKeysRaw.split(',').map((entry) => {
  const parts = entry.trim().split(':');
  if (parts.length < 3) {
    console.error(`ERROR: Invalid WALLET_KEYS entry: "${entry}"`);
    console.error('Expected format: alias:type:0xprivatekey');
    process.exit(1);
  }
  const alias = parts[0];
  const walletType = parts[1] as 'protection' | 'profit';
  // Rejoin remaining parts in case the key somehow contained ':'
  const privateKey = parts.slice(2).join(':');

  if (!['protection', 'profit'].includes(walletType)) {
    console.error(`ERROR: Invalid wallet type "${walletType}" for alias "${alias}"`);
    console.error('Must be "protection" or "profit"');
    process.exit(1);
  }

  if (!privateKey.startsWith('0x') || privateKey.length < 66) {
    console.error(`ERROR: Invalid private key for alias "${alias}"`);
    console.error('Must be 0x-prefixed hex (66 chars)');
    process.exit(1);
  }

  const address = deriveAddress(privateKey);
  return { alias, walletType, privateKey, address };
});

// --- Create vault ---
const vault = new Vault(vaultPassword, vaultPath);

for (const entry of entries) {
  vault.setKey(entry.alias, entry.privateKey);
  console.log(`  vault: ${entry.alias} -> ${entry.address}`);
}

console.log(`Vault created at ${vaultPath} with ${entries.length} keys`);

// --- Create wallet records in DB ---
const db = getDatabase(dbPath);
runMigrations(db);

const walletsRepo = new WalletsRepository(db);
const existingWallets = walletsRepo.findAll();
const existingAliases = new Set(existingWallets.map((w) => w.alias));

for (const entry of entries) {
  if (existingAliases.has(entry.alias)) {
    console.log(`  db: ${entry.alias} already exists — skipping`);
    continue;
  }
  walletsRepo.create({
    alias: entry.alias,
    address: entry.address,
    walletType: entry.walletType,
    lowBalanceThreshold: entry.walletType === 'profit' ? '200' : '100',
  });
  console.log(`  db: ${entry.alias} created (${entry.walletType})`);
}

closeDatabase();
console.log('Vault bootstrap complete!');
