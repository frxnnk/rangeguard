import {
  createPublicClient,
  http,
  webSocket,
  type PublicClient,
  type Transport,
  type Chain,
} from 'viem';
import { mainnet, arbitrum, base, polygon } from 'viem/chains';
import { createLogger, type ChainConfig, CHAINS } from '@trading-bot/common';

const logger = createLogger('chain-client');

const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  137: polygon,
};

interface ClientPair {
  http: PublicClient;
  ws: PublicClient | null;
}

export class ChainClientManager {
  private clients: Map<number, ClientPair> = new Map();
  private rpcOverrides: Record<number, { http: string; ws?: string }>;

  constructor(rpcOverrides: Record<number, { http: string; ws?: string }> = {}) {
    this.rpcOverrides = rpcOverrides;
  }

  /** Get or create clients for a chain. Returns WS client if available, HTTP otherwise. */
  getClient(chainId: number): PublicClient {
    const pair = this.getClientPair(chainId);
    return pair.ws ?? pair.http;
  }

  /** Get HTTP client specifically (for polling fallback) */
  getHttpClient(chainId: number): PublicClient {
    return this.getClientPair(chainId).http;
  }

  /** Get WS client if available */
  getWsClient(chainId: number): PublicClient | null {
    return this.getClientPair(chainId).ws;
  }

  private getClientPair(chainId: number): ClientPair {
    const existing = this.clients.get(chainId);
    if (existing) return existing;

    const chain = VIEM_CHAINS[chainId];
    const chainConfig = CHAINS[chainId];
    const override = this.rpcOverrides[chainId];

    if (!chain && !chainConfig) {
      throw new Error(`Unsupported chain: ${chainId}. Add it to CHAINS or provide RPC override.`);
    }

    const httpUrl = override?.http ?? chainConfig?.rpcHttp;
    const wsUrl = override?.ws ?? chainConfig?.rpcWs;

    const httpClient = createPublicClient({
      chain,
      transport: http(httpUrl),
    }) as PublicClient;

    let wsClient: PublicClient | null = null;
    if (wsUrl) {
      try {
        wsClient = createPublicClient({
          chain,
          transport: webSocket(wsUrl),
        }) as PublicClient;
        logger.info({ chainId, wsUrl }, 'WebSocket client created');
      } catch (error) {
        logger.warn({ chainId, error }, 'Failed to create WebSocket client, using HTTP only');
      }
    }

    const pair: ClientPair = { http: httpClient, ws: wsClient };
    this.clients.set(chainId, pair);

    logger.info({ chainId, httpUrl, hasWs: !!wsClient }, 'Chain client initialized');
    return pair;
  }

  /** Create client for a custom chain (user-provided RPC) */
  addCustomChain(chainId: number, httpUrl: string, wsUrl?: string): void {
    this.rpcOverrides[chainId] = { http: httpUrl, ws: wsUrl };
    // Remove cached client so it gets recreated
    this.clients.delete(chainId);
    logger.info({ chainId, httpUrl }, 'Custom chain added');
  }

  /** Destroy all clients */
  async destroyAll(): Promise<void> {
    this.clients.clear();
    logger.info('All chain clients destroyed');
  }
}
