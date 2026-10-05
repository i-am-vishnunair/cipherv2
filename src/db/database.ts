// src/db/database.ts - Database initialization using sql.js (pure WASM SQLite)
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';

let _db: SqlJsDatabase | null = null;
let _dbPath: string = '';
let _saveTimer: ReturnType<typeof setInterval> | null = null;

export async function initDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;

  const config = getConfig();
  _dbPath = resolve(process.cwd(), config.dbPath);
  const dir = dirname(_dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const log = getLogger('db');
  log.info(`Opening database at ${_dbPath}`);

  const SQL = await initSqlJs();

  if (existsSync(_dbPath)) {
    const buf = readFileSync(_dbPath);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  // Enable WAL-like settings (sql.js runs in-memory with file persistence)
  _db.run('PRAGMA foreign_keys = ON;');

  // Run schema
  const schemaPath = resolve(process.cwd(), 'schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf-8');
    const statements = schema.split(';').filter(s => {
      const trimmed = s.trim();
      return trimmed && !trimmed.startsWith('PRAGMA');
    });
    for (const stmt of statements) {
      try {
        _db.run(stmt + ';');
      } catch (err: any) {
        if (!err.message?.includes('already exists')) {
          log.warn({ err: err.message }, 'Schema statement warning');
        }
      }
    }
    log.info('Database schema initialized');
  }

  // Auto-save to disk periodically
  _saveTimer = setInterval(() => saveDb(), 5000);

  return _db;
}

export function getDb(): SqlJsDatabase {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.');
  return _db;
}

export function saveDb(): void {
  if (_db && _dbPath) {
    const data = _db.export();
    const buffer = Buffer.from(data);
    writeFileSync(_dbPath, buffer);
  }
}

export function closeDb(): void {
  if (_saveTimer) {
    clearInterval(_saveTimer);
    _saveTimer = null;
  }
  if (_db) {
    saveDb();
    _db.close();
    _db = null;
  }
}

// Helper: run queries and return results as objects
export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params);
  return results[0];
}

export function runSql(sql: string, params: any[] = []): { changes: number; lastId: number } {
  const db = getDb();
  db.run(sql, params);
  const changesRow = queryOne<any>('SELECT changes() as changes, last_insert_rowid() as lastId');
  return { changes: changesRow?.changes ?? 0, lastId: changesRow?.lastId ?? 0 };
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.run('BEGIN TRANSACTION;');
  try {
    const result = fn();
    db.run('COMMIT;');
    return result;
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }
}
