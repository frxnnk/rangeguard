import type Database from 'better-sqlite3';
import { v4 } from 'uuid';
import type { Wallet, CreateWallet, WalletRole, WalletBalance } from '@trading-bot/common';

interface WalletRow {
  id: string;
  alias: string;
  address: string;
  wallet_type: string;
  balance_available: string | null;
  balance_margin_used: string | null;
  balance_total: string | null;
  low_balance_threshold: string;
  last_balance_check: number | null;
  created_at: number;
}

function rowToWallet(row: WalletRow): Wallet {
  return {
    id: row.id,
    alias: row.alias,
    address: row.address,
    walletType: row.wallet_type as WalletRole,
    balanceAvailable: row.balance_available ?? undefined,
    balanceMarginUsed: row.balance_margin_used ?? undefined,
    balanceTotal: row.balance_total ?? undefined,
    lowBalanceThreshold: row.low_balance_threshold,
    lastBalanceCheck: row.last_balance_check ?? undefined,
    createdAt: row.created_at,
  };
}

export class WalletsRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(data: CreateWallet): Wallet {
    const id = v4();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO wallets (
        id, alias, address, wallet_type, low_balance_threshold, created_at
      ) VALUES (
        @id, @alias, @address, @walletType, @lowBalanceThreshold, @createdAt
      )
    `);

    stmt.run({
      id,
      alias: data.alias,
      address: data.address,
      walletType: data.walletType,
      lowBalanceThreshold: data.lowBalanceThreshold ?? '100',
      createdAt: now,
    });

    return this.findById(id)!;
  }

  findById(id: string): Wallet | undefined {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE id = ?');
    const row = stmt.get(id) as WalletRow | undefined;
    return row ? rowToWallet(row) : undefined;
  }

  findByAlias(alias: string): Wallet | undefined {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE alias = ?');
    const row = stmt.get(alias) as WalletRow | undefined;
    return row ? rowToWallet(row) : undefined;
  }

  findAll(): Wallet[] {
    const stmt = this.db.prepare('SELECT * FROM wallets ORDER BY created_at DESC');
    const rows = stmt.all() as WalletRow[];
    return rows.map(rowToWallet);
  }

  findByType(type: WalletRole): Wallet[] {
    const stmt = this.db.prepare(
      'SELECT * FROM wallets WHERE wallet_type = ? ORDER BY created_at DESC',
    );
    const rows = stmt.all(type) as WalletRow[];
    return rows.map(rowToWallet);
  }

  findProfitWallet(): Wallet | undefined {
    const stmt = this.db.prepare("SELECT * FROM wallets WHERE wallet_type = 'profit' LIMIT 1");
    const row = stmt.get() as WalletRow | undefined;
    return row ? rowToWallet(row) : undefined;
  }

  updateBalance(id: string, balance: WalletBalance): void {
    const stmt = this.db.prepare(`
      UPDATE wallets SET
        balance_available = ?,
        balance_margin_used = ?,
        balance_total = ?,
        last_balance_check = ?
      WHERE id = ?
    `);
    stmt.run(balance.available, balance.marginUsed, balance.total, Date.now(), id);
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM wallets WHERE id = ?');
    stmt.run(id);
  }
}
