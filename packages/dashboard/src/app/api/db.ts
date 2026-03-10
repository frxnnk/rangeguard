import { resolve } from 'path';
import {
  getDatabase,
  runMigrations,
  PoolsRepository,
  WalletsRepository,
  HedgesRepository,
  TradeLogRepository,
  PnlRepository,
  SettingsRepository,
} from '@trading-bot/db';

// Resolve DB path to monorepo root so dashboard and bot share the same database.
// In Next.js dev, process.cwd() points to the dashboard package root (packages/dashboard).
const monorepoRoot = resolve(process.cwd(), '..', '..');
const dbPath = process.env.DB_PATH || resolve(monorepoRoot, 'data', 'bot.db');

const db = getDatabase(dbPath);
runMigrations(db);

export const poolsRepo = new PoolsRepository(db);
export const walletsRepo = new WalletsRepository(db);
export const hedgesRepo = new HedgesRepository(db);
export const tradeLogRepo = new TradeLogRepository(db);
export const pnlRepo = new PnlRepository(db);
export const settingsRepo = new SettingsRepository(db);
