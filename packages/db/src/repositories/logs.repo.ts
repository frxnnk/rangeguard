import type Database from 'better-sqlite3';

export interface LogEntry {
  id: number;
  level: string;
  name: string;
  msg: string;
  data?: string;
  createdAt: number;
}

interface LogRow {
  id: number;
  level: string;
  name: string;
  msg: string;
  data: string | null;
  created_at: number;
}

function rowToLogEntry(row: LogRow): LogEntry {
  return {
    id: row.id,
    level: row.level,
    name: row.name,
    msg: row.msg,
    data: row.data ?? undefined,
    createdAt: row.created_at,
  };
}

export class LogsRepository {
  private db: Database.Database;
  private insertStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;
    this.insertStmt = db.prepare(`
      INSERT INTO bot_logs (level, name, msg, data, created_at)
      VALUES (@level, @name, @msg, @data, @createdAt)
    `);
  }

  insert(level: string, name: string, msg: string, data?: string): void {
    this.insertStmt.run({ level, name, msg, data: data ?? null, createdAt: Date.now() });
  }

  findRecent(limit: number, level?: string): LogEntry[] {
    if (level) {
      const stmt = this.db.prepare(
        'SELECT * FROM bot_logs WHERE level = ? ORDER BY created_at DESC LIMIT ?',
      );
      return (stmt.all(level, limit) as LogRow[]).map(rowToLogEntry);
    }
    const stmt = this.db.prepare('SELECT * FROM bot_logs ORDER BY created_at DESC LIMIT ?');
    return (stmt.all(limit) as LogRow[]).map(rowToLogEntry);
  }

  cleanup(olderThanMs: number): number {
    const stmt = this.db.prepare('DELETE FROM bot_logs WHERE created_at < ?');
    return stmt.run(olderThanMs).changes;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM bot_logs').get() as { cnt: number };
    return row.cnt;
  }
}
