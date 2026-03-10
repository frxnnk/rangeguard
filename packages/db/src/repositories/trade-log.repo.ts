import type Database from 'better-sqlite3';
import { v4 } from 'uuid';
import type { TradeLogEntry } from '@trading-bot/common';

interface TradeLogRow {
  id: string;
  hedge_trade_id: string | null;
  wallet_id: string | null;
  action: string;
  request_payload: string | null;
  response_payload: string | null;
  success: number;
  error_message: string | null;
  latency_ms: number | null;
  created_at: number;
}

interface CreateTradeLog {
  hedgeTradeId?: string;
  walletId?: string;
  action: string;
  requestPayload?: string;
  responsePayload?: string;
  success: boolean;
  errorMessage?: string;
  latencyMs?: number;
}

function rowToTradeLogEntry(row: TradeLogRow): TradeLogEntry {
  return {
    id: row.id,
    hedgeTradeId: row.hedge_trade_id ?? undefined,
    walletId: row.wallet_id ?? undefined,
    action: row.action,
    requestPayload: row.request_payload ?? undefined,
    responsePayload: row.response_payload ?? undefined,
    success: row.success === 1,
    errorMessage: row.error_message ?? undefined,
    latencyMs: row.latency_ms ?? undefined,
    createdAt: row.created_at,
  };
}

export class TradeLogRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(data: CreateTradeLog): TradeLogEntry {
    const id = v4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO trade_log (
        id, hedge_trade_id, wallet_id, action, request_payload,
        response_payload, success, error_message, latency_ms, created_at
      ) VALUES (
        @id, @hedgeTradeId, @walletId, @action, @requestPayload,
        @responsePayload, @success, @errorMessage, @latencyMs, @createdAt
      )
    `);

    stmt.run({
      id,
      hedgeTradeId: data.hedgeTradeId ?? null,
      walletId: data.walletId ?? null,
      action: data.action,
      requestPayload: data.requestPayload ?? null,
      responsePayload: data.responsePayload ?? null,
      success: data.success ? 1 : 0,
      errorMessage: data.errorMessage ?? null,
      latencyMs: data.latencyMs ?? null,
      createdAt: now,
    });

    const row = this.db.prepare('SELECT * FROM trade_log WHERE id = ?').get(id) as TradeLogRow;

    return rowToTradeLogEntry(row);
  }

  findByHedge(hedgeTradeId: string): TradeLogEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM trade_log WHERE hedge_trade_id = ? ORDER BY created_at DESC',
    );
    const rows = stmt.all(hedgeTradeId) as TradeLogRow[];
    return rows.map(rowToTradeLogEntry);
  }

  findRecent(limit: number): TradeLogEntry[] {
    const stmt = this.db.prepare('SELECT * FROM trade_log ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as TradeLogRow[];
    return rows.map(rowToTradeLogEntry);
  }
}
