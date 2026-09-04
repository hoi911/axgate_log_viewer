import type { SqlValue } from "sql.js";
import type { LogType, LogTypeOrUnknown, QueryFilters } from "./types";

export const DISTINCT_COLUMNS = [
  "act",
  "protocol",
  "severity",
  "program",
  "atype",
  "result",
  "grp",
  "from_zone",
  "to_zone",
] as const;

export type DistinctColumn = (typeof DISTINCT_COLUMNS)[number];

export type FilterControl =
  | { kind: "daterange"; label: string }
  | { kind: "text"; key: keyof QueryFilters; label: string; column: string; match: "contains" | "equals" }
  | { kind: "select"; key: keyof QueryFilters; label: string; column: DistinctColumn }
  | { kind: "combo"; key: keyof QueryFilters; label: string; column: DistinctColumn };

export const FILTERS_BY_TYPE: Record<LogType, FilterControl[]> = {
  session: [
    { kind: "daterange", label: "기간" },
    { kind: "text", key: "srcIp", label: "출발지 IP", column: "src", match: "contains" },
    { kind: "text", key: "dstIp", label: "목적지 IP", column: "dst", match: "contains" },
    { kind: "text", key: "srcPort", label: "출발지 포트", column: "src_port", match: "contains" },
    { kind: "text", key: "dstPort", label: "목적지 포트", column: "dst_port", match: "contains" },
    { kind: "select", key: "protocol", label: "프로토콜", column: "protocol" },
    { kind: "select", key: "action", label: "동작", column: "act" },
    { kind: "text", key: "ruleId", label: "정책 ID", column: "rule_id", match: "contains" },
    { kind: "select", key: "fromZone", label: "출발지 Zone", column: "from_zone" },
    { kind: "select", key: "toZone", label: "목적지 Zone", column: "to_zone" },
  ],
  audit: [
    { kind: "daterange", label: "기간" },
    { kind: "text", key: "uname", label: "관리자", column: "uname", match: "contains" },
    { kind: "select", key: "atype", label: "접속 유형", column: "atype" },
    { kind: "select", key: "severity", label: "위험도", column: "severity" },
    { kind: "text", key: "srcIp", label: "IP 주소", column: "src", match: "contains" },
  ],
  uauth: [
    { kind: "daterange", label: "기간" },
    { kind: "text", key: "uname", label: "사용자 ID", column: "uname", match: "contains" },
    { kind: "select", key: "atype", label: "접속 유형", column: "atype" },
    { kind: "select", key: "result", label: "결과", column: "result" },
    { kind: "text", key: "srcIp", label: "IP 주소", column: "src", match: "contains" },
    { kind: "select", key: "grp", label: "그룹", column: "grp" },
  ],
  system: [
    { kind: "daterange", label: "기간" },
    { kind: "combo", key: "program", label: "프로세스", column: "program" },
    { kind: "select", key: "severity", label: "위험도", column: "severity" },
  ],
  ipsec: [
    { kind: "daterange", label: "기간" },
    { kind: "text", key: "srcIp", label: "출발지", column: "src", match: "contains" },
    { kind: "text", key: "dstIp", label: "목적지", column: "dst", match: "contains" },
    { kind: "text", key: "msgContains", label: "상태", column: "msg", match: "contains" },
  ],
  ssl: [
    { kind: "daterange", label: "기간" },
    { kind: "text", key: "srcIp", label: "로컬 주소", column: "src", match: "contains" },
    { kind: "text", key: "dstIp", label: "원격 주소", column: "dst", match: "contains" },
    { kind: "text", key: "msgContains", label: "상태", column: "msg", match: "contains" },
  ],
};

export function filtersFor(type: LogTypeOrUnknown): FilterControl[] {
  if (type === "unknown") return [{ kind: "daterange", label: "기간" }];
  return FILTERS_BY_TYPE[type];
}

export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function applyColumnFilters(filters: QueryFilters): { where: string[]; params: SqlValue[] } {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (filters.fromEpoch && filters.fromEpoch > 0) {
    where.push("ltime >= ?");
    params.push(filters.fromEpoch);
  }
  if (filters.toEpoch && filters.toEpoch > 0) {
    where.push("ltime <= ?");
    params.push(filters.toEpoch);
  }

  const equals: Array<[string, string | null | undefined]> = [
    ["act", filters.action],
    ["protocol", filters.protocol],
    ["severity", filters.severity],
    ["program", filters.program],
    ["atype", filters.atype],
    ["result", filters.result],
    ["grp", filters.grp],
    ["from_zone", filters.fromZone],
    ["to_zone", filters.toZone],
  ];
  for (const [col, value] of equals) {
    if (!value) continue;
    where.push(`${col} = ?`);
    params.push(value);
  }

  const contains: Array<[string, string | null | undefined]> = [
    ["src", filters.srcIp],
    ["dst", filters.dstIp],
    ["src_port", filters.srcPort],
    ["dst_port", filters.dstPort],
    ["rule_id", filters.ruleId],
    ["uname", filters.uname],
    ["msg", filters.msgContains],
  ];
  for (const [col, value] of contains) {
    if (!value) continue;
    where.push(`${col} LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(value)}%`);
  }
  return { where, params };
}

export function applyKeyword(
  keyword: string | null | undefined,
  exact = false,
): { where: string[]; params: SqlValue[] } {
  const q = keyword?.trim().toLowerCase() ?? "";
  if (!q) return { where: [], params: [] };
  if (exact) {
    const fields = [
      "src", "dst", "uname", "msg", "act", "program", "atype", "result",
      "device", "grp", "mac", "protocol", "rule_id", "from_zone", "to_zone",
    ];
    return {
      where: [`(${fields.map((f) => `LOWER(${f}) = ?`).join(" OR ")})`],
      params: fields.map(() => q),
    };
  }
  return {
    where: ["search_text LIKE ? ESCAPE '\\'"],
    params: [`%${escapeLike(q)}%`],
  };
}

export interface FilterChip {
  key: keyof QueryFilters;
  label: string;
  value: string;
}

export function filterChips(type: LogTypeOrUnknown, filters: QueryFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.fromEpoch) {
    chips.push({ key: "fromEpoch", label: "시작", value: formatChipTime(filters.fromEpoch) });
  }
  if (filters.toEpoch) {
    chips.push({ key: "toEpoch", label: "종료", value: formatChipTime(filters.toEpoch) });
  }
  const specs = filtersFor(type);
  for (const spec of specs) {
    if (spec.kind === "daterange") continue;
    const raw = filters[spec.key];
    if (typeof raw !== "string" || !raw) continue;
    chips.push({ key: spec.key, label: spec.label, value: raw });
  }
  if (filters.keyword) {
    chips.push({
      key: "keyword",
      label: filters.exact ? "정확히" : "검색어",
      value: filters.keyword,
    });
  }
  return chips;
}

function formatChipTime(epoch: number): string {
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function hasActiveFilters(filters: QueryFilters): boolean {
  return Boolean(
    filters.fromEpoch ||
      filters.toEpoch ||
      filters.action ||
      filters.protocol ||
      filters.severity ||
      filters.program ||
      filters.srcIp ||
      filters.dstIp ||
      filters.srcPort ||
      filters.dstPort ||
      filters.ruleId ||
      filters.fromZone ||
      filters.toZone ||
      filters.uname ||
      filters.atype ||
      filters.result ||
      filters.grp ||
      filters.msgContains ||
      filters.keyword,
  );
}

export function pickBucketSeconds(min: number, max: number): number {
  const span = Math.max(1, max - min);
  if (span <= 3 * 3600) return 5 * 60;
  if (span <= 24 * 3600) return 3600;
  if (span <= 14 * 24 * 3600) return 6 * 3600;
  return 24 * 3600;
}
