export type ProtectionDirection = 'below' | 'above' | 'both';
export type PoolStatus =
  | 'in-range'
  | 'out-of-range-below'
  | 'out-of-range-above'
  | 'monitoring'
  | 'error';
export type FeeTier = 100 | 500 | 3000 | 10000;

export interface PoolConfig {
  id: string;
  name: string;
  chainId: number;
  chainName: string;
  rpcUrl?: string;
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: FeeTier;
  rangeLower: number;
  rangeUpper: number;
  poolAmount: string; // USD value of LP position, as string for precision
  hedgeAsset: string; // e.g. 'ETH', 'BTC'
  leverage: number;
  protectionDirection: ProtectionDirection;
  protectionWalletId: string;
  profitWalletEnabled: boolean;
  protectionActive: boolean;
  status: PoolStatus;
  currentPrice?: string;
  createdAt: number;
  updatedAt: number;

  // Range trading config (R10)
  tradingEnabled: boolean;
  tradingLeverage: number;
  tradingStopLossPercent: number; // e.g. 2.0 = 2%
  tradingTrailingPercent: number; // e.g. 1.5 = 1.5%
  tradingEntryZonePercent: number; // e.g. 25 = 25% of range
  tradingCooldownSeconds: number; // seconds between trades
  tradingMaxSizeUsd: number; // max position size in USD
}

export interface CreatePoolConfig {
  name: string;
  chainId: number;
  chainName: string;
  rpcUrl?: string;
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: FeeTier;
  rangeLower: number;
  rangeUpper: number;
  poolAmount: string;
  hedgeAsset: string;
  leverage: number;
  protectionDirection: ProtectionDirection;
  protectionWalletId: string;
  profitWalletEnabled: boolean;
  protectionActive: boolean;

  // Range trading config (R10) — all optional, defaults applied in DB
  tradingEnabled?: boolean;
  tradingLeverage?: number;
  tradingStopLossPercent?: number;
  tradingTrailingPercent?: number;
  tradingEntryZonePercent?: number;
  tradingCooldownSeconds?: number;
  tradingMaxSizeUsd?: number;
}
