import { NextResponse } from 'next/server';
import { resolveEnv } from '@rangeguard/common';
import { settingsRepo } from '../db';

function getDefaults(): Record<string, string> {
  const env = resolveEnv();
  return {
    debounce_count: '3',
    polling_interval_ms: '5000',
    wallet_check_interval_ms: '30000',
    cooldown_minutes: '5',
    circuit_breaker_threshold: '3',
    circuit_breaker_reset_ms: '300000',
    hl_api_url:
      env === 'mainnet'
        ? 'https://api.hyperliquid.xyz'
        : 'https://api.hyperliquid-testnet.xyz',
    hl_ws_url:
      env === 'mainnet'
        ? 'wss://api.hyperliquid.xyz/ws'
        : 'wss://api.hyperliquid-testnet.xyz/ws',
    log_level: 'info',
    hl_environment: env,
  };
}

export async function GET() {
  try {
    const dbSettings = settingsRepo.getAll();
    const merged = { ...getDefaults(), ...dbSettings };
    return NextResponse.json(merged);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        return NextResponse.json(
          { error: `Invalid setting: ${key} must be a string value` },
          { status: 400 },
        );
      }
      // Prevent changing env-controlled settings from dashboard
      if (key === 'hl_environment' || key === 'hl_api_url' || key === 'hl_ws_url') continue;
      settingsRepo.set(key, value);
    }

    const dbSettings = settingsRepo.getAll();
    const merged = { ...getDefaults(), ...dbSettings };
    return NextResponse.json(merged);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
