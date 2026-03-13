import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainClientManager, type WsStatus } from './chain-client.js';

// Mock viem — we don't want real network connections in unit tests
vi.mock('viem', () => {
  const mockClient = {
    getBlockNumber: vi.fn(),
  };
  return {
    createPublicClient: vi.fn(() => mockClient),
    http: vi.fn((url: string) => `http-transport:${url}`),
    webSocket: vi.fn((url: string) => `ws-transport:${url}`),
  };
});

// Re-import so we can control the mock
import { createPublicClient } from 'viem';
const mockCreatePublicClient = vi.mocked(createPublicClient);

describe('ChainClientManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  function createManager(wsUrl = 'wss://fake-ws.example.com') {
    const manager = new ChainClientManager({
      42161: { http: 'https://fake-http.example.com', ws: wsUrl },
    });
    // Initialize the client pair by calling getClient
    manager.getClient(42161);
    return manager;
  }

  describe('reconnect backoff', () => {
    it('uses exponential backoff for first 10 attempts', async () => {
      const manager = createManager();

      // Make reconnect fail
      mockCreatePublicClient.mockImplementation(() => {
        const client = { getBlockNumber: vi.fn().mockRejectedValue(new Error('WS failed')) };
        return client as any;
      });

      // Simulate WS drop
      manager.notifyWsDropped(42161);

      // First reconnect scheduled at 1s (BASE_RECONNECT_DELAY_MS * 2^0 = 1000)
      // Each failure doubles up to 60s max
      const expectedDelays = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000];

      for (let i = 0; i < expectedDelays.length; i++) {
        await vi.advanceTimersByTimeAsync(expectedDelays[i]);
      }

      // After 9 failures + initial drop, we should have attempt count = 9
      // All should still be in fast mode (< 10)
      expect(manager.getWsStatus(42161)).toBe('disconnected');
    });

    it('switches to slow mode (5 min) after 10 consecutive failures', async () => {
      const manager = createManager();
      const statusChanges: WsStatus[] = [];
      manager.onWsStatusChange((_chainId, status) => statusChanges.push(status));

      mockCreatePublicClient.mockImplementation(() => {
        const client = { getBlockNumber: vi.fn().mockRejectedValue(new Error('WS failed')) };
        return client as any;
      });

      // Trigger initial drop
      manager.notifyWsDropped(42161);

      // Run through 10 fast-phase retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(60_000);
      }

      // Now at attempt 10+ — next retry should be scheduled at 5 minutes (300_000ms)
      // Advance 60s — should NOT have retried yet
      await vi.advanceTimersByTimeAsync(60_000);
      const callCountBefore = mockCreatePublicClient.mock.calls.length;

      // Advance to 5 min total — should retry now
      await vi.advanceTimersByTimeAsync(240_000);
      const callCountAfter = mockCreatePublicClient.mock.calls.length;

      expect(callCountAfter).toBeGreaterThan(callCountBefore);
    });

    it('resets attempt counter on successful reconnection', async () => {
      const manager = createManager();
      let failCount = 0;

      mockCreatePublicClient.mockImplementation(() => {
        failCount++;
        if (failCount <= 3) {
          const client = { getBlockNumber: vi.fn().mockRejectedValue(new Error('WS failed')) };
          return client as any;
        }
        // 4th attempt succeeds
        const client = { getBlockNumber: vi.fn().mockResolvedValue(12345n) };
        return client as any;
      });

      manager.notifyWsDropped(42161);

      // Run through 3 failures + 1 success
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(60_000);
      }

      expect(manager.getWsStatus(42161)).toBe('connected');
    });
  });

  describe('WS status transitions', () => {
    it('emits status changes to listeners', async () => {
      const manager = createManager();
      const events: Array<{ chainId: number; status: WsStatus }> = [];

      manager.onWsStatusChange((chainId, status) => {
        events.push({ chainId, status });
      });

      mockCreatePublicClient.mockImplementation(() => {
        const client = { getBlockNumber: vi.fn().mockRejectedValue(new Error('fail')) };
        return client as any;
      });

      manager.notifyWsDropped(42161);

      // Should have emitted 'disconnected'
      expect(events).toContainEqual({ chainId: 42161, status: 'disconnected' });

      // After timer fires: reconnecting → disconnected
      await vi.advanceTimersByTimeAsync(1000);

      expect(events).toContainEqual({ chainId: 42161, status: 'reconnecting' });
    });

    it('notifyWsDropped is no-op if already disconnected', () => {
      const manager = createManager();
      const events: WsStatus[] = [];
      manager.onWsStatusChange((_chainId, status) => events.push(status));

      mockCreatePublicClient.mockImplementation(() => {
        const client = { getBlockNumber: vi.fn().mockRejectedValue(new Error('fail')) };
        return client as any;
      });

      manager.notifyWsDropped(42161);
      const countAfterFirst = events.length;

      // Second call should be no-op (status is already disconnected)
      manager.notifyWsDropped(42161);
      expect(events.length).toBe(countAfterFirst);
    });
  });

  describe('reconnectWs', () => {
    it('returns false if no WS URL configured', async () => {
      const manager = new ChainClientManager({
        42161: { http: 'https://fake.example.com' },
      });
      manager.getClient(42161);

      const result = await manager.reconnectWs(42161);
      expect(result).toBe(false);
    });

    it('returns false if chain not initialized', async () => {
      const manager = new ChainClientManager();
      const result = await manager.reconnectWs(99999);
      expect(result).toBe(false);
    });

    it('returns true on successful reconnection', async () => {
      const manager = createManager();

      mockCreatePublicClient.mockImplementation(() => {
        const client = { getBlockNumber: vi.fn().mockResolvedValue(12345n) };
        return client as any;
      });

      manager.notifyWsDropped(42161);
      await vi.advanceTimersByTimeAsync(1000);

      expect(manager.getWsStatus(42161)).toBe('connected');
    });
  });

  describe('destroyAll', () => {
    it('clears all clients and timers', async () => {
      const manager = createManager();

      mockCreatePublicClient.mockImplementation(() => {
        const client = { getBlockNumber: vi.fn().mockRejectedValue(new Error('fail')) };
        return client as any;
      });

      manager.notifyWsDropped(42161);
      await manager.destroyAll();

      // After destroy, status should be unavailable (no clients)
      expect(manager.getWsStatus(42161)).toBe('unavailable');
      expect(manager.getAllWsStatuses().size).toBe(0);
    });
  });
});
