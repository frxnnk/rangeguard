import {
  type PoolConfig,
  UNISWAP_V3_POOL_ABI,
  sqrtPriceX96ToPrice,
  createLogger,
} from '@rangeguard/common';
import type { PriceUpdate } from '@rangeguard/common';
import type { ChainClientManager } from './chain-client.js';

const logger = createLogger('pool-watcher');

type PriceCallback = (update: PriceUpdate) => void;

export type PriceSource = 'ws' | 'polling';

interface WatcherHandle {
  poolAddress: string;
  chainId: number;
  unwatch?: () => void;
  pollingTimer?: ReturnType<typeof setInterval>;
  subscribers: Set<string>; // pool config IDs using this watcher
  source: PriceSource;
}

export class PoolWatcher {
  private clientManager: ChainClientManager;
  private watchers: Map<string, WatcherHandle> = new Map(); // key: chainId:poolAddress
  private callback: PriceCallback;
  private pollingIntervalMs: number;

  constructor(
    clientManager: ChainClientManager,
    callback: PriceCallback,
    pollingIntervalMs: number = 5000,
  ) {
    this.clientManager = clientManager;
    this.callback = callback;
    this.pollingIntervalMs = pollingIntervalMs;

    // Listen for WS reconnections to auto-upgrade polling → WS
    this.clientManager.onWsStatusChange((chainId, status) => {
      if (status === 'connected') {
        this.upgradeToWs(chainId);
      }
    });
  }

  /** Start watching a pool. Shares watcher if same pool address on same chain. */
  async watch(config: PoolConfig): Promise<void> {
    const key = `${config.chainId}:${config.poolAddress.toLowerCase()}`;

    const existing = this.watchers.get(key);
    if (existing) {
      existing.subscribers.add(config.id);
      logger.info({ key, configId: config.id }, 'Added subscriber to existing watcher');
      return;
    }

    const handle: WatcherHandle = {
      poolAddress: config.poolAddress,
      chainId: config.chainId,
      subscribers: new Set([config.id]),
      source: 'polling',
    };

    // Try WebSocket subscription first
    if (this.tryStartWs(handle, config)) {
      this.watchers.set(key, handle);
      return;
    }

    // Fallback: polling slot0
    this.startPolling(handle, config);
    this.watchers.set(key, handle);
  }

  /** Attempt to start a WS subscription for a handle. Returns true on success. */
  private tryStartWs(handle: WatcherHandle, config: PoolConfig): boolean {
    const wsClient = this.clientManager.getWsClient(config.chainId);
    if (!wsClient) return false;

    const key = `${config.chainId}:${config.poolAddress.toLowerCase()}`;

    try {
      handle.unwatch = wsClient.watchContractEvent({
        address: config.poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        eventName: 'Swap',
        onLogs: (logs) => {
          for (const log of logs) {
            const args = log.args as {
              sqrtPriceX96: bigint;
              tick: number;
            };
            if (!args.sqrtPriceX96) continue;

            const price = sqrtPriceX96ToPrice(args.sqrtPriceX96);

            // Emit for each subscriber of this pool
            for (const configId of handle.subscribers) {
              this.callback({
                poolConfigId: configId,
                poolAddress: config.poolAddress,
                chainId: config.chainId,
                currentPrice: price.toString(),
                tick: Number(args.tick),
                sqrtPriceX96: args.sqrtPriceX96,
                timestamp: Date.now(),
              });
            }
          }
        },
        onError: (error) => {
          logger.error({ key, error: error.message }, 'WebSocket error, falling back to polling');
          handle.unwatch = undefined;
          handle.source = 'polling';
          this.clientManager.notifyWsDropped(config.chainId);
          this.startPolling(handle, config);
        },
      });

      handle.source = 'ws';
      logger.info({ key }, 'WebSocket subscription active');
      return true;
    } catch (error) {
      logger.warn({ key, error }, 'Failed to start WebSocket, falling back to polling');
      return false;
    }
  }

  /**
   * Auto-upgrade all polling watchers on a chain to WebSocket after reconnect.
   * Called when ChainClientManager emits a 'connected' status for a chain.
   */
  private upgradeToWs(chainId: number): void {
    for (const [key, handle] of this.watchers) {
      if (handle.chainId !== chainId || handle.source === 'ws') continue;

      // Build a minimal PoolConfig for tryStartWs
      const configProxy: PoolConfig = {
        id: handle.subscribers.values().next().value!,
        poolAddress: handle.poolAddress,
        chainId: handle.chainId,
      } as PoolConfig;

      // Stop polling before attempting WS
      if (handle.pollingTimer) {
        clearInterval(handle.pollingTimer);
        handle.pollingTimer = undefined;
      }

      if (this.tryStartWs(handle, configProxy)) {
        logger.info({ key }, 'Upgraded from polling to WebSocket');
      } else {
        // WS failed again — restart polling
        this.startPolling(handle, configProxy);
      }
    }
  }

  private startPolling(handle: WatcherHandle, config: PoolConfig): void {
    if (handle.pollingTimer) return;

    const poll = async () => {
      try {
        const client = this.clientManager.getHttpClient(config.chainId);
        const result = await client.readContract({
          address: config.poolAddress as `0x${string}`,
          abi: UNISWAP_V3_POOL_ABI,
          functionName: 'slot0',
        });

        const [sqrtPriceX96, tick] = result as unknown as [bigint, number];
        const price = sqrtPriceX96ToPrice(sqrtPriceX96);

        for (const configId of handle.subscribers) {
          this.callback({
            poolConfigId: configId,
            poolAddress: config.poolAddress,
            chainId: config.chainId,
            currentPrice: price.toString(),
            tick: Number(tick),
            sqrtPriceX96,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        logger.error({ poolAddress: handle.poolAddress, error }, 'Polling slot0 failed');
      }
    };

    // Initial poll
    poll();
    handle.pollingTimer = setInterval(poll, this.pollingIntervalMs);
    handle.source = 'polling';
    logger.info(
      { poolAddress: handle.poolAddress, intervalMs: this.pollingIntervalMs },
      'Polling started',
    );
  }

  /** Stop watching a specific pool config */
  unwatch(configId: string): void {
    for (const [key, handle] of this.watchers) {
      handle.subscribers.delete(configId);
      if (handle.subscribers.size === 0) {
        handle.unwatch?.();
        if (handle.pollingTimer) clearInterval(handle.pollingTimer);
        this.watchers.delete(key);
        logger.info({ key }, 'Watcher removed (no subscribers)');
      }
    }
  }

  /** Stop all watchers */
  unwatchAll(): void {
    for (const [_key, handle] of this.watchers) {
      handle.unwatch?.();
      if (handle.pollingTimer) clearInterval(handle.pollingTimer);
    }
    this.watchers.clear();
    logger.info('All watchers stopped');
  }

  /** Get number of active watchers */
  get activeCount(): number {
    return this.watchers.size;
  }

  /** Get price source for each watcher (for monitoring/dashboard) */
  getSources(): Map<string, PriceSource> {
    const result = new Map<string, PriceSource>();
    for (const [key, handle] of this.watchers) {
      result.set(key, handle.source);
    }
    return result;
  }
}
