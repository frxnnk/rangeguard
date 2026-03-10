import { EventEmitter } from 'events';
import type {
  PriceUpdate,
  RangeExitEvent,
  RangeReturnEvent,
  HedgeOpenedEvent,
  HedgeClosedEvent,
  WalletBalanceUpdate,
} from '@trading-bot/common';

interface BotEvents {
  'price-update': (data: PriceUpdate) => void;
  'range-exit': (data: RangeExitEvent) => void;
  'range-return': (data: RangeReturnEvent) => void;
  'hedge-opened': (data: HedgeOpenedEvent) => void;
  'hedge-closed': (data: HedgeClosedEvent) => void;
  'wallet-balance': (data: WalletBalanceUpdate) => void;
}

export class TypedEventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof BotEvents>(event: K, listener: BotEvents[K]): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof BotEvents>(event: K, ...args: Parameters<BotEvents[K]>): void {
    this.emitter.emit(event, ...args);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
