import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { createLogger, resolveEnv, defaultDbPath, defaultVaultPath } from '@rangeguard/common';
import type { AppConfig } from '@rangeguard/common';
import type { SettingsRepository } from '@rangeguard/db';

const logger = createLogger('config');

// apps/bot/src -> go 3 levels up to reach monorepo root
export const monorepoRoot = resolve(import.meta.dirname!, '..', '..', '..');

export function loadConfig(): AppConfig {
  // 1. Load base .env (VAULT_PASSWORD, LOG_LEVEL, RANGEGUARD_ENV, etc.)
  loadDotenv();

  // 2. Resolve env (may come from .env or shell)
  const env = resolveEnv();

  // 3. Load env-specific overrides (.env.testnet or .env.mainnet)
  loadEnvFile(env);

  return {
    env,
    vault: {
      path: process.env.VAULT_PATH || defaultVaultPath(env),
      password: process.env.VAULT_PASSWORD || undefined,
    },
    db: {
      path: process.env.DB_PATH || defaultDbPath(monorepoRoot, env),
    },
    rpc: buildRpcConfig(),
    hyperliquid: {
      apiUrl:
        process.env.HL_API_URL ||
        (env === 'mainnet' ? 'https://api.hyperliquid.xyz' : 'https://api.hyperliquid-testnet.xyz'),
      wsUrl:
        process.env.HL_WS_URL ||
        (env === 'mainnet'
          ? 'wss://api.hyperliquid.xyz/ws'
          : 'wss://api.hyperliquid-testnet.xyz/ws'),
    },
    monitoring: {
      debounceCount: parseInt(process.env.DEBOUNCE_COUNT || '3'),
      pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
      walletCheckIntervalMs: parseInt(process.env.WALLET_CHECK_INTERVAL_MS || '15000'),
      cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES || '5'),
    },
    dashboard: {
      port: parseInt(process.env.DASHBOARD_PORT || '3000'),
    },
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || undefined,
    logLevel: process.env.LOG_LEVEL || 'info',
    dryRun: process.env.DRY_RUN === 'true',
  };
}

function buildRpcConfig(): Record<number, { http: string; ws?: string }> {
  const config: Record<number, { http: string; ws?: string }> = {};

  const chains: Array<{ id: number; httpEnv: string; wsEnv: string }> = [
    { id: 1, httpEnv: 'RPC_ETHEREUM', wsEnv: 'WS_ETHEREUM' },
    { id: 42161, httpEnv: 'RPC_ARBITRUM', wsEnv: 'WS_ARBITRUM' },
    { id: 8453, httpEnv: 'RPC_BASE', wsEnv: 'WS_BASE' },
    { id: 137, httpEnv: 'RPC_POLYGON', wsEnv: 'WS_POLYGON' },
  ];

  for (const chain of chains) {
    const http = process.env[chain.httpEnv];
    const ws = process.env[chain.wsEnv];
    if (http) {
      config[chain.id] = { http, ws };
    }
  }

  return config;
}

/** Merge bot_settings from DB into config (DB values take priority over .env) */
export function applyDbOverrides(config: AppConfig, settingsRepo: SettingsRepository): AppConfig {
  const dbSettings = settingsRepo.getMultiple([
    'debounce_count',
    'polling_interval_ms',
    'wallet_check_interval_ms',
    'cooldown_minutes',
    'hl_api_url',
    'hl_ws_url',
    'log_level',
  ]);

  const merged = { ...config };

  if (dbSettings.debounce_count) {
    merged.monitoring = {
      ...merged.monitoring,
      debounceCount: parseInt(dbSettings.debounce_count),
    };
  }
  if (dbSettings.polling_interval_ms) {
    merged.monitoring = {
      ...merged.monitoring,
      pollingIntervalMs: parseInt(dbSettings.polling_interval_ms),
    };
  }
  if (dbSettings.wallet_check_interval_ms) {
    merged.monitoring = {
      ...merged.monitoring,
      walletCheckIntervalMs: parseInt(dbSettings.wallet_check_interval_ms),
    };
  }
  if (dbSettings.cooldown_minutes) {
    merged.monitoring = {
      ...merged.monitoring,
      cooldownMinutes: parseInt(dbSettings.cooldown_minutes),
    };
  }
  // Guard: only apply DB HL URLs if they match the current env
  if (dbSettings.hl_api_url) {
    const dbIsTestnet = dbSettings.hl_api_url.includes('testnet');
    const configIsTestnet = config.env === 'testnet';
    if (dbIsTestnet !== configIsTestnet) {
      logger.warn('DB hl_api_url conflicts with RANGEGUARD_ENV — ignoring');
    } else {
      merged.hyperliquid = { ...merged.hyperliquid, apiUrl: dbSettings.hl_api_url };
    }
  }
  if (dbSettings.hl_ws_url) {
    const dbIsTestnet = dbSettings.hl_ws_url.includes('testnet');
    const configIsTestnet = config.env === 'testnet';
    if (dbIsTestnet !== configIsTestnet) {
      logger.warn('DB hl_ws_url conflicts with RANGEGUARD_ENV — ignoring');
    } else {
      merged.hyperliquid = { ...merged.hyperliquid, wsUrl: dbSettings.hl_ws_url };
    }
  }
  if (dbSettings.log_level) {
    merged.logLevel = dbSettings.log_level;
  }

  return merged;
}

/** Parse a .env file and set vars that aren't already in process.env */
function parseEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** Load base .env from monorepo root or cwd */
function loadDotenv(): void {
  const candidates = [resolve(monorepoRoot, '.env'), resolve(process.cwd(), '.env')];
  const envPath = candidates.find(existsSync);
  if (envPath) parseEnvFile(envPath);
}

/** Load env-specific .env.{testnet|mainnet} overrides */
function loadEnvFile(env: string): void {
  const candidates = [resolve(monorepoRoot, `.env.${env}`), resolve(process.cwd(), `.env.${env}`)];
  const envPath = candidates.find(existsSync);
  if (envPath) parseEnvFile(envPath);
}
