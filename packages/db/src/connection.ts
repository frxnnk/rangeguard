import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

let db: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const finalPath = dbPath ?? process.env.DB_PATH ?? './data/bot.db';
  const resolvedPath = resolve(finalPath);

  // Ensure directory exists
  mkdirSync(resolve(resolvedPath, '..'), { recursive: true });

  db = new Database(resolvedPath);

  // Enable WAL mode for concurrent reads
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 10000');
  db.pragma('temp_store = MEMORY');

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
