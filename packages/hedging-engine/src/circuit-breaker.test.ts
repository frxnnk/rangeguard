import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows execution when no failures recorded (closed)', () => {
    const cb = new CircuitBreaker();
    expect(cb.canExecute('pool-1')).toBe(true);
  });

  it('allows execution after N-1 failures (still closed)', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    expect(cb.canExecute('pool-1')).toBe(true);
    expect(cb.getState('pool-1')).toBe('closed');
  });

  it('blocks execution after N failures (open)', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    expect(cb.canExecute('pool-1')).toBe(false);
    expect(cb.getState('pool-1')).toBe('open');
  });

  it('transitions to half-open after timeout expires', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    expect(cb.canExecute('pool-1')).toBe(false);

    // Advance time past timeout
    vi.advanceTimersByTime(10_001);
    expect(cb.canExecute('pool-1')).toBe(true);
    expect(cb.getState('pool-1')).toBe('half-open');
  });

  it('closes circuit after success in half-open state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5_000 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');

    vi.advanceTimersByTime(5_001);
    expect(cb.canExecute('pool-1')).toBe(true); // half-open

    cb.recordSuccess('pool-1');
    expect(cb.getState('pool-1')).toBe('closed');
    expect(cb.canExecute('pool-1')).toBe(true);
  });

  it('re-opens circuit after failure in half-open state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 5_000 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');

    vi.advanceTimersByTime(5_001);
    cb.canExecute('pool-1'); // triggers half-open transition

    cb.recordFailure('pool-1');
    expect(cb.getState('pool-1')).toBe('open');
    expect(cb.canExecute('pool-1')).toBe(false);
  });

  it('tracks pools independently', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-2');

    expect(cb.canExecute('pool-1')).toBe(false);
    expect(cb.canExecute('pool-2')).toBe(true);
  });

  it('resets a specific pool', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    expect(cb.canExecute('pool-1')).toBe(false);

    cb.reset('pool-1');
    expect(cb.canExecute('pool-1')).toBe(true);
    expect(cb.getState('pool-1')).toBe('closed');
  });

  it('getState returns closed for unknown pool', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState('unknown')).toBe('closed');
  });

  it('recordSuccess on unknown pool is a no-op', () => {
    const cb = new CircuitBreaker();
    cb.recordSuccess('unknown');
    expect(cb.getState('unknown')).toBe('closed');
  });

  it('recordSuccess resets failure count in closed state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    cb.recordSuccess('pool-1');
    // After success, failures should be reset
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');
    expect(cb.canExecute('pool-1')).toBe(true); // only 2 failures, not 3
  });

  it('does not block execution during open period before timeout', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 60_000 });
    cb.recordFailure('pool-1');
    cb.recordFailure('pool-1');

    vi.advanceTimersByTime(30_000); // half the timeout
    expect(cb.canExecute('pool-1')).toBe(false);
    expect(cb.getState('pool-1')).toBe('open');
  });
});
