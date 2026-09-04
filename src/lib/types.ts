export const LOG_TYPES = [
  "session",
  "audit",
  "uauth",
  "system",
  "ipsec",
  "ssl",
] as const;

export type LogType = (typeof LOG_TYPES)[number];
export type LogTypeOrUnknown = LogType | "unknown";
export type FileFormat = "adb" | "csv";
export type Confidence = "high" | "low" | "none";
export type ThemeMode = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type ExportEncoding = "utf-8-bom" | "utf-16le";

export interface ColumnPreset {
  key: string;
  label: string;
  width?: string;
}

export interface OpenedFile {
  name: string;
  path?: string;
  bytes: Uint8Array;
}

export interface ClassifiedFile {
  id: string;
  name: string;
  path?: string;
  bytes: Uint8Array;
  format: FileFormat | "unknown";
  logType: LogTypeOrUnknown;
  confidence: Confidence;
  reason: string;
  warning?: string;
  error?: string;
  previewLines: string[];
  headers: string[];
}

export interface SourceMeta {
  id: string;
  fileName: string;
  filePath?: string;
  format: FileFormat | "unknown";
  logType: LogTypeOrUnknown;
  confidence: Confidence;
  warning?: string;
  rowCount: number;
  byteLength: number;
}

export interface QueryFilters {
  fromEpoch?: number | null;
  toEpoch?: number | null;
  action?: string | null;
  protocol?: string | null;
  severity?: string | null;
  program?: string | null;
  srcIp?: string | null;
  dstIp?: string | null;
  srcPort?: string | null;
  dstPort?: string | null;
  ruleId?: string | null;
  fromZone?: string | null;
  toZone?: string | null;
  uname?: string | null;
  atype?: string | null;
  result?: string | null;
  grp?: string | null;
  msgContains?: string | null;
  keyword?: string | null;
  exact?: boolean;
}

export interface QueryPage {
  rows: Record<string, unknown>[];
  total: number;
  elapsedMs: number;
}

export interface Settings {
  theme: ThemeMode;
  density: Density;
  pageSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  density: "comfortable",
  pageSize: 100,
};
