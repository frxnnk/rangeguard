import { resolve } from 'path';
import { homedir } from 'os';

export type RangeGuardEnv = 'testnet' | 'mainnet';

export function resolveEnv(): RangeGuardEnv {
  const raw = process.env.RANGEGUARD_ENV?.toLowerCase().trim();
  if (raw === 'mainnet') return 'mainnet';
  return 'testnet'; // safe default
}

export function defaultDbPath(monorepoRoot: string, env: RangeGuardEnv): string {
  return resolve(monorepoRoot, 'data', `bot-${env}.db`);
}

export function defaultVaultPath(env: RangeGuardEnv): string {
  return resolve(homedir(), '.rangeguard', `vault-${env}.enc`);
}
