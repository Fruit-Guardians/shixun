import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

type SqlValue = string | number | bigint | null | Uint8Array;

class Statement {
  readonly sql: string;
  values: SqlValue[] = [];
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...values: SqlValue[]) {
    this.values = values;
    return this;
  }
  async first() {
    return (this.db.prepare(this.sql).get(...this.values) as Record<string, unknown> | undefined) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.values) as Record<string, unknown>[], success: true, meta: {} };
  }
  async run() {
    this.db.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: {} };
  }
}

/** 用 node:sqlite 实现的最小 D1：真实 SQL、真实迁移，仅用于测试。 */
export function createTestD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const migrations = new URL('../../../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  return {
    raw: db,
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database & { raw: DatabaseSync };
}
