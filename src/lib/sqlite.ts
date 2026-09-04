import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import sqlWasm from "sql.js/dist/sql-wasm.wasm?url";

let sqlPromise: Promise<SqlJsStatic> | null = null;
let wasmLocator: ((file: string) => string) | null = null;

export function setWasmLocator(locator: (file: string) => string): void {
  wasmLocator = locator;
  sqlPromise = null;
}

export function wasmUrl(file = "sql-wasm.wasm"): string {
  if (wasmLocator) return wasmLocator(file);
  if (typeof window === "undefined") {
    return `file://${process.cwd()}/node_modules/sql.js/dist/${file}`;
  }
  if (sqlWasm.startsWith("http") || sqlWasm.startsWith("file:") || sqlWasm.startsWith("data:")) {
    return sqlWasm;
  }
  return new URL(sqlWasm, window.location.href).href;
}

export async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file: string) => (file.endsWith(".wasm") ? wasmUrl(file) : file),
    });
  }
  return sqlPromise;
}

export async function openAdb(bytes: Uint8Array): Promise<Database> {
  const SQL = await getSql();
  return new SQL.Database(bytes);
}

export async function createMemoryDb(): Promise<Database> {
  const SQL = await getSql();
  return new SQL.Database();
}

export function listUserTables(db: Database): string[] {
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const names: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name?: string };
    if (row.name) names.push(row.name);
  }
  stmt.free();
  return names;
}

export function tableInfo(db: Database, table: string): Array<{ name: string; type: string }> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new Error(`허용되지 않는 테이블 이름: ${table}`);
  }
  const stmt = db.prepare(`PRAGMA table_info("${table}")`);
  const cols: Array<{ name: string; type: string }> = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name?: string; type?: string };
    if (row.name) cols.push({ name: row.name, type: row.type ?? "" });
  }
  stmt.free();
  return cols;
}

export function* iterateRows(db: Database, table: string): Generator<Record<string, unknown>> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new Error(`허용되지 않는 테이블 이름: ${table}`);
  }
  const stmt = db.prepare(`SELECT * FROM "${table}"`);
  try {
    while (stmt.step()) {
      yield stmt.getAsObject() as Record<string, unknown>;
    }
  } finally {
    stmt.free();
  }
}

export function selectAll(db: Database, table: string): Record<string, unknown>[] {
  return Array.from(iterateRows(db, table));
}

export function countRows(db: Database, table: string): number {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new Error(`허용되지 않는 테이블 이름: ${table}`);
  }
  const stmt = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`);
  stmt.step();
  const n = Number((stmt.getAsObject() as { n?: number }).n ?? 0);
  stmt.free();
  return n;
}
