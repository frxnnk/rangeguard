import { createLogger, type PoolConfig, type ProtectionDirection } from '@trading-bot/common';
import type { RangeExitEvent, RangeReturnEvent } from '@trading-bot/common';

const logger = createLogger('range-detector');

type RangeState = 'in-range' | 'out-of-range-below' | 'out-of-range-above';

interface PoolState {
  configId: string;
  currentState: RangeState;
  pendingState: RangeState | null;
  consecutiveCount: number;
  protectionDirection: ProtectionDirection;
  rangeLower: number;
  rangeUpper: number;
  lastTransitionAt: number;
  cooldownUntil: number;
}

type RangeExitCallback = (event: RangeExitEvent) => void;
type RangeReturnCallback = (event: RangeReturnEvent) => void;

export class RangeDetector {
  private states: Map<string, PoolState> = new Map();
  private debounceCount: number;
  private cooldownMs: number;
  private onRangeExit: RangeExitCallback;
  private onRangeReturn: RangeReturnCallback;

  constructor(
    onRangeExit: RangeExitCallback,
    onRangeReturn: RangeReturnCallback,
    debounceCount: number = 3,
    cooldownMinutes: number = 5,
  ) {
    this.onRangeExit = onRangeExit;
    this.onRangeReturn = onRangeReturn;
    this.debounceCount = debounceCount;
    this.cooldownMs = cooldownMinutes * 60 * 1000;
  }

  /** Register a pool config for range detection */
  register(config: PoolConfig): void {
    this.states.set(config.id, {
      configId: config.id,
      currentState: 'in-range', // Always start fresh — let debounce detect current state
      pendingState: null,
      consecutiveCount: 0,
      protectionDirection: config.protectionDirection,
      rangeLower: config.rangeLower,
      rangeUpper: config.rangeUpper,
      lastTransitionAt: 0,
      cooldownUntil: 0,
    });
    logger.info(
      { configId: config.id, state: config.status },
      'Pool registered for range detection',
    );
  }

  /** Unregister a pool */
  unregister(configId: string): void {
    this.states.delete(configId);
  }

  /** Update range parameters (e.g., user edited pool config) */
  updateConfig(
    configId: string,
    rangeLower: number,
    rangeUpper: number,
    direction: ProtectionDirection,
  ): void {
    const state = this.states.get(configId);
    if (state) {
      state.rangeLower = rangeLower;
      state.rangeUpper = rangeUpper;
      state.protectionDirection = direction;
    }
  }

  /** Process a price update. Detects transitions with debounce. */
  onPriceUpdate(configId: string, currentPrice: number): void {
    const state = this.states.get(configId);
    if (!state) {
      logger.warn({ configId, currentPrice }, 'Price update for unregistered pool');
      return;
    }

    const now = Date.now();

    // Determine where the price is relative to the range
    let observedState: RangeState;
    if (currentPrice < state.rangeLower) {
      observedState = 'out-of-range-below';
    } else if (currentPrice > state.rangeUpper) {
      observedState = 'out-of-range-above';
    } else {
      observedState = 'in-range';
    }

    // If same as current confirmed state, reset pending
    if (observedState === state.currentState) {
      state.pendingState = null;
      state.consecutiveCount = 0;
      return;
    }

    // Accumulate consecutive observations of the new state
    if (observedState === state.pendingState) {
      state.consecutiveCount++;
    } else {
      state.pendingState = observedState;
      state.consecutiveCount = 1;
    }

    // Check if debounce threshold met
    if (state.consecutiveCount < this.debounceCount) {
      logger.debug(
        {
          configId,
          observed: observedState,
          count: state.consecutiveCount,
          needed: this.debounceCount,
        },
        'Debounce accumulating',
      );
      return;
    }

    // Transition confirmed
    const previousState = state.currentState;
    state.currentState = observedState;
    state.pendingState = null;
    state.consecutiveCount = 0;
    state.lastTransitionAt = now;

    logger.info(
      {
        configId,
        from: previousState,
        to: observedState,
        price: currentPrice,
      },
      'Range state transition',
    );

    // Handle transitions
    if (observedState === 'in-range' && previousState !== 'in-range') {
      // Range return
      const previousDirection = previousState === 'out-of-range-below' ? 'below' : 'above';
      this.onRangeReturn({
        poolConfigId: configId,
        currentPrice: currentPrice.toString(),
        previousDirection,
        timestamp: now,
      });
      state.cooldownUntil = now + this.cooldownMs;
    } else if (observedState !== 'in-range' && previousState === 'in-range') {
      // Range exit - check cooldown
      if (now < state.cooldownUntil) {
        logger.info(
          { configId, cooldownUntil: state.cooldownUntil },
          'Ignoring exit during cooldown',
        );
        state.currentState = previousState; // revert
        return;
      }

      const direction = observedState === 'out-of-range-below' ? 'below' : 'above';

      // Check if this direction is protected
      if (!this.isDirectionProtected(state.protectionDirection, direction)) {
        logger.info(
          { configId, direction, protectionDirection: state.protectionDirection },
          'Direction not protected, ignoring',
        );
        return;
      }

      this.onRangeExit({
        poolConfigId: configId,
        direction,
        currentPrice: currentPrice.toString(),
        rangeLower: state.rangeLower,
        rangeUpper: state.rangeUpper,
        timestamp: now,
      });
    }
  }

  private isDirectionProtected(
    protectionDirection: ProtectionDirection,
    exitDirection: 'below' | 'above',
  ): boolean {
    if (protectionDirection === 'both') return true;
    return protectionDirection === exitDirection;
  }

  /** Get current state of a pool */
  getState(configId: string): RangeState | undefined {
    return this.states.get(configId)?.currentState;
  }

  /** Get all states */
  getAllStates(): Map<string, RangeState> {
    const result = new Map<string, RangeState>();
    for (const [id, state] of this.states) {
      result.set(id, state.currentState);
    }
    return result;
  }
}
