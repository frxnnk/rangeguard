import type Database from 'better-sqlite3';
import { v4 } from 'uuid';
import type { HedgeTrade, WalletType, HedgeSide, CloseReason } from '@trading-bot/common';

interface HedgeTradeRow {
  id: string;
  pool_config_id: string;
  wallet_id: string;
  wallet_type: string;
  asset: string;
  side: string;
  size: string;
  entry_price: string;
  leverage: number;
  status: string;
  exit_price: string | null;
  realized_pnl: string | null;
  fees: string;
  is_false_breakout: number;
  hl_order_id: string | null;
  opened_at: number;
  closed_at: number | null;
  close_reason: string | null;
}

interface CreateHedgeTrade {
  poolConfigId: string;
  walletId: string;
  walletType: WalletType;
  asset: string;
  side: HedgeSide;
  size: string;
  entryPrice: string;
  leverage: number;
  fees?: string;
  hlOrderId?: string;
}

function rowToHedgeTrade(row: HedgeTradeRow): HedgeTrade {
  return {
    id: row.id,
    poolConfigId: row.pool_config_id,
    walletId: row.wallet_id,
    walletType: row.wallet_type as WalletType,
    asset: row.asset,
    side: row.side as HedgeSide,
    size: row.size,
    entryPrice: row.entry_price,
    leverage: row.leverage,
    status: row.status as HedgeTrade['status'],
    exitPrice: row.exit_price ?? undefined,
    realizedPnl: row.realized_pnl ?? undefined,
    fees: row.fees,
    isFalseBreakout: row.is_false_breakout === 1,
    hlOrderId: row.hl_order_id ?? undefined,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    closeReason: (row.close_reason as CloseReason) ?? undefined,
  };
}

export class HedgesRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(data: CreateHedgeTrade): HedgeTrade {
    const id = v4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO hedge_trades (
        id, pool_config_id, wallet_id, wallet_type, asset, side,
        size, entry_price, leverage, status, fees, hl_order_id, opened_at
      ) VALUES (
        @id, @poolConfigId, @walletId, @walletType, @asset, @side,
        @size, @entryPrice, @leverage, @status, @fees, @hlOrderId, @openedAt
      )
    `);

    stmt.run({
      id,
      poolConfigId: data.poolConfigId,
      walletId: data.walletId,
      walletType: data.walletType,
      asset: data.asset,
      side: data.side,
      size: data.size,
      entryPrice: data.entryPrice,
      leverage: data.leverage,
      status: 'open',
      fees: data.fees ?? '0',
      hlOrderId: data.hlOrderId ?? null,
      openedAt: now,
    });

    return this.findById(id)!;
  }

  findById(id: string): HedgeTrade | undefined {
    const stmt = this.db.prepare('SELECT * FROM hedge_trades WHERE id = ?');
    const row = stmt.get(id) as HedgeTradeRow | undefined;
    return row ? rowToHedgeTrade(row) : undefined;
  }

  findOpen(): HedgeTrade[] {
    const stmt = this.db.prepare(
      "SELECT * FROM hedge_trades WHERE status = 'open' ORDER BY opened_at DESC",
    );
    const rows = stmt.all() as HedgeTradeRow[];
    return rows.map(rowToHedgeTrade);
  }

  findByPool(poolConfigId: string): HedgeTrade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM hedge_trades WHERE pool_config_id = ? ORDER BY opened_at DESC',
    );
    const rows = stmt.all(poolConfigId) as HedgeTradeRow[];
    return rows.map(rowToHedgeTrade);
  }

  findOpenByWallet(walletId: string): HedgeTrade[] {
    const stmt = this.db.prepare(
      "SELECT * FROM hedge_trades WHERE wallet_id = ? AND status = 'open' ORDER BY opened_at DESC",
    );
    const rows = stmt.all(walletId) as HedgeTradeRow[];
    return rows.map(rowToHedgeTrade);
  }

  findOpenByPool(poolConfigId: string): HedgeTrade[] {
    const stmt = this.db.prepare(
      "SELECT * FROM hedge_trades WHERE pool_config_id = ? AND status = 'open' ORDER BY opened_at DESC",
    );
    const rows = stmt.all(poolConfigId) as HedgeTradeRow[];
    return rows.map(rowToHedgeTrade);
  }

  close(
    id: string,
    exitPrice: string,
    realizedPnl: string,
    closeReason: CloseReason,
    isFalseBreakout: boolean,
    closeFees?: string,
  ): void {
    const now = Date.now();
    const status = closeReason === 'liquidated' ? 'liquidated' : 'closed';

    const stmt = this.db.prepare(`
      UPDATE hedge_trades SET
        status = ?,
        exit_price = ?,
        realized_pnl = ?,
        close_reason = ?,
        is_false_breakout = ?,
        closed_at = ?,
        fees = CAST(CAST(fees AS REAL) + ? AS TEXT)
      WHERE id = ?
    `);

    stmt.run(
      status,
      exitPrice,
      realizedPnl,
      closeReason,
      isFalseBreakout ? 1 : 0,
      now,
      parseFloat(closeFees ?? '0'),
      id,
    );
  }

  findHistory(limit: number, offset: number): HedgeTrade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM hedge_trades ORDER BY opened_at DESC LIMIT ? OFFSET ?',
    );
    const rows = stmt.all(limit, offset) as HedgeTradeRow[];
    return rows.map(rowToHedgeTrade);
  }

  countFalseBreakouts(): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM hedge_trades WHERE is_false_breakout = 1',
    );
    const result = stmt.get() as { count: number };
    return result.count;
  }

  sumRealizedPnl(): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(CAST(realized_pnl AS REAL)), 0) as total
      FROM hedge_trades
      WHERE status IN ('closed', 'liquidated')
      AND realized_pnl IS NOT NULL
    `);
    const result = stmt.get() as { total: number };
    return result.total;
  }
}
