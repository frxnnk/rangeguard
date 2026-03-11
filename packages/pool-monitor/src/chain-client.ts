import {
  createPublicClient,
  http,
  webSocket,
  type PublicClient,
  type Transport,
  type Chain,
} from 'viem';
import { mainnet, arbitrum, base, polygon } from 'viem/chains';
import { createLogger, type ChainConfig, CHAINS } from '@rangeguard/common';

const logger = createLogger('chain-client');

const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  137: polygon,
};

export type WsStatus = 'connected' | 'disconnected' | 'reconnecting' | 'unavailable';

interface ClientPair {
  http: PublicClient;
  ws: PublicClient | null;
  wsUrl: string | undefined;
  wsStatus: WsStatus;
  wsReconnectTimer?: ReturnType<typeof setTimeout>;
  wsReconnectAttempt: number;
}

/** Max reconnect backoff: 60s */
const MAX_RECONNECT_DELAY_MS = 60_000;
/** Initial reconnect delay: 1s */
const BASE_RECONNECT_DELAY_MS = 1_000;

export class ChainClientManager {
  private clients: Map<number, ClientPair> = new Map();
  private rpcOverrides: Record<number, { http: string; ws?: string }>;
  private wsStatusListeners: Array<(chainId: number, status: WsStatus) => void> = [];

  constructor(rpcOverrides: Record<number, { http: string; ws?: string }> = {}) {
    this.rpcOverrides = rpcOverrides;
  }

  /** Register a listener for WS status changes */
  onWsStatusChange(listener: (chainId: number, status: WsStatus) => void): void {
    this.wsStatusListeners.push(listener);
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

  /** Get WS client if available and connected */
  getWsClient(chainId: number): PublicClient | null {
    const pair = this.getClientPair(chainId);
    return pair.wsStatus === 'connected' ? pair.ws : null;
  }

  /** Get raw WS client (even if reconnecting — used for reconnect checks) */
  getRawWsClient(chainId: number): PublicClient | null {
    return this.getClientPair(chainId).ws;
  }

  /** Get WS connection status for a chain */
  getWsStatus(chainId: number): WsStatus {
    const existing = this.clients.get(chainId);
    return existing?.wsStatus ?? 'unavailable';
  }

  /** Get all chain WS statuses */
  getAllWsStatuses(): Map<number, WsStatus> {
    const result = new Map<number, WsStatus>();
    for (const [chainId, pair] of this.clients) {
      result.set(chainId, pair.wsStatus);
    }
    return result;
  }

  /**
   * Attempt to reconnect WS for a chain.
   * Called by PoolWatcher when WS drops, or internally on schedule.
   */
  async reconnectWs(chainId: number): Promise<boolean> {
    const pair = this.clients.get(chainId);
    if (!pair || !pair.wsUrl) return false;

    this.setWsStatus(pair, chainId, 'reconnecting');

    try {
      const chain = VIEM_CHAINS[chainId];
      const newWsClient = createPublicClient({
        chain,
        transport: webSocket(pair.wsUrl, { keepAlive: true, reconnect: false }),
      }) as PublicClient;

      // Test the connection with a simple call
      await newWsClient.getBlockNumber();

      pair.ws = newWsClient;
      pair.wsReconnectAttempt = 0;
      this.setWsStatus(pair, chainId, 'connected');
      logger.info({ chainId }, 'WebSocket reconnected');
      return true;
    } catch (error) {
      pair.wsReconnectAttempt++;
      this.setWsStatus(pair, chainId, 'disconnected');
      logger.warn(
        { chainId, attempt: pair.wsReconnectAttempt, error },
        'WebSocket reconnection failed',
      );
      this.scheduleReconnect(chainId, pair);
      return false;
    }
  }

  /** Schedule an automatic reconnect with exponential backoff */
  private scheduleReconnect(chainId: number, pair: ClientPair): void {
    if (pair.wsReconnectTimer) return; // already scheduled

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, pair.wsReconnectAttempt - 1),
      MAX_RECONNECT_DELAY_MS,
    );

    logger.info({ chainId, delayMs: delay }, 'Scheduling WS reconnect');

    pair.wsReconnectTimer = setTimeout(async () => {
      pair.wsReconnectTimer = undefined;
      await this.reconnectWs(chainId);
    }, delay);
  }

  /** Notify that WS dropped (called by PoolWatcher on subscription error) */
  notifyWsDropped(chainId: number): void {
    const pair = this.clients.get(chainId);
    if (!pair) return;

    if (pair.wsStatus === 'connected') {
      this.setWsStatus(pair, chainId, 'disconnected');
      pair.wsReconnectAttempt = 0;
      this.scheduleReconnect(chainId, pair);
    }
  }

  private setWsStatus(pair: ClientPair, chainId: number, status: WsStatus): void {
    if (pair.wsStatus === status) return;
    pair.wsStatus = status;
    for (const listener of this.wsStatusListeners) {
      try {
        listener(chainId, status);
      } catch {
        // ignore listener errors
      }
    }
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
    let wsStatus: WsStatus = 'unavailable';
    if (wsUrl) {
      try {
        wsClient = createPublicClient({
          chain,
          transport: webSocket(wsUrl, { keepAlive: true, reconnect: false }),
        }) as PublicClient;
        wsStatus = 'connected';
        logger.info({ chainId, wsUrl }, 'WebSocket client created');
      } catch (error) {
        wsStatus = 'disconnected';
        logger.warn({ chainId, error }, 'Failed to create WebSocket client, using HTTP only');
      }
    }

    const pair: ClientPair = {
      http: httpClient,
      ws: wsClient,
      wsUrl,
      wsStatus,
      wsReconnectAttempt: 0,
    };
    this.clients.set(chainId, pair);

    logger.info({ chainId, httpUrl, wsStatus }, 'Chain client initialized');
    return pair;
  }

  /** Create client for a custom chain (user-provided RPC) */
  addCustomChain(chainId: number, httpUrl: string, wsUrl?: string): void {
    this.rpcOverrides[chainId] = { http: httpUrl, ws: wsUrl };
    // Remove cached client so it gets recreated
    const existing = this.clients.get(chainId);
    if (existing?.wsReconnectTimer) clearTimeout(existing.wsReconnectTimer);
    this.clients.delete(chainId);
    logger.info({ chainId, httpUrl }, 'Custom chain added');
  }

  /** Destroy all clients */
  async destroyAll(): Promise<void> {
    for (const [, pair] of this.clients) {
      if (pair.wsReconnectTimer) clearTimeout(pair.wsReconnectTimer);
    }
    this.clients.clear();
    this.wsStatusListeners = [];
    logger.info('All chain clients destroyed');
  }
}
