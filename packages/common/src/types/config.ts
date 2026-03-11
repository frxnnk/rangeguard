export interface AppConfig {
  env: 'testnet' | 'mainnet';
  vault: {
    path: string;
    password?: string;
  };
  db: {
    path: string;
  };
  rpc: Record<number, { http: string; ws?: string }>;
  hyperliquid: {
    apiUrl: string;
    wsUrl: string;
  };
  monitoring: {
    debounceCount: number; // consecutive out-of-range updates before triggering
    pollingIntervalMs: number; // fallback polling if WS disconnects
    walletCheckIntervalMs: number;
    cooldownMinutes: number; // post-close cooldown to avoid whipsaw
  };
  dashboard: {
    port: number;
  };
  alertWebhookUrl?: string;
  logLevel: string;
  dryRun: boolean;
}

export const DEFAULT_CONFIG: Partial<AppConfig> = {
  monitoring: {
    debounceCount: 3,
    pollingIntervalMs: 5000,
    walletCheckIntervalMs: 30000,
    cooldownMinutes: 5,
  },
  dashboard: {
    port: 3000,
  },
  logLevel: 'info',
};
