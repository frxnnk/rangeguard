import { createLogger } from '@trading-bot/common';
import type { WalletBalance, Wallet } from '@trading-bot/common';
import type { WalletsRepository, HedgesRepository, PnlRepository } from '@trading-bot/db';
import type { HyperliquidClient } from './hyperliquid-client.js';
import type { PositionInfo } from './hyperliquid-client.js';

const logger = createLogger('wallet-monitor');

export interface LiquidationEvent {
  walletId: string;
  hedgeTradeId: string;
  asset: string;
}

export class WalletMonitor {
  private hlClient: HyperliquidClient;
  private walletsRepo: WalletsRepository;
  private hedgesRepo?: HedgesRepository;
  private pnlRepo?: PnlRepository;
  private intervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private onLowBalance?: (wallet: Wallet, balance: WalletBalance) => void;
  private onLiquidation?: (event: LiquidationEvent) => void;
  private lastSnapshotAt: Map<string, number> = new Map(); // poolConfigId -> timestamp

  constructor(
    hlClient: HyperliquidClient,
    walletsRepo: WalletsRepository,
    intervalMs: number = 30000,
    onLowBalance?: (wallet: Wallet, balance: WalletBalance) => void,
    hedgesRepo?: HedgesRepository,
    onLiquidation?: (event: LiquidationEvent) => void,
    pnlRepo?: PnlRepository,
  ) {
    this.hlClient = hlClient;
    this.walletsRepo = walletsRepo;
    this.intervalMs = intervalMs;
    this.onLowBalance = onLowBalance;
    this.hedgesRepo = hedgesRepo;
    this.onLiquidation = onLiquidation;
    this.pnlRepo = pnlRepo;
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

        // Check liquidations + snapshot unrealized PnL (fetches positions once)
        if (this.hedgesRepo) {
          const openHedges = this.hedgesRepo.findOpenByWallet(wallet.id);
          if (openHedges.length > 0) {
            let positions: PositionInfo[] | undefined;
            try {
              positions = await this.hlClient.getPositions(wallet.id);
            } catch {
              // Can't check — skip this round
            }

            if (positions) {
              if (this.onLiquidation) {
                this.checkLiquidations(wallet.id, openHedges, positions);
              }
              this.snapshotUnrealizedPnl(openHedges, positions);
            }
          }
        }
      } catch (error) {
        logger.error({ walletId: wallet.id, error }, 'Failed to check wallet balance');
      }
    }
  }

  /** Check if any open hedges for this wallet have been liquidated on HL */
  private checkLiquidations(
    walletId: string,
    openHedges: { id: string; asset: string }[],
    positions: PositionInfo[],
  ): void {
    if (!this.onLiquidation) return;

    const positionAssets = new Set(
      positions.filter((p) => parseFloat(p.size) !== 0).map((p) => p.asset),
    );

    for (const hedge of openHedges) {
      if (!positionAssets.has(hedge.asset)) {
        logger.warn(
          { walletId, hedgeTradeId: hedge.id, asset: hedge.asset },
          'Liquidation detected — position missing from HL',
        );
        this.onLiquidation({ walletId, hedgeTradeId: hedge.id, asset: hedge.asset });
      }
    }
  }

  /** Snapshot unrealized PnL for open hedges (throttled to 1 per pool per 60s) */
  private snapshotUnrealizedPnl(
    openHedges: { poolConfigId: string; walletType: string; asset: string; fees: string }[],
    positions: PositionInfo[],
  ): void {
    if (!this.pnlRepo) return;

    const now = Date.now();

    for (const hedge of openHedges) {
      // Throttle: 1 snapshot per pool per 60s
      const lastAt = this.lastSnapshotAt.get(hedge.poolConfigId) ?? 0;
      if (now - lastAt < 60_000) continue;

      const position = positions.find((p) => p.asset === hedge.asset);
      if (!position) continue;

      this.pnlRepo.createSnapshot(
        hedge.poolConfigId,
        hedge.walletType,
        position.unrealizedPnl,
        hedge.fees,
        '0', // assetPrice — current price tracked separately in price_cache
      );

      this.lastSnapshotAt.set(hedge.poolConfigId, now);
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
