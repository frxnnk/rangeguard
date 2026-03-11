import { createLogger } from '@trading-bot/common';
import type { PoolConfig, HedgeSide } from '@trading-bot/common';

const logger = createLogger('entry-zone-detector');

export type EntryZone = 'low' | 'high' | 'neutral';

export interface EntrySignal {
  poolConfigId: string;
  zone: 'low' | 'high';
  side: HedgeSide; // 'long' for low zone, 'short' for high zone
  currentPrice: number;
  timestamp: number;
}

interface PoolZoneState {
  configId: string;
  currentZone: EntryZone;
  pendingZone: EntryZone | null;
  consecutiveCount: number;
  rangeLower: number;
  rangeUpper: number;
  entryZonePercent: number;
  cooldownUntil: number;
  cooldownSeconds: number;
}

type EntrySignalCallback = (signal: EntrySignal) => void;

/**
 * Detects when price enters configurable entry zones within the LP range.
 * Uses the same debounce pattern as RangeDetector (3 consecutive confirmations).
 *
 * Zone layout (example with 25% entry zone):
 *   [rangeLower ---- 25% low zone ---- | neutral | ---- 25% high zone ---- rangeUpper]
 *
 * - Low zone → emit long signal
 * - High zone → emit short signal
 * - Neutral → no signal
 */
export class EntryZoneDetector {
  private states: Map<string, PoolZoneState> = new Map();
  private debounceCount: number;
  private onEntrySignal: EntrySignalCallback;

  constructor(onEntrySignal: EntrySignalCallback, debounceCount: number = 3) {
    this.onEntrySignal = onEntrySignal;
    this.debounceCount = debounceCount;
  }

  register(config: PoolConfig): void {
    this.states.set(config.id, {
      configId: config.id,
      currentZone: 'neutral',
      pendingZone: null,
      consecutiveCount: 0,
      rangeLower: config.rangeLower,
      rangeUpper: config.rangeUpper,
      entryZonePercent: config.tradingEntryZonePercent,
      cooldownUntil: 0,
      cooldownSeconds: config.tradingCooldownSeconds,
    });
    logger.info(
      { configId: config.id, entryZonePercent: config.tradingEntryZonePercent },
      'Pool registered for entry zone detection',
    );
  }

  unregister(configId: string): void {
    this.states.delete(configId);
  }

  updateConfig(
    configId: string,
    rangeLower: number,
    rangeUpper: number,
    entryZonePercent: number,
    cooldownSeconds: number,
  ): void {
    const state = this.states.get(configId);
    if (state) {
      state.rangeLower = rangeLower;
      state.rangeUpper = rangeUpper;
      state.entryZonePercent = entryZonePercent;
      state.cooldownSeconds = cooldownSeconds;
    }
  }

  /** Set cooldown (call after a trade closes) */
  setCooldown(configId: string): void {
    const state = this.states.get(configId);
    if (state) {
      state.cooldownUntil = Date.now() + state.cooldownSeconds * 1000;
      logger.info({ configId, cooldownSeconds: state.cooldownSeconds }, 'Cooldown started');
    }
  }

  onPriceUpdate(configId: string, currentPrice: number): void {
    const state = this.states.get(configId);
    if (!state) return;

    const now = Date.now();

    // Price must be within range for entry zone trading
    if (currentPrice <= state.rangeLower || currentPrice >= state.rangeUpper) {
      // Out of range — reset to neutral
      state.pendingZone = null;
      state.consecutiveCount = 0;
      if (state.currentZone !== 'neutral') {
        state.currentZone = 'neutral';
      }
      return;
    }

    const rangeWidth = state.rangeUpper - state.rangeLower;
    const zoneFraction = state.entryZonePercent / 100;
    const lowThreshold = state.rangeLower + rangeWidth * zoneFraction;
    const highThreshold = state.rangeUpper - rangeWidth * zoneFraction;

    let observedZone: EntryZone;
    if (currentPrice <= lowThreshold) {
      observedZone = 'low';
    } else if (currentPrice >= highThreshold) {
      observedZone = 'high';
    } else {
      observedZone = 'neutral';
    }

    // Same as current confirmed zone — reset pending
    if (observedZone === state.currentZone) {
      state.pendingZone = null;
      state.consecutiveCount = 0;
      return;
    }

    // Accumulate consecutive observations
    if (observedZone === state.pendingZone) {
      state.consecutiveCount++;
    } else {
      state.pendingZone = observedZone;
      state.consecutiveCount = 1;
    }

    if (state.consecutiveCount < this.debounceCount) {
      return;
    }

    // Transition confirmed
    const previousZone = state.currentZone;
    state.currentZone = observedZone;
    state.pendingZone = null;
    state.consecutiveCount = 0;

    logger.info(
      { configId, from: previousZone, to: observedZone, price: currentPrice },
      'Entry zone transition',
    );

    // Only emit signal when entering an entry zone from neutral
    if (observedZone === 'neutral') return;
    if (previousZone !== 'neutral') return; // zone-to-zone transition, skip

    // Check cooldown
    if (now < state.cooldownUntil) {
      logger.info(
        { configId, cooldownUntil: state.cooldownUntil },
        'Entry signal during cooldown, ignoring',
      );
      return;
    }

    const side: HedgeSide = observedZone === 'low' ? 'long' : 'short';

    this.onEntrySignal({
      poolConfigId: configId,
      zone: observedZone,
      side,
      currentPrice,
      timestamp: now,
    });
  }

  getZone(configId: string): EntryZone | undefined {
    return this.states.get(configId)?.currentZone;
  }
}
