export interface TradingPair {
  token0: string;
  token1: string;
  label: string;
  hedgeAsset: string; // which asset to hedge on HL
}

export const DEFAULT_PAIRS: TradingPair[] = [
  { token0: 'WETH', token1: 'USDC', label: 'ETH/USDC', hedgeAsset: 'ETH' },
  { token0: 'WETH', token1: 'USDT', label: 'ETH/USDT', hedgeAsset: 'ETH' },
  { token0: 'WBTC', token1: 'USDC', label: 'BTC/USDC', hedgeAsset: 'BTC' },
  { token0: 'WBTC', token1: 'WETH', label: 'BTC/ETH', hedgeAsset: 'BTC' },
  { token0: 'WETH', token1: 'DAI', label: 'ETH/DAI', hedgeAsset: 'ETH' },
  { token0: 'ARB', token1: 'USDC', label: 'ARB/USDC', hedgeAsset: 'ARB' },
  { token0: 'ARB', token1: 'WETH', label: 'ARB/ETH', hedgeAsset: 'ARB' },
  { token0: 'MATIC', token1: 'USDC', label: 'MATIC/USDC', hedgeAsset: 'MATIC' },
];

export const FEE_TIERS = [
  { value: 100, label: '0.01%' },
  { value: 500, label: '0.05%' },
  { value: 3000, label: '0.3%' },
  { value: 10000, label: '1%' },
] as const;

export const LEVERAGE_OPTIONS = [10, 20] as const;
