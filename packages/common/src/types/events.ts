export interface PriceUpdate {
  poolConfigId: string;
  poolAddress: string;
  chainId: number;
  currentPrice: string;
  tick: number;
  sqrtPriceX96: bigint;
  timestamp: number;
}

export interface RangeExitEvent {
  poolConfigId: string;
  direction: 'below' | 'above';
  currentPrice: string;
  rangeLower: number;
  rangeUpper: number;
  timestamp: number;
}

export interface RangeReturnEvent {
  poolConfigId: string;
  currentPrice: string;
  previousDirection: 'below' | 'above';
  timestamp: number;
}

export interface HedgeOpenedEvent {
  hedgeTradeId: string;
  poolConfigId: string;
  walletId: string;
  walletType: 'protection' | 'profit';
  side: 'short' | 'long';
  size: string;
  entryPrice: string;
  timestamp: number;
}

export interface HedgeClosedEvent {
  hedgeTradeId: string;
  poolConfigId: string;
  walletId: string;
  walletType: 'protection' | 'profit';
  realizedPnl: string;
  isFalseBreakout: boolean;
  closeReason: string;
  timestamp: number;
}

// Range trading events (R10)
export interface RangeTradeOpenedEvent {
  rangeTradeId: string;
  poolConfigId: string;
  walletId: string;
  side: 'short' | 'long';
  size: string;
  entryPrice: string;
  timestamp: number;
}

export interface RangeTradeClosedEvent {
  rangeTradeId: string;
  poolConfigId: string;
  walletId: string;
  realizedPnl: string;
  closeReason: string;
  timestamp: number;
}

export interface WalletBalanceUpdate {
  walletId: string;
  alias: string;
  available: string;
  marginUsed: string;
  total: string;
  isLow: boolean;
  timestamp: number;
}

export type BotEvent =
  | { type: 'price-update'; data: PriceUpdate }
  | { type: 'range-exit'; data: RangeExitEvent }
  | { type: 'range-return'; data: RangeReturnEvent }
  | { type: 'hedge-opened'; data: HedgeOpenedEvent }
  | { type: 'hedge-closed'; data: HedgeClosedEvent }
  | { type: 'range-trade-opened'; data: RangeTradeOpenedEvent }
  | { type: 'range-trade-closed'; data: RangeTradeClosedEvent }
  | { type: 'wallet-balance'; data: WalletBalanceUpdate };
