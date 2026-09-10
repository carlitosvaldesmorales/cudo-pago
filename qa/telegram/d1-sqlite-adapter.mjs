import { DatabaseSync } from 'node:sqlite';

export class D1SqliteAdapter {
  constructor(filename=':memory:') {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  exec(sql) {
    this.sqlite.exec(sql);
  }

  prepare(sql) {
    return new D1SqliteStatement(this, sql, []);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(stmt => stmt._runSync());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      try { this.sqlite.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

class D1SqliteStatement {
  constructor(adapter, sql, params) {
    this.adapter = adapter;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1SqliteStatement(this.adapter, this.sql, params);
  }

  async first() {
    const row = this.adapter.sqlite.prepare(this.sql).get(...this.params);
    return row ?? null;
  }

  async all() {
    const rows = this.adapter.sqlite.prepare(this.sql).all(...this.params);
    return { success: true, results: rows };
  }

  async run() {
    return this._runSync();
  }

  _runSync() {
    const info = this.adapter.sqlite.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0)
      }
    };
  }
}
