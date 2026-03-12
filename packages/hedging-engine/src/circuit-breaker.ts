import { createLogger } from '@rangeguard/common';

const logger = createLogger('circuit-breaker');

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openedAt: number;
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

const DEFAULTS: CircuitBreakerOptions = {
  failureThreshold: 3,
  resetTimeoutMs: 300_000, // 5 minutes
};

export class CircuitBreaker {
  private entries = new Map<string, CircuitEntry>();
  private opts: CircuitBreakerOptions;

  constructor(opts?: Partial<CircuitBreakerOptions>) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  canExecute(poolConfigId: string): boolean {
    const entry = this.entries.get(poolConfigId);
    if (!entry) return true;

    if (entry.state === 'closed') return true;

    if (entry.state === 'open') {
      // Check if timeout has expired → transition to half-open
      if (Date.now() - entry.openedAt >= this.opts.resetTimeoutMs) {
        entry.state = 'half-open';
        logger.info({ poolConfigId }, 'Circuit breaker half-open — allowing one attempt');
        return true;
      }
      return false;
    }

    // half-open: allow one attempt
    return true;
  }

  recordSuccess(poolConfigId: string): void {
    const entry = this.entries.get(poolConfigId);
    if (!entry) return;

    if (entry.state === 'half-open') {
      logger.info({ poolConfigId }, 'Circuit breaker closed after successful half-open attempt');
    }

    // Reset to closed
    this.entries.delete(poolConfigId);
  }

  recordFailure(poolConfigId: string): void {
    const now = Date.now();
    const entry = this.entries.get(poolConfigId);

    if (!entry) {
      this.entries.set(poolConfigId, {
        state: 'closed',
        failureCount: 1,
        lastFailureAt: now,
        openedAt: 0,
      });
      return;
    }

    if (entry.state === 'half-open') {
      // Failed again during half-open → back to open
      entry.state = 'open';
      entry.openedAt = now;
      entry.lastFailureAt = now;
      logger.warn({ poolConfigId }, 'Circuit breaker re-opened after half-open failure');
      return;
    }

    entry.failureCount++;
    entry.lastFailureAt = now;

    if (entry.failureCount >= this.opts.failureThreshold) {
      entry.state = 'open';
      entry.openedAt = now;
      logger.warn(
        { poolConfigId, failures: entry.failureCount, threshold: this.opts.failureThreshold },
        'Circuit breaker OPEN — pausing automatic operations for pool',
      );
    }
  }

  getState(poolConfigId: string): CircuitState {
    const entry = this.entries.get(poolConfigId);
    if (!entry) return 'closed';

    // Check for timeout-based transition
    if (entry.state === 'open' && Date.now() - entry.openedAt >= this.opts.resetTimeoutMs) {
      return 'half-open';
    }

    return entry.state;
  }

  reset(poolConfigId: string): void {
    this.entries.delete(poolConfigId);
  }
}
