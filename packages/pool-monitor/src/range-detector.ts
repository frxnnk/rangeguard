import { createLogger, type PoolConfig, type ProtectionDirection } from '@rangeguard/common';
import type { RangeExitEvent, RangeReturnEvent } from '@rangeguard/common';

const logger = createLogger('range-detector');

type RangeState = 'in-range' | 'out-of-range-below' | 'out-of-range-above';

interface PoolState {
  configId: string;
  currentState: RangeState;
  pendingState: RangeState | null;
  signalStrength: number;
  protectionDirection: ProtectionDirection;
  rangeLower: number;
  rangeUpper: number;
  debounceCount: number; // per-pool debounce threshold
  cooldownMs: number; // per-pool cooldown duration
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
    // Per-pool cooldown if configured, otherwise fall back to global default
    const poolCooldownMs = config.hedgeCooldownSeconds
      ? config.hedgeCooldownSeconds * 1000
      : this.cooldownMs;

    this.states.set(config.id, {
      configId: config.id,
      currentState: 'in-range', // Always start fresh — let debounce detect current state
      pendingState: null,
      signalStrength: 0,
      protectionDirection: config.protectionDirection,
      rangeLower: config.rangeLower,
      rangeUpper: config.rangeUpper,
      debounceCount: config.debounceCount ?? this.debounceCount,
      cooldownMs: poolCooldownMs,
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
    cooldownSeconds?: number,
    debounceCount?: number,
  ): void {
    const state = this.states.get(configId);
    if (state) {
      state.rangeLower = rangeLower;
      state.rangeUpper = rangeUpper;
      state.protectionDirection = direction;
      if (cooldownSeconds !== undefined) {
        state.cooldownMs = cooldownSeconds * 1000;
        // Recalculate cooldownUntil based on last transition
        if (state.lastTransitionAt > 0) {
          state.cooldownUntil = state.lastTransitionAt + state.cooldownMs;
        }
      }
      if (debounceCount !== undefined) {
        state.debounceCount = debounceCount;
      }
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
      state.signalStrength = 0;
      return;
    }

    // Calculate signal weight based on price deviation from range boundary
    const weight = this.calculateSignalWeight(currentPrice, state);

    // Accumulate weighted signal strength
    if (observedState === state.pendingState) {
      state.signalStrength += weight;
    } else {
      state.pendingState = observedState;
      state.signalStrength = weight;
    }

    // Check if debounce threshold met (using signal strength vs per-pool debounceCount)
    if (state.signalStrength < state.debounceCount) {
      logger.debug(
        {
          configId,
          observed: observedState,
          signal: state.signalStrength.toFixed(2),
          needed: state.debounceCount,
          weight: weight.toFixed(2),
        },
        'Debounce accumulating',
      );
      return;
    }

    // Transition confirmed
    const previousState = state.currentState;
    state.currentState = observedState;
    state.pendingState = null;
    state.signalStrength = 0;
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
      state.cooldownUntil = now + state.cooldownMs;
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

  /** Calculate signal weight based on how far the price is from the range boundary */
  private calculateSignalWeight(currentPrice: number, state: PoolState): number {
    const rangeWidth = state.rangeUpper - state.rangeLower;
    if (rangeWidth <= 0) return 1.0;

    let deviation: number;
    if (currentPrice < state.rangeLower) {
      deviation = (state.rangeLower - currentPrice) / rangeWidth;
    } else if (currentPrice > state.rangeUpper) {
      deviation = (currentPrice - state.rangeUpper) / rangeWidth;
    } else {
      // Price is in range — deviation from nearest boundary
      const distToLower = currentPrice - state.rangeLower;
      const distToUpper = state.rangeUpper - currentPrice;
      deviation = Math.min(distToLower, distToUpper) / rangeWidth;
    }

    // >2% of range width → strong signal (weight 1.5, triggers in ~2 observations)
    if (deviation > 0.02) return 1.5;
    // 0.5-2% → normal signal (weight 1.0, triggers in 3 observations like before)
    if (deviation >= 0.005) return 1.0;
    // <0.5% → weak signal near boundary (weight 0.75, triggers in ~4 observations)
    return 0.75;
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
