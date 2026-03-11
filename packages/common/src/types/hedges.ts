export type HedgeSide = 'short' | 'long';
export type HedgeStatus = 'open' | 'closed' | 'liquidated';
export type WalletType = 'protection' | 'profit';
export type CloseReason = 'range_return' | 'manual' | 'liquidated';

export interface HedgeTrade {
  id: string;
  poolConfigId: string;
  walletId: string;
  walletType: WalletType;
  asset: string;
  side: HedgeSide;
  size: string;
  entryPrice: string;
  leverage: number;
  status: HedgeStatus;
  exitPrice?: string;
  realizedPnl?: string;
  fees: string;
  isFalseBreakout: boolean;
  hlOrderId?: string;
  openedAt: number;
  closedAt?: number;
  closeReason?: CloseReason;
}

// Range trading types (R10)
export type RangeTradeStatus = 'open' | 'closed' | 'stopped' | 'liquidated';
export type RangeTradeCloseReason =
  | 'trailing_stop'
  | 'stop_loss'
  | 'hedge_priority'
  | 'manual'
  | 'liquidated';

export interface RangeTrade {
  id: string;
  poolConfigId: string;
  walletId: string;
  asset: string;
  side: HedgeSide;
  size: string;
  entryPrice: string;
  leverage: number;
  status: RangeTradeStatus;
  exitPrice?: string;
  realizedPnl?: string;
  fees: string;
  stopLossPrice: string;
  trailingPercent: number;
  peakPrice?: string;
  currentStopPrice?: string;
  hlOrderId?: string;
  openedAt: number;
  closedAt?: number;
  closeReason?: RangeTradeCloseReason;
}

export interface CreateRangeTrade {
  poolConfigId: string;
  walletId: string;
  asset: string;
  side: HedgeSide;
  size: string;
  entryPrice: string;
  leverage: number;
  stopLossPrice: string;
  trailingPercent: number;
  fees?: string;
  hlOrderId?: string;
}

export interface TradeLogEntry {
  id: string;
  hedgeTradeId?: string;
  walletId?: string;
  action: string;
  requestPayload?: string;
  responsePayload?: string;
  success: boolean;
  errorMessage?: string;
  latencyMs?: number;
  createdAt: number;
}
