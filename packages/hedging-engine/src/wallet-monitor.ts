import { createLogger } from '@trading-bot/common';
import type { WalletBalance, Wallet } from '@trading-bot/common';
import type { WalletsRepository } from '@trading-bot/db';
import type { HyperliquidClient } from './hyperliquid-client.js';

const logger = createLogger('wallet-monitor');

export class WalletMonitor {
  private hlClient: HyperliquidClient;
  private walletsRepo: WalletsRepository;
  private intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private onLowBalance?: (wallet: Wallet, balance: WalletBalance) => void;

  constructor(
    hlClient: HyperliquidClient,
    walletsRepo: WalletsRepository,
    intervalMs: number = 30000,
    onLowBalance?: (wallet: Wallet, balance: WalletBalance) => void,
  ) {
    this.hlClient = hlClient;
    this.walletsRepo = walletsRepo;
    this.intervalMs = intervalMs;
    this.onLowBalance = onLowBalance;
  }

  /** Start monitoring all wallets */
  start(): void {
    if (this.timer) return;

    // Initial check
    this.checkAll();

    this.timer = setInterval(() => this.checkAll(), this.intervalMs);
    logger.info({ intervalMs: this.intervalMs }, 'Wallet monitor started');
  }

  /** Stop monitoring */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    logger.info('Wallet monitor stopped');
  }

  /** Check balances of all registered wallets */
  async checkAll(): Promise<void> {
    const wallets = this.walletsRepo.findAll();

    for (const wallet of wallets) {
      if (!this.hlClient.hasWallet(wallet.id)) continue;

      try {
        const accountBalance = await this.hlClient.getBalance(wallet.id);
        const balance: WalletBalance = {
          available: accountBalance.available,
          marginUsed: accountBalance.marginUsed,
          total: accountBalance.total,
          isLow: parseFloat(accountBalance.available) < parseFloat(wallet.lowBalanceThreshold),
        };

        this.walletsRepo.updateBalance(wallet.id, balance);

        if (balance.isLow) {
          logger.warn(
            {
              walletId: wallet.id,
              alias: wallet.alias,
              available: balance.available,
              threshold: wallet.lowBalanceThreshold,
            },
            'Low wallet balance',
          );

          this.onLowBalance?.(wallet, balance);
        }
      } catch (error) {
        logger.error({ walletId: wallet.id, error }, 'Failed to check wallet balance');
      }
    }
  }

  /** Check a single wallet balance */
  async checkOne(walletId: string): Promise<WalletBalance | null> {
    const wallet = this.walletsRepo.findById(walletId);
    if (!wallet || !this.hlClient.hasWallet(walletId)) return null;

    try {
      const accountBalance = await this.hlClient.getBalance(walletId);
      const balance: WalletBalance = {
        available: accountBalance.available,
        marginUsed: accountBalance.marginUsed,
        total: accountBalance.total,
        isLow: parseFloat(accountBalance.available) < parseFloat(wallet.lowBalanceThreshold),
      };

      this.walletsRepo.updateBalance(walletId, balance);
      return balance;
    } catch (error) {
      logger.error({ walletId, error }, 'Failed to check wallet balance');
      return null;
    }
  }
}
