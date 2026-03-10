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

export const HL_SLIPPAGE_BPS = 100; // 1% slippage for IOC market orders
export const HL_MAX_LEVERAGE = 50;
