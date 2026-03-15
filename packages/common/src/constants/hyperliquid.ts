export const HL_MAINNET = {
  apiUrl: 'https://api.hyperliquid.xyz',
  wsUrl: 'wss://api.hyperliquid.xyz/ws',
} as const;

export const HL_TESTNET = {
  apiUrl: 'https://api.hyperliquid-testnet.xyz',
  wsUrl: 'wss://api.hyperliquid-testnet.xyz/ws',
} as const;

// Common asset name -> Hyperliquid asset index mapping
// These must be verified against HL's /info endpoint at runtime
export const HL_ASSETS: Record<string, number> = {
  BTC: 0,
  ETH: 1,
  ARB: 13,
  MATIC: 15,
};

// Slippage for IOC market orders — override with HL_SLIPPAGE_BPS env var
// Default: 100 bps (1%) for mainnet, 500 bps (5%) for testnet (price divergence)
const envSlippage = process.env.HL_SLIPPAGE_BPS ? parseInt(process.env.HL_SLIPPAGE_BPS, 10) : undefined;
const isTestnet = process.env.HL_API_URL?.includes('testnet') ?? false;
export const HL_SLIPPAGE_BPS = envSlippage ?? (isTestnet ? 500 : 100);
export const HL_MAX_LEVERAGE = 50;
