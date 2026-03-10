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
}
