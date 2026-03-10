export interface ChainConfig {
  id: number;
  name: string;
  displayName: string;
  rpcHttp: string;
  rpcWs?: string;
  blockExplorer: string;
  nativeCurrency: string;
}

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    id: 1,
    name: 'ethereum',
    displayName: 'Ethereum',
    rpcHttp: 'https://eth.llamarpc.com',
    // WS: set WS_ETHEREUM in .env (public RPCs don't support WS subscriptions)
    blockExplorer: 'https://etherscan.io',
    nativeCurrency: 'ETH',
  },
  42161: {
    id: 42161,
    name: 'arbitrum',
    displayName: 'Arbitrum',
    rpcHttp: 'https://arb1.arbitrum.io/rpc',
    // WS: set WS_ARBITRUM in .env (public RPCs don't support WS subscriptions)
    blockExplorer: 'https://arbiscan.io',
    nativeCurrency: 'ETH',
  },
  8453: {
    id: 8453,
    name: 'base',
    displayName: 'Base',
    rpcHttp: 'https://mainnet.base.org',
    // WS: set WS_BASE in .env (public RPCs don't support WS subscriptions)
    blockExplorer: 'https://basescan.org',
    nativeCurrency: 'ETH',
  },
  137: {
    id: 137,
    name: 'polygon',
    displayName: 'Polygon',
    rpcHttp: 'https://polygon-rpc.com',
    // WS: set WS_POLYGON in .env (public RPCs don't support WS subscriptions)
    blockExplorer: 'https://polygonscan.com',
    nativeCurrency: 'MATIC',
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId];
}
