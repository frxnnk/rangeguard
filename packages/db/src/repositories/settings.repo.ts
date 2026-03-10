import type Database from 'better-sqlite3';

interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export class SettingsRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(key: string): string | undefined {
    const stmt = this.db.prepare('SELECT value FROM bot_settings WHERE key = ?');
    const row = stmt.get(key) as SettingRow | undefined;
    return row?.value;
  }

  set(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO bot_settings (key, value, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value);
  }

  getAll(): Record<string, string> {
    const stmt = this.db.prepare('SELECT key, value FROM bot_settings');
    const rows = stmt.all() as SettingRow[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  getMultiple(keys: string[]): Record<string, string> {
    if (keys.length === 0) return {};
    const placeholders = keys.map(() => '?').join(', ');
    const stmt = this.db.prepare(
      `SELECT key, value FROM bot_settings WHERE key IN (${placeholders})`,
    );
    const rows = stmt.all(...keys) as SettingRow[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
