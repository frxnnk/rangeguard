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
