import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync } from 'fs';
import type { AppConfig } from '@trading-bot/common';

// apps/bot/src -> go 3 levels up to reach monorepo root
const monorepoRoot = resolve(import.meta.dirname!, '..', '..', '..');

export function loadConfig(): AppConfig {
  // Load .env file if present
  loadDotenv();

  return {
    vault: {
      path: process.env.VAULT_PATH || resolve(homedir(), '.trading-bot-cgr', 'vault.enc'),
      password: process.env.VAULT_PASSWORD || undefined,
    },
    db: {
      path: process.env.DB_PATH || resolve(monorepoRoot, 'data', 'bot.db'),
    },
    rpc: buildRpcConfig(),
    hyperliquid: {
      apiUrl: process.env.HL_API_URL || 'https://api.hyperliquid-testnet.xyz',
      wsUrl: process.env.HL_WS_URL || 'wss://api.hyperliquid-testnet.xyz/ws',
    },
    monitoring: {
      debounceCount: parseInt(process.env.DEBOUNCE_COUNT || '3'),
      pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
      walletCheckIntervalMs: parseInt(process.env.WALLET_CHECK_INTERVAL_MS || '30000'),
      cooldownMinutes: parseInt(process.env.COOLDOWN_MINUTES || '5'),
    },
    dashboard: {
      port: parseInt(process.env.DASHBOARD_PORT || '3000'),
    },
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || undefined,
    logLevel: process.env.LOG_LEVEL || 'info',
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

function loadDotenv(): void {
  // Try monorepo root first, then cwd
  const candidates = [resolve(monorepoRoot, '.env'), resolve(process.cwd(), '.env')];
  const envPath = candidates.find(existsSync);
  if (!envPath) return;

  const content = readFileSync(envPath, 'utf-8');
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
