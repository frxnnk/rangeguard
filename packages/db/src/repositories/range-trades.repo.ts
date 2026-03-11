import type Database from 'better-sqlite3';
import { v4 } from 'uuid';
import type {
  RangeTrade,
  CreateRangeTrade,
  RangeTradeCloseReason,
  HedgeSide,
} from '@trading-bot/common';

interface RangeTradeRow {
  id: string;
  pool_config_id: string;
  wallet_id: string;
  asset: string;
  side: string;
  size: string;
  entry_price: string;
  leverage: number;
  status: string;
  exit_price: string | null;
  realized_pnl: string | null;
  fees: string;
  stop_loss_price: string;
  trailing_percent: number;
  peak_price: string | null;
  current_stop_price: string | null;
  hl_order_id: string | null;
  opened_at: number;
  closed_at: number | null;
  close_reason: string | null;
}

function rowToRangeTrade(row: RangeTradeRow): RangeTrade {
  return {
    id: row.id,
    poolConfigId: row.pool_config_id,
    walletId: row.wallet_id,
    asset: row.asset,
    side: row.side as HedgeSide,
    size: row.size,
    entryPrice: row.entry_price,
    leverage: row.leverage,
    status: row.status as RangeTrade['status'],
    exitPrice: row.exit_price ?? undefined,
    realizedPnl: row.realized_pnl ?? undefined,
    fees: row.fees,
    stopLossPrice: row.stop_loss_price,
    trailingPercent: row.trailing_percent,
    peakPrice: row.peak_price ?? undefined,
    currentStopPrice: row.current_stop_price ?? undefined,
    hlOrderId: row.hl_order_id ?? undefined,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    closeReason: (row.close_reason as RangeTradeCloseReason) ?? undefined,
  };
}

export class RangeTradesRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(data: CreateRangeTrade): RangeTrade {
    const id = v4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO range_trades (
        id, pool_config_id, wallet_id, asset, side,
        size, entry_price, leverage, status, fees,
        stop_loss_price, trailing_percent, peak_price, current_stop_price,
        hl_order_id, opened_at
      ) VALUES (
        @id, @poolConfigId, @walletId, @asset, @side,
        @size, @entryPrice, @leverage, @status, @fees,
        @stopLossPrice, @trailingPercent, @peakPrice, @currentStopPrice,
        @hlOrderId, @openedAt
      )
    `);

    stmt.run({
      id,
      poolConfigId: data.poolConfigId,
      walletId: data.walletId,
      asset: data.asset,
      side: data.side,
      size: data.size,
      entryPrice: data.entryPrice,
      leverage: data.leverage,
      status: 'open',
      fees: data.fees ?? '0',
      stopLossPrice: data.stopLossPrice,
      trailingPercent: data.trailingPercent,
      peakPrice: data.entryPrice,
      currentStopPrice: data.stopLossPrice,
      hlOrderId: data.hlOrderId ?? null,
      openedAt: now,
    });

    return this.findById(id)!;
  }

  findById(id: string): RangeTrade | undefined {
    const stmt = this.db.prepare('SELECT * FROM range_trades WHERE id = ?');
    const row = stmt.get(id) as RangeTradeRow | undefined;
    return row ? rowToRangeTrade(row) : undefined;
  }

  findOpen(): RangeTrade[] {
    const stmt = this.db.prepare(
      "SELECT * FROM range_trades WHERE status = 'open' ORDER BY opened_at DESC",
    );
    const rows = stmt.all() as RangeTradeRow[];
    return rows.map(rowToRangeTrade);
  }

  findOpenByPool(poolConfigId: string): RangeTrade[] {
    const stmt = this.db.prepare(
      "SELECT * FROM range_trades WHERE pool_config_id = ? AND status = 'open' ORDER BY opened_at DESC",
    );
    const rows = stmt.all(poolConfigId) as RangeTradeRow[];
    return rows.map(rowToRangeTrade);
  }

  findByPool(poolConfigId: string): RangeTrade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM range_trades WHERE pool_config_id = ? ORDER BY opened_at DESC',
    );
    const rows = stmt.all(poolConfigId) as RangeTradeRow[];
    return rows.map(rowToRangeTrade);
  }

  /** Update trailing stop state (peak price + current stop) */
  updateTrailingStop(id: string, peakPrice: string, currentStopPrice: string): void {
    const stmt = this.db.prepare(
      'UPDATE range_trades SET peak_price = ?, current_stop_price = ? WHERE id = ?',
    );
    stmt.run(peakPrice, currentStopPrice, id);
  }

  close(
    id: string,
    exitPrice: string,
    realizedPnl: string,
    closeReason: RangeTradeCloseReason,
    closeFees?: string,
  ): void {
    const now = Date.now();
    const status =
      closeReason === 'liquidated'
        ? 'liquidated'
        : closeReason === 'stop_loss'
          ? 'stopped'
          : 'closed';

    const stmt = this.db.prepare(`
      UPDATE range_trades SET
        status = ?,
        exit_price = ?,
        realized_pnl = ?,
        close_reason = ?,
        closed_at = ?,
        fees = CAST(CAST(fees AS REAL) + ? AS TEXT)
      WHERE id = ?
    `);

    stmt.run(status, exitPrice, realizedPnl, closeReason, now, parseFloat(closeFees ?? '0'), id);
  }

  findHistory(limit: number, offset: number): RangeTrade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM range_trades ORDER BY opened_at DESC LIMIT ? OFFSET ?',
    );
    const rows = stmt.all(limit, offset) as RangeTradeRow[];
    return rows.map(rowToRangeTrade);
  }

  statsByPool(poolConfigId: string): {
    totalTrades: number;
    totalPnl: number;
    totalFees: number;
    wins: number;
    losses: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalTrades,
        COALESCE(SUM(CASE WHEN status IN ('closed','stopped','liquidated') AND realized_pnl IS NOT NULL THEN CAST(realized_pnl AS REAL) ELSE 0 END), 0) as totalPnl,
        COALESCE(SUM(CAST(fees AS REAL)), 0) as totalFees,
        COALESCE(SUM(CASE WHEN status IN ('closed','stopped','liquidated') AND realized_pnl IS NOT NULL AND CAST(realized_pnl AS REAL) >= 0 THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN status IN ('closed','stopped','liquidated') AND realized_pnl IS NOT NULL AND CAST(realized_pnl AS REAL) < 0 THEN 1 ELSE 0 END), 0) as losses
      FROM range_trades
      WHERE pool_config_id = ?
    `);
    const row = stmt.get(poolConfigId) as {
      totalTrades: number;
      totalPnl: number;
      totalFees: number;
      wins: number;
      losses: number;
    };
    return row;
  }

  deleteHistoryByPool(poolConfigId: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM range_trades
      WHERE pool_config_id = ? AND status IN ('closed', 'stopped', 'liquidated')
    `);
    const result = stmt.run(poolConfigId);
    return result.changes;
  }

  deleteAllHistory(): number {
    const stmt = this.db.prepare(`
      DELETE FROM range_trades
      WHERE status IN ('closed', 'stopped', 'liquidated')
    `);
    const result = stmt.run();
    return result.changes;
  }
}
