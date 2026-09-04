import type { Database, SqlValue } from "sql.js";
import { parseCsv } from "./csv";
import { ingestAdbRow, ingestCsvRow, type CanonicalRow } from "./ingest";
import { tableNameToLogType } from "./classify";
import {
  createMemoryDb,
  iterateRows,
  listUserTables,
  openAdb,
} from "./sqlite";
import { applyColumnFilters, applyKeyword, DISTINCT_COLUMNS, pickBucketSeconds, type DistinctColumn } from "./filters";
import type {
  ClassifiedFile,
  LogTypeOrUnknown,
  QueryFilters,
  QueryPage,
  SourceMeta,
} from "./types";
import { LOG_TYPES } from "./types";

const CANONICAL_COLUMNS = [
  "source_id",
  "row_idx",
  "log_type",
  "dedup_key",
  "ltime",
  "time",
  "stime",
  "etime",
  "src",
  "dst",
  "src_port",
  "dst_port",
  "protocol",
  "proto",
  "act",
  "act_tone",
  "rule_id",
  "vd_id",
  "msg",
  "uname",
  "atype",
  "severity",
  "program",
  "device",
  "result",
  "mac",
  "grp",
  "con_reason",
  "realname",
  "country",
  "country_dst",
  "nat_src",
  "nat_dst",
  "sent_pkts",
  "sent_bytes",
  "rcv_pkts",
  "rcv_bytes",
  "from_zone",
  "to_zone",
  "sess_id",
  "spi",
  "vpn_type",
  "prof_id",
  "facility",
  "pid",
  "uid",
  "preview",
  "raw_json",
  "search_text",
] as const;

const LIST_COLUMNS = CANONICAL_COLUMNS.filter((c) => c !== "raw_json" && c !== "search_text");
const LIST_SQL = `id, ${LIST_COLUMNS.join(",")}`;

export interface IngestOptions {
  signal?: AbortSignal;
  onBatch?: (inserted: number) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("가져오기가 취소되었습니다.");
    err.name = "AbortError";
    throw err;
  }
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function ddl(): string {
  const cols = CANONICAL_COLUMNS.map((c) => {
    if (c === "ltime" || c === "row_idx") return `${c} INTEGER`;
    return `${c} TEXT`;
  }).join(", ");
  return `
    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      file_name TEXT,
      file_path TEXT,
      format TEXT,
      log_type TEXT,
      confidence TEXT,
      warning TEXT,
      row_count INTEGER,
      byte_length INTEGER
    );
    CREATE TABLE logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ${cols}
    );
    CREATE INDEX logs_type_time ON logs(log_type, ltime);
    CREATE INDEX logs_src ON logs(log_type, src);
  `;
}

function rowParams(row: CanonicalRow): SqlValue[] {
  return CANONICAL_COLUMNS.map((c) => row[c] as SqlValue);
}

export class Workspace {
  db: Database;
  sources: SourceMeta[] = [];
  genericFlags = new Set<string>();
  private countCache: Record<LogTypeOrUnknown, number> | null = null;
  private distinctCache = new Map<string, string[]>();
  private timeRangeCache = new Map<string, { min: number | null; max: number | null }>();
  private statsCache: { files: number; rows: number; bytes: number } | null = null;
  private committedDedup = new Set<string>();

  private constructor(db: Database) {
    this.db = db;
  }

  static async create(): Promise<Workspace> {
    const db = await createMemoryDb();
    db.exec("PRAGMA temp_store=MEMORY; PRAGMA cache_size=-8192;");
    db.exec(ddl());
    return new Workspace(db);
  }

  close(): void {
    this.db.close();
  }

  private insertSource(meta: SourceMeta): void {
    this.db.run(
      "INSERT INTO sources(id,file_name,file_path,format,log_type,confidence,warning,row_count,byte_length) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        meta.id,
        meta.fileName,
        meta.filePath ?? "",
        meta.format,
        meta.logType,
        meta.confidence,
        meta.warning ?? "",
        meta.rowCount,
        meta.byteLength,
      ],
    );
    this.sources.push(meta);
    this.statsCache = null;
  }

  private invalidateCache(): void {
    this.countCache = null;
    this.distinctCache.clear();
    this.timeRangeCache.clear();
    this.statsCache = null;
  }

  private insertRows(rows: CanonicalRow[]): number {
    const keep = rows.filter((row) => !this.committedDedup.has(row.dedup_key));
    if (keep.length === 0) return 0;
    const placeholders = CANONICAL_COLUMNS.map(() => "?").join(",");
    const sql = `INSERT INTO logs(${CANONICAL_COLUMNS.join(",")}) VALUES(${placeholders})`;
    this.db.run("BEGIN");
    try {
      const stmt = this.db.prepare(sql);
      for (const row of keep) {
        stmt.run(rowParams(row));
      }
      stmt.free();
      this.db.run("COMMIT");
      this.invalidateCache();
      return keep.length;
    } catch (err) {
      this.db.run("ROLLBACK");
      throw err;
    }
  }

  private commitDedupKeys(keys: string[]): void {
    for (const key of keys) this.committedDedup.add(key);
  }

  async ingest(file: ClassifiedFile, opts?: IngestOptions): Promise<SourceMeta> {
    if (file.format === "csv") return this.ingestCsv(file, opts);
    if (file.format === "adb") return this.ingestAdb(file, opts);
    const meta: SourceMeta = {
      id: file.id,
      fileName: file.name,
      filePath: file.path,
      format: "unknown",
      logType: "unknown",
      confidence: "none",
      warning: file.error ?? "지원하지 않는 형식",
      rowCount: 0,
      byteLength: file.bytes.length,
    };
    this.insertSource(meta);
    return meta;
  }

  private async ingestCsv(file: ClassifiedFile, opts?: IngestOptions): Promise<SourceMeta> {
    const parsed = parseCsv(file.bytes);
    const logType = file.logType;
    let inserted = 0;
    const batch: CanonicalRow[] = [];
    const seenInFile: string[] = [];
    for (let idx = 0; idx < parsed.rows.length; idx += 1) {
      throwIfAborted(opts?.signal);
      const row = ingestCsvRow(logType, file.id, idx, parsed.rows[idx]!);
      batch.push(row);
      seenInFile.push(row.dedup_key);
      if (batch.length >= 800) {
        inserted += this.insertRows(batch);
        opts?.onBatch?.(inserted);
        batch.length = 0;
        await yieldTick();
      }
    }
    if (batch.length) inserted += this.insertRows(batch);
    this.commitDedupKeys(seenInFile);
    if (logType === "unknown") this.genericFlags.add(file.id);
    const meta: SourceMeta = {
      id: file.id,
      fileName: file.name,
      filePath: file.path,
      format: "csv",
      logType,
      confidence: file.confidence,
      warning: file.warning,
      rowCount: inserted,
      byteLength: file.bytes.length,
    };
    this.insertSource(meta);
    return meta;
  }

  private async ingestAdb(file: ClassifiedFile, opts?: IngestOptions): Promise<SourceMeta> {
    let adb;
    try {
      adb = await openAdb(file.bytes);
    } catch (err) {
      const meta: SourceMeta = {
        id: file.id,
        fileName: file.name,
        filePath: file.path,
        format: "adb",
        logType: file.logType,
        confidence: "none",
        warning: `파일을 열 수 없습니다: ${err instanceof Error ? err.message : String(err)}`,
        rowCount: 0,
        byteLength: file.bytes.length,
      };
      this.insertSource(meta);
      return meta;
    }
    try {
      const tables = listUserTables(adb);
      if (tables.length === 0) {
        const meta: SourceMeta = {
          id: file.id,
          fileName: file.name,
          filePath: file.path,
          format: "adb",
          logType: "unknown",
          confidence: "none",
          warning: "테이블이 없는 SQLite 파일입니다.",
          rowCount: 0,
          byteLength: file.bytes.length,
        };
        this.insertSource(meta);
        return meta;
      }
      let total = 0;
      let resolvedType: LogTypeOrUnknown = file.logType;
      const warnings: string[] = [];
      if (file.warning) warnings.push(file.warning);
      for (const table of tables) {
        const fromTable = tableNameToLogType(table);
        const logType: LogTypeOrUnknown =
          fromTable !== "unknown" ? fromTable : file.logType;
        if (fromTable === "unknown") {
          this.genericFlags.add(file.id);
          warnings.push(`알 수 없는 테이블 ${table} — 원본 컬럼으로 표시합니다.`);
        }
        resolvedType = tables.length === 1 ? logType : resolvedType;
        const batch: CanonicalRow[] = [];
        const seenInFile: string[] = [];
        let idx = 0;
        for (const raw of iterateRows(adb, table)) {
          throwIfAborted(opts?.signal);
          const row = ingestAdbRow(logType, file.id, idx, raw);
          batch.push(row);
          seenInFile.push(row.dedup_key);
          idx += 1;
          if (batch.length >= 800) {
            total += this.insertRows(batch);
            opts?.onBatch?.(total);
            batch.length = 0;
            await yieldTick();
          }
        }
        if (batch.length) total += this.insertRows(batch);
        this.commitDedupKeys(seenInFile);
        if (fromTable !== "unknown") resolvedType = fromTable;
      }
      const meta: SourceMeta = {
        id: file.id,
        fileName: file.name,
        filePath: file.path,
        format: "adb",
        logType: resolvedType,
        confidence: resolvedType === "unknown" ? "none" : "high",
        warning: warnings.length ? warnings.join(" ") : undefined,
        rowCount: total,
        byteLength: file.bytes.length,
      };
      this.insertSource(meta);
      return meta;
    } finally {
      adb.close();
    }
  }

  counts(): Record<LogTypeOrUnknown, number> {
    if (this.countCache) return this.countCache;
    const result: Record<LogTypeOrUnknown, number> = {
      session: 0,
      audit: 0,
      uauth: 0,
      system: 0,
      ipsec: 0,
      ssl: 0,
      unknown: 0,
    };
    const stmt = this.db.prepare(
      "SELECT log_type AS t, COUNT(*) AS n FROM logs GROUP BY log_type",
    );
    while (stmt.step()) {
      const row = stmt.getAsObject() as { t?: LogTypeOrUnknown; n?: number };
      if (row.t) result[row.t] = Number(row.n ?? 0);
    }
    stmt.free();
    this.countCache = result;
    return result;
  }

  sourceCount(logType: LogTypeOrUnknown): number {
    return this.sources.filter((s) => s.logType === logType).length;
  }

  timeRange(logType: LogTypeOrUnknown): { min: number | null; max: number | null } {
    const cached = this.timeRangeCache.get(logType);
    if (cached) return cached;
    const stmt = this.db.prepare(
      "SELECT MIN(ltime) AS mn, MAX(ltime) AS mx FROM logs WHERE log_type = ? AND ltime IS NOT NULL AND ltime > 0",
    );
    stmt.bind([logType]);
    stmt.step();
    const row = stmt.getAsObject() as { mn?: number | null; mx?: number | null };
    stmt.free();
    const value = { min: row.mn ?? null, max: row.mx ?? null };
    this.timeRangeCache.set(logType, value);
    return value;
  }

  distinct(logType: LogTypeOrUnknown, column: DistinctColumn): string[] {
    if (!DISTINCT_COLUMNS.includes(column)) return [];
    const key = `${logType}:${column}`;
    const cached = this.distinctCache.get(key);
    if (cached) return cached;
    const stmt = this.db.prepare(
      `SELECT DISTINCT ${column} AS v FROM logs WHERE log_type = ? AND ${column} IS NOT NULL AND ${column} != '-' ORDER BY v LIMIT 80`,
    );
    stmt.bind([logType]);
    const out: string[] = [];
    while (stmt.step()) {
      const v = (stmt.getAsObject() as { v?: string }).v;
      if (v) out.push(v);
    }
    stmt.free();
    this.distinctCache.set(key, out);
    return out;
  }

  private composeWhere(
    logType: LogTypeOrUnknown | null,
    filters: QueryFilters,
  ): { whereSql: string; params: SqlValue[] } {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (logType) {
      where.push("log_type = ?");
      params.push(logType);
    }
    const cols = applyColumnFilters(filters);
    where.push(...cols.where);
    params.push(...cols.params);
    const kw = applyKeyword(filters.keyword, Boolean(filters.exact));
    where.push(...kw.where);
    params.push(...kw.params);
    return {
      whereSql: where.length ? where.join(" AND ") : "1=1",
      params,
    };
  }

  query(
    logType: LogTypeOrUnknown,
    filters: QueryFilters,
    page: number,
    pageSize: number,
  ): QueryPage {
    const started = Date.now();
    const { whereSql, params } = this.composeWhere(logType, filters);
    const countStmt = this.db.prepare(`SELECT COUNT(*) AS n FROM logs WHERE ${whereSql}`);
    countStmt.bind(params);
    countStmt.step();
    const total = Number((countStmt.getAsObject() as { n?: number }).n ?? 0);
    countStmt.free();

    const offset = Math.max(0, (page - 1) * pageSize);
    const dataStmt = this.db.prepare(
      `SELECT ${LIST_SQL} FROM logs WHERE ${whereSql} ORDER BY (ltime IS NULL), ltime DESC, id DESC LIMIT ? OFFSET ?`,
    );
    dataStmt.bind([...params, pageSize, offset]);
    const rows: Record<string, unknown>[] = [];
    while (dataStmt.step()) {
      rows.push(dataStmt.getAsObject() as Record<string, unknown>);
    }
    dataStmt.free();
    return { rows, total, elapsedMs: Date.now() - started };
  }

  search(keyword: string, exact = false, limit = 200): Record<string, unknown>[] {
    const kw = applyKeyword(keyword, exact);
    if (kw.where.length === 0) return [];
    const stmt = this.db.prepare(
      `SELECT ${LIST_SQL} FROM logs WHERE ${kw.where.join(" AND ")} ORDER BY (ltime IS NULL), ltime DESC, id DESC LIMIT ?`,
    );
    stmt.bind([...kw.params, limit]);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as Record<string, unknown>);
    }
    stmt.free();
    return rows;
  }

  searchGrouped(keyword: string, exact = false): Array<{ logType: LogTypeOrUnknown; count: number }> {
    const kw = applyKeyword(keyword, exact);
    if (kw.where.length === 0) return [];
    const stmt = this.db.prepare(
      `SELECT log_type AS t, COUNT(*) AS n FROM logs WHERE ${kw.where.join(" AND ")} GROUP BY log_type ORDER BY n DESC`,
    );
    stmt.bind(kw.params);
    const out: Array<{ logType: LogTypeOrUnknown; count: number }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { t?: LogTypeOrUnknown; n?: number };
      if (row.t) out.push({ logType: row.t, count: Number(row.n ?? 0) });
    }
    stmt.free();
    return out;
  }

  histogram(logType: LogTypeOrUnknown, filters: QueryFilters): Array<{ bucket: number; count: number }> {
    const range = this.timeRange(logType);
    if (!range.min || !range.max) return [];
    const size = pickBucketSeconds(range.min, range.max);
    const { whereSql, params } = this.composeWhere(logType, {
      ...filters,
      fromEpoch: null,
      toEpoch: null,
    });
    const stmt = this.db.prepare(
      `SELECT (ltime / ?) * ? AS b, COUNT(*) AS n FROM logs WHERE ${whereSql} AND ltime IS NOT NULL AND ltime > 0 GROUP BY b ORDER BY b`,
    );
    stmt.bind([size, size, ...params]);
    const out: Array<{ bucket: number; count: number }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { b?: number; n?: number };
      out.push({ bucket: Number(row.b ?? 0), count: Number(row.n ?? 0) });
    }
    stmt.free();
    return out;
  }

  stats(): { files: number; rows: number; bytes: number } {
    if (this.statsCache) return this.statsCache;
    this.statsCache = {
      files: this.sources.length,
      rows: this.sources.reduce((sum, s) => sum + s.rowCount, 0),
      bytes: this.sources.reduce((sum, s) => sum + s.byteLength, 0),
    };
    return this.statsCache;
  }

  getRawJson(id: number): Record<string, unknown> | null {
    const stmt = this.db.prepare("SELECT raw_json AS j FROM logs WHERE id = ?");
    stmt.bind([id]);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const raw = String((stmt.getAsObject() as { j?: string }).j ?? "");
    stmt.free();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  exportRows(logType: LogTypeOrUnknown, filters: QueryFilters): Record<string, unknown>[] {
    const page = this.query(logType, filters, 1, 1_000_000);
    return page.rows;
  }

  isGeneric(logType: LogTypeOrUnknown): boolean {
    return logType === "unknown" || this.sources.some((s) => s.logType === logType && this.genericFlags.has(s.id));
  }
}

export function emptyCounts(): Record<LogTypeOrUnknown, number> {
  return {
    session: 0,
    audit: 0,
    uauth: 0,
    system: 0,
    ipsec: 0,
    ssl: 0,
    unknown: 0,
  };
}

export { LOG_TYPES };
