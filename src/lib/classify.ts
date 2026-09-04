import { ADB_TABLE_TO_TYPE } from "./mappings";
import { parseCsv, previewCsv } from "./csv";
import type {
  ClassifiedFile,
  Confidence,
  FileFormat,
  LogType,
  LogTypeOrUnknown,
  OpenedFile,
} from "./types";
import { LOG_TYPES } from "./types";

const ADB_MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33];

const ANCHORS: Record<LogType, string[]> = {
  session: ["정책 ID", "가상 도메인 ID", "출발지 포트", "목적지 포트", "동작"],
  uauth: ["사용자 그룹", "MAC", "사용자 접속 사유", "사용자 ID"],
  audit: ["관리자", "접속 유형", "위험도"],
  system: ["프로세스"],
  ssl: ["로컬 주소", "원격 주소"],
  ipsec: ["SPI", "터널", "VPN"],
};

const FILENAME_HINTS: Array<{ re: RegExp; type: LogType }> = [
  { re: /session/i, type: "session" },
  { re: /audit/i, type: "audit" },
  { re: /authenti|uauth/i, type: "uauth" },
  { re: /system/i, type: "system" },
  { re: /ipsec/i, type: "ipsec" },
  { re: /ssl/i, type: "ssl" },
];

export function isSupportedLogFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith("-wal") || lower.endsWith("-shm")) return false;
  if (lower === ".ds_store" || lower === "thumbs.db") return false;
  return lower.endsWith(".adb") || lower.endsWith(".csv");
}

export function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < ADB_MAGIC.length) return false;
  return ADB_MAGIC.every((b, i) => bytes[i] === b);
}

export function filenameHint(name: string): LogType | null {
  const base = name.replace(/\.[^.]+$/, "");
  for (const hint of FILENAME_HINTS) {
    if (hint.re.test(base)) return hint.type;
  }
  return null;
}

export function scoreHeaders(headers: string[]): {
  logType: LogTypeOrUnknown;
  score: number;
  second: number;
  reason: string;
} {
  const set = new Set(headers.map((h) => h.trim()));
  const scores: Array<{ type: LogType; score: number; hits: string[] }> = [];
  for (const type of LOG_TYPES) {
    const hits = ANCHORS[type].filter((a) => set.has(a));
    let score = hits.length;
    if (type === "ssl" && set.has("정책 ID")) score -= 2;
    if (type === "audit" && set.has("관리자")) score += 2;
    if (type === "system" && set.has("프로세스")) score += 3;
    if (type === "session" && set.has("정책 ID") && set.has("가상 도메인 ID")) {
      score += 2;
    }
    scores.push({ type, score, hits });
  }
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0]!;
  const second = scores[1]?.score ?? 0;
  if (top.score <= 0) {
    return { logType: "unknown", score: 0, second, reason: "헤더 시그니처 없음" };
  }
  if (top.score === second) {
    return {
      logType: top.type,
      score: top.score,
      second,
      reason: `후보 경합 (${top.type}/${scores[1]?.type})`,
    };
  }
  return {
    logType: top.type,
    score: top.score,
    second,
    reason: `anchor ${top.hits.join(", ")}`,
  };
}

export function confidenceFromScore(score: number, second: number): Confidence {
  if (score <= 0) return "none";
  if (score <= second) return "low";
  if (score >= 2 && score - second >= 1) return "high";
  return "low";
}

export function classifyCsv(file: OpenedFile): Omit<ClassifiedFile, "id" | "bytes"> {
  const parsed = parseCsv(file.bytes);
  const scored = scoreHeaders(parsed.headers);
  const hint = filenameHint(file.name);
  let logType = scored.logType;
  let confidence = confidenceFromScore(scored.score, scored.second);
  let reason = scored.reason;
  if (logType === "unknown" && hint) {
    logType = hint;
    confidence = "low";
    reason = `파일명 추정 (${hint})`;
  } else if (hint && logType !== "unknown" && hint !== logType) {
    reason += ` / 파일명은 ${hint}`;
    if (confidence === "high") {
      /* keep content-based type */
    } else {
      confidence = "low";
    }
  }
  return {
    name: file.name,
    path: file.path,
    format: "csv",
    logType,
    confidence,
    reason,
    previewLines: previewCsv(file.bytes),
    headers: parsed.headers,
  };
}

export function classifyByNameAndMagic(file: OpenedFile): {
  format: FileFormat | "unknown";
} {
  const lower = file.name.toLowerCase();
  if (looksLikeSqlite(file.bytes) || lower.endsWith(".adb")) {
    return { format: "adb" };
  }
  if (lower.endsWith(".csv")) return { format: "csv" };
  return { format: "unknown" };
}

let idSeq = 0;
export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function classifyOpenedFile(file: OpenedFile): ClassifiedFile {
  const { format } = classifyByNameAndMagic(file);
  const base = {
    id: nextId("file"),
    name: file.name,
    path: file.path,
    bytes: file.bytes,
  };
  if (format === "csv") {
    return { ...base, ...classifyCsv(file) };
  }
  if (format === "adb") {
    const hint = filenameHint(file.name);
    return {
      ...base,
      format: "adb",
      logType: hint ?? "unknown",
      confidence: hint ? "high" : "low",
      reason: hint
        ? `파일명 ${hint} + SQLite 헤더`
        : "SQLite 헤더 확인, 테이블명은 열 때 확정",
      previewLines: [`SQLite 데이터베이스 (${file.bytes.length.toLocaleString()} bytes)`],
      headers: [],
    };
  }
  return {
    ...base,
    format: "unknown",
    logType: "unknown",
    confidence: "none",
    reason: "지원하지 않는 형식",
    previewLines: [],
    headers: [],
    error: "지원 확장자가 아닙니다 (.adb / .csv)",
  };
}

export function tableNameToLogType(table: string): LogTypeOrUnknown {
  const key = table.trim().toLowerCase();
  return ADB_TABLE_TO_TYPE[key] ?? "unknown";
}
