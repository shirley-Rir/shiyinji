import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";

type BoundStatement = {
  bind(...values: unknown[]): BoundStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
};

class NodeD1Statement implements BoundStatement {
  constructor(
    private readonly statement: StatementSync,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new NodeD1Statement(this.statement, values as SQLInputValue[]);
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.statement.get(...this.values) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return result(this.statement.all(...this.values) as T[]);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const changes = this.statement.run(...this.values);
    return result<T>([], Number(changes.changes), Number(changes.lastInsertRowid));
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const columns = this.statement.columns().map((column) => column.name);
    const rows = this.statement.all(...this.values) as Array<Record<string, unknown>>;
    return rows.map((row) => columns.map((column) => row[column]) as T);
  }
}

class NodeD1Database {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  }

  prepare(query: string): BoundStatement {
    return new NodeD1Statement(this.database.prepare(query));
  }

  async batch<T = unknown>(statements: BoundStatement[]): Promise<Array<D1Result<T>>> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results: Array<D1Result<T>> = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query: string) {
    this.database.exec(query);
    return { count: 1, duration: 0 };
  }
}

function result<T>(results: T[], changes = 0, lastRowId = 0): D1Result<T> {
  return {
    success: true,
    results,
    meta: {
      changed_db: changes > 0,
      changes,
      duration: 0,
      last_row_id: lastRowId,
      rows_read: results.length,
      rows_written: changes,
      size_after: 0,
    },
  };
}

const databasePath = process.env.SQLITE_DATABASE_PATH;
export const env = {
  ...process.env,
  DB: databasePath ? new NodeD1Database(databasePath) : undefined,
} as unknown as Cloudflare.Env;

// Vinext's generated type bridge imports these Worker base classes even when
// the application does not define RPC, Durable Objects, or Workflows.
export class WorkerEntrypoint {}
export class DurableObject {}
export class WorkflowEntrypoint {}
