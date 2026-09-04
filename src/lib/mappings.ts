import type { ColumnPreset, LogType, LogTypeOrUnknown } from "./types";
import { unknownCode } from "./decode";

export const LOG_TYPE_LABELS: Record<LogTypeOrUnknown, string> = {
  session: "세션",
  audit: "감사",
  uauth: "인증",
  system: "시스템",
  ipsec: "IPsec",
  ssl: "SSL-VPN",
  unknown: "알 수 없음",
};

export const IANA_PROTOCOL: Record<number, string> = {
  1: "icmp",
  6: "tcp",
  17: "udp",
  47: "gre",
  50: "esp",
  51: "ah",
  58: "ipv6-icmp",
};

export const SYSLOG_SEVERITY: Record<number, string> = {
  0: "긴급",
  1: "경보",
  2: "치명",
  3: "오류",
  4: "경고",
  5: "알림",
  6: "정보",
  7: "디버그",
};

const SEVERITY_ALIASES: Record<string, string> = {
  emergency: "긴급",
  alert: "경보",
  critical: "치명",
  error: "오류",
  err: "오류",
  warning: "경고",
  warn: "경고",
  notice: "알림",
  informational: "정보",
  info: "정보",
  debugging: "디버그",
  debug: "디버그",
};

export const SESSION_ACT: Record<number, { label: string; tone: "danger" | "ok" | "warn" }> = {
  1: { label: "차단", tone: "danger" },
};

const ACT_ALIASES: Record<string, { label: string; tone: "danger" | "ok" | "warn" }> = {
  drop: { label: "차단", tone: "danger" },
  deny: { label: "차단", tone: "danger" },
  block: { label: "차단", tone: "danger" },
  accept: { label: "허용", tone: "ok" },
  allow: { label: "허용", tone: "ok" },
  permit: { label: "허용", tone: "ok" },
};

export function mapProtocol(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "number" && Number.isFinite(value)) {
    return IANA_PROTOCOL[value] ?? unknownCode(value);
  }
  const s = String(value).trim().toLowerCase();
  if (!s || s === "-") return "-";
  return s;
}

export function mapSeverity(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "number" && Number.isFinite(value)) {
    return SYSLOG_SEVERITY[value] ?? unknownCode(value);
  }
  const s = String(value).trim().toLowerCase();
  return SEVERITY_ALIASES[s] ?? String(value);
}

export function mapAct(value: unknown): { label: string; tone: "danger" | "ok" | "warn" | "neutral" } {
  if (value == null || value === "") return { label: "-", tone: "neutral" };
  if (typeof value === "number" && Number.isFinite(value)) {
    return SESSION_ACT[value] ?? { label: unknownCode(value), tone: "warn" };
  }
  const s = String(value).trim().toLowerCase();
  if (!s || s === "-") return { label: "-", tone: "neutral" };
  return ACT_ALIASES[s] ?? { label: String(value), tone: "neutral" };
}

export function severityTone(label: string): "danger" | "ok" | "warn" | "neutral" {
  if (["긴급", "경보", "치명", "오류"].includes(label)) return "danger";
  if (label === "경고") return "warn";
  if (label === "정보" || label === "디버그" || label === "알림") return "neutral";
  return "neutral";
}

export const COLUMN_PRESETS: Record<LogType, ColumnPreset[]> = {
  session: [
    { key: "time", label: "시간", width: "158px" },
    { key: "src", label: "출발지" },
    { key: "dst", label: "목적지" },
    { key: "protocol", label: "프로토콜", width: "88px" },
    { key: "act", label: "동작", width: "88px" },
    { key: "rule_id", label: "정책 ID", width: "80px" },
    { key: "msg", label: "메시지" },
  ],
  audit: [
    { key: "time", label: "시간", width: "158px" },
    { key: "uname", label: "관리자", width: "120px" },
    { key: "atype", label: "접속 유형", width: "110px" },
    { key: "severity", label: "위험도", width: "88px" },
    { key: "src", label: "IP 주소", width: "140px" },
    { key: "msg", label: "메시지" },
  ],
  uauth: [
    { key: "time", label: "시간", width: "158px" },
    { key: "uname", label: "사용자", width: "120px" },
    { key: "atype", label: "접속 유형", width: "110px" },
    { key: "result", label: "결과", width: "88px" },
    { key: "src", label: "IP 주소", width: "140px" },
    { key: "msg", label: "메시지" },
  ],
  system: [
    { key: "time", label: "시간", width: "158px" },
    { key: "program", label: "프로세스", width: "120px" },
    { key: "severity", label: "위험도", width: "88px" },
    { key: "msg", label: "메시지" },
  ],
  ipsec: [
    { key: "time", label: "시간", width: "158px" },
    { key: "src", label: "출발지" },
    { key: "dst", label: "목적지" },
    { key: "proto", label: "프로토콜", width: "88px" },
    { key: "msg", label: "메시지" },
  ],
  ssl: [
    { key: "time", label: "시간", width: "158px" },
    { key: "src", label: "로컬 주소" },
    { key: "dst", label: "원격 주소" },
    { key: "proto", label: "프로토콜", width: "88px" },
    { key: "msg", label: "메시지" },
  ],
};

export const UNKNOWN_PRESET: ColumnPreset[] = [
  { key: "time", label: "시간", width: "158px" },
  { key: "preview", label: "내용" },
];

export const SEARCH_PRESET: ColumnPreset[] = [
  { key: "time", label: "시간", width: "158px" },
  { key: "log_type", label: "종류", width: "88px" },
  { key: "src", label: "출발지" },
  { key: "dst", label: "목적지" },
  { key: "msg", label: "메시지" },
];

export const EXTRA_COLUMNS: Record<LogType, ColumnPreset[]> = {
  session: [
    { key: "from_zone", label: "출발지 Zone", width: "110px" },
    { key: "to_zone", label: "목적지 Zone", width: "110px" },
    { key: "sent_bytes", label: "발신 바이트", width: "100px" },
    { key: "rcv_bytes", label: "수신 바이트", width: "100px" },
    { key: "nat_src", label: "NAT 출발지" },
    { key: "nat_dst", label: "NAT 목적지" },
  ],
  audit: [
    { key: "device", label: "장비", width: "120px" },
  ],
  uauth: [
    { key: "grp", label: "그룹", width: "120px" },
    { key: "mac", label: "MAC", width: "140px" },
  ],
  system: [
    { key: "facility", label: "Facility", width: "100px" },
    { key: "pid", label: "PID", width: "80px" },
  ],
  ipsec: [
    { key: "spi", label: "SPI", width: "120px" },
    { key: "vpn_type", label: "VPN 종류", width: "100px" },
  ],
  ssl: [
    { key: "uname", label: "사용자", width: "120px" },
  ],
};

export function presetFor(type: LogTypeOrUnknown): ColumnPreset[] {
  if (type === "unknown") return UNKNOWN_PRESET;
  return COLUMN_PRESETS[type];
}

export function columnsFor(
  type: LogTypeOrUnknown,
  hidden: string[] = [],
  extra: string[] = [],
): ColumnPreset[] {
  const base = presetFor(type).filter((col) => !hidden.includes(col.key));
  if (type === "unknown") return base;
  const extras = EXTRA_COLUMNS[type].filter((col) => extra.includes(col.key));
  return [...base, ...extras];
}

export const DETAIL_LABELS: Record<string, string> = {
  time: "시간",
  stime: "시작 시간",
  etime: "종료 시간",
  src: "출발지",
  dst: "목적지",
  src_port: "출발지 포트",
  dst_port: "목적지 포트",
  protocol: "프로토콜",
  proto: "프로토콜",
  act: "동작",
  rule_id: "정책 ID",
  vd_id: "가상 도메인 ID",
  msg: "메시지",
  uname: "사용자/관리자",
  atype: "접속 유형",
  severity: "위험도",
  program: "프로세스",
  device: "장비 이름",
  result: "결과",
  mac: "MAC",
  grp: "사용자 그룹",
  con_reason: "사용자 접속 사유",
  realname: "사용자 이름",
  country: "출발지 국가",
  country_dst: "목적지 국가",
  nat_src: "NAT 출발지",
  nat_dst: "NAT 목적지",
  sent_pkts: "발신 패킷 수",
  sent_bytes: "발신 바이트 수",
  rcv_pkts: "수신 패킷 수",
  rcv_bytes: "수신 바이트 수",
  from_zone: "출발지 Zone",
  to_zone: "목적지 Zone",
  sess_id: "세션 ID",
  spi: "SPI",
  vpn_type: "VPN 유형",
  prof_id: "프로파일 ID",
  facility: "Facility",
  pid: "PID",
  uid: "사용자",
  preview: "미리보기",
  source: "파일",
};

export const ADB_TABLE_TO_TYPE: Record<string, LogType> = {
  session_log_t: "session",
  audit_log_t: "audit",
  uauth_log_t: "uauth",
  system_log_t: "system",
  ipsec_log_t: "ipsec",
  ssl_log_t: "ssl",
};
