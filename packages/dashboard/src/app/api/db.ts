import { resolve } from 'path';
import { resolveEnv, defaultDbPath, defaultVaultPath } from '@rangeguard/common';
import { Vault } from '@rangeguard/security';
import {
  getDatabase,
  runMigrations,
  PoolsRepository,
  WalletsRepository,
  HedgesRepository,
  TradeLogRepository,
  PnlRepository,
  SettingsRepository,
  RangeTradesRepository,
  LogsRepository,
} from '@rangeguard/db';

// Resolve DB path to monorepo root so dashboard and bot share the same database.
// In Next.js dev, process.cwd() points to the dashboard package root (packages/dashboard).
const monorepoRoot = resolve(process.cwd(), '..', '..');
const env = resolveEnv();
const dbPath = process.env.DB_PATH || defaultDbPath(monorepoRoot, env);

const db = getDatabase(dbPath);
runMigrations(db);

export const poolsRepo = new PoolsRepository(db);
export const walletsRepo = new WalletsRepository(db);
export const hedgesRepo = new HedgesRepository(db);
export const tradeLogRepo = new TradeLogRepository(db);
export const pnlRepo = new PnlRepository(db);
export const settingsRepo = new SettingsRepository(db);
export const rangeTradesRepo = new RangeTradesRepository(db);
export const logsRepo = new LogsRepository(db);

// Vault for wallet key management (server-side only)
const vaultPassword = process.env.VAULT_PASSWORD || '';
const vaultPath = process.env.VAULT_PATH || defaultVaultPath(env);
export const vault = new Vault(vaultPassword, vaultPath);
