export type WalletRole = 'protection' | 'profit';

export interface Wallet {
  id: string;
  alias: string;
  address: string;
  walletType: WalletRole;
  balanceAvailable?: string;
  balanceMarginUsed?: string;
  balanceTotal?: string;
  lowBalanceThreshold: string;
  lastBalanceCheck?: number;
  createdAt: number;
}

export interface WalletBalance {
  available: string;
  marginUsed: string;
  total: string;
  isLow: boolean;
}

export interface CreateWallet {
  alias: string;
  address: string;
  walletType: WalletRole;
  lowBalanceThreshold?: string;
}
