import type Database from 'better-sqlite3';

export interface StopLossOrder {
  id: number;
  poolConfigId: string;
  walletId: string;
  walletType: 'protection' | 'profit';
  asset: string;
  hlOrderId: number;
  status: 'active' | 'cancelled' | 'triggered';
  createdAt: number;
  cancelledAt?: number;
}

interface StopLossRow {
  id: number;
  pool_config_id: string;
  wallet_id: string;
  wallet_type: string;
  asset: string;
  hl_order_id: number;
  status: string;
  created_at: number;
  cancelled_at: number | null;
}

function rowToStopLossOrder(row: StopLossRow): StopLossOrder {
  return {
    id: row.id,
    poolConfigId: row.pool_config_id,
    walletId: row.wallet_id,
    walletType: row.wallet_type as 'protection' | 'profit',
    asset: row.asset,
    hlOrderId: row.hl_order_id,
    status: row.status as 'active' | 'cancelled' | 'triggered',
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at ?? undefined,
  };
}

export class StopLossRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Record a new SL order */
  create(
    poolConfigId: string,
    walletId: string,
    walletType: 'protection' | 'profit',
    asset: string,
    hlOrderId: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO stop_loss_orders (pool_config_id, wallet_id, wallet_type, asset, hl_order_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `);
    stmt.run(poolConfigId, walletId, walletType, asset, hlOrderId, Date.now());
  }

  /** Find active SL orders for a pool + wallet type */
  findActive(poolConfigId: string, walletType: 'protection' | 'profit'): StopLossOrder[] {
    const stmt = this.db.prepare(
      "SELECT * FROM stop_loss_orders WHERE pool_config_id = ? AND wallet_type = ? AND status = 'active'",
    );
    const rows = stmt.all(poolConfigId, walletType) as StopLossRow[];
    return rows.map(rowToStopLossOrder);
  }

  /** Find all active SL orders (for orphan cleanup on startup) */
  findAllActive(): StopLossOrder[] {
    const stmt = this.db.prepare("SELECT * FROM stop_loss_orders WHERE status = 'active'");
    const rows = stmt.all() as StopLossRow[];
    return rows.map(rowToStopLossOrder);
  }

  /** Mark SL orders as cancelled */
  markCancelled(poolConfigId: string, walletType: 'protection' | 'profit'): number {
    const stmt = this.db.prepare(
      "UPDATE stop_loss_orders SET status = 'cancelled', cancelled_at = ? WHERE pool_config_id = ? AND wallet_type = ? AND status = 'active'",
    );
    const result = stmt.run(Date.now(), poolConfigId, walletType);
    return result.changes;
  }

  /** Mark specific SL orders by HL order IDs as cancelled */
  markCancelledByIds(hlOrderIds: number[]): number {
    if (hlOrderIds.length === 0) return 0;
    const placeholders = hlOrderIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `UPDATE stop_loss_orders SET status = 'cancelled', cancelled_at = ? WHERE hl_order_id IN (${placeholders}) AND status = 'active'`,
    );
    const result = stmt.run(Date.now(), ...hlOrderIds);
    return result.changes;
  }

  /** Mark SL orders as triggered (filled by exchange) */
  markTriggered(hlOrderIds: number[]): number {
    if (hlOrderIds.length === 0) return 0;
    const placeholders = hlOrderIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `UPDATE stop_loss_orders SET status = 'triggered' WHERE hl_order_id IN (${placeholders}) AND status = 'active'`,
    );
    const result = stmt.run(...hlOrderIds);
    return result.changes;
  }
}
