import { NextResponse } from 'next/server';
import { settingsRepo } from '../db';

const DEFAULTS: Record<string, string> = {
  debounce_count: '3',
  polling_interval_ms: '5000',
  wallet_check_interval_ms: '30000',
  cooldown_minutes: '5',
  hl_api_url: 'https://api.hyperliquid-testnet.xyz',
  hl_ws_url: 'wss://api.hyperliquid-testnet.xyz/ws',
  log_level: 'info',
  hl_environment: 'testnet',
};

export async function GET() {
  try {
    const dbSettings = settingsRepo.getAll();
    const merged = { ...DEFAULTS, ...dbSettings };
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
      settingsRepo.set(key, value);
    }

    const dbSettings = settingsRepo.getAll();
    const merged = { ...DEFAULTS, ...dbSettings };
    return NextResponse.json(merged);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
