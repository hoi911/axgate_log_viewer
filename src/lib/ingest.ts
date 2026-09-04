import {
  dashIfEmpty,
  decodeIp,
  formatEpochSeconds,
  parseAuthResult,
  parseDateTimeToEpoch,
} from "./decode";
import { mapAct, mapProtocol, mapSeverity } from "./mappings";
import type { LogType, LogTypeOrUnknown } from "./types";

function num(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in row)) continue;
    const v = row[key];
    if (v == null || v === "" || v === "-") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (!(key in row)) continue;
    const v = row[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return "";
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
}

function ipFromRow(
  row: Record<string, unknown>,
  kind: "src" | "dst" | "nat_src" | "nat_dst",
  emptyAsDash = true,
): string {
  const ver = num(row, "ip_ver");
  if (kind === "src") {
    return decodeIp({
      ipVer: ver,
      beWords: [num(row, "ip_src"), num(row, "ip_src_2"), num(row, "ip_src_3"), num(row, "ip_src_4")],
      leWords: [num(row, "src_1"), num(row, "src_2"), num(row, "src_3"), num(row, "src_4")],
      emptyAsDash,
    });
  }
  if (kind === "dst") {
    return decodeIp({
      ipVer: ver,
      beWords: [num(row, "ip_dst"), num(row, "ip_dst_2"), num(row, "ip_dst_3"), num(row, "ip_dst_4")],
      leWords: [num(row, "dst_1"), num(row, "dst_2"), num(row, "dst_3"), num(row, "dst_4")],
      emptyAsDash,
    });
  }
  if (kind === "nat_src") {
    return decodeIp({
      ipVer: ver,
      beWords: [num(row, "nat_ip_src"), num(row, "nat_ip_src_2"), num(row, "nat_ip_src_3"), num(row, "nat_ip_src_4")],
      leWords: [num(row, "nat_src_1"), num(row, "nat_src_2"), num(row, "nat_src_3"), num(row, "nat_src_4")],
      emptyAsDash: true,
    });
  }
  return decodeIp({
    ipVer: ver,
    beWords: [num(row, "nat_ip_dst"), num(row, "nat_ip_dst_2"), num(row, "nat_ip_dst_3"), num(row, "nat_ip_dst_4")],
    leWords: [num(row, "nat_dst_1"), num(row, "nat_dst_2"), num(row, "nat_dst_3"), num(row, "nat_dst_4")],
    emptyAsDash: true,
  });
}

function csvIp(row: Record<string, unknown>, ...keys: string[]): string {
  const s = str(row, ...keys);
  return s === "" || s === "-" ? "-" : s;
}

export interface CanonicalRow {
  source_id: string;
  row_idx: number;
  log_type: LogTypeOrUnknown;
  dedup_key: string;
  ltime: number | null;
  time: string;
  stime: string;
  etime: string;
  src: string;
  dst: string;
  src_port: string;
  dst_port: string;
  protocol: string;
  proto: string;
  act: string;
  act_tone: string;
  rule_id: string;
  vd_id: string;
  msg: string;
  uname: string;
  atype: string;
  severity: string;
  program: string;
  device: string;
  result: string;
  mac: string;
  grp: string;
  con_reason: string;
  realname: string;
  country: string;
  country_dst: string;
  nat_src: string;
  nat_dst: string;
  sent_pkts: string;
  sent_bytes: string;
  rcv_pkts: string;
  rcv_bytes: string;
  from_zone: string;
  to_zone: string;
  sess_id: string;
  spi: string;
  vpn_type: string;
  prof_id: string;
  facility: string;
  pid: string;
  uid: string;
  preview: string;
  raw_json: string;
  search_text: string;
}

function baseRow(sourceId: string, rowIdx: number, logType: LogTypeOrUnknown, raw: Record<string, unknown>): CanonicalRow {
  return {
    source_id: sourceId,
    row_idx: rowIdx,
    log_type: logType,
    dedup_key: "",
    ltime: null,
    time: "-",
    stime: "-",
    etime: "-",
    src: "-",
    dst: "-",
    src_port: "-",
    dst_port: "-",
    protocol: "-",
    proto: "-",
    act: "-",
    act_tone: "neutral",
    rule_id: "-",
    vd_id: "-",
    msg: "-",
    uname: "-",
    atype: "-",
    severity: "-",
    program: "-",
    device: "-",
    result: "-",
    mac: "-",
    grp: "-",
    con_reason: "-",
    realname: "-",
    country: "-",
    country_dst: "-",
    nat_src: "-",
    nat_dst: "-",
    sent_pkts: "-",
    sent_bytes: "-",
    rcv_pkts: "-",
    rcv_bytes: "-",
    from_zone: "-",
    to_zone: "-",
    sess_id: "-",
    spi: "-",
    vpn_type: "-",
    prof_id: "-",
    facility: "-",
    pid: "-",
    uid: "-",
    preview: "-",
    raw_json: JSON.stringify(raw),
    search_text: "",
  };
}

function finish(row: CanonicalRow): CanonicalRow {
  if (!row.time || row.time === "-") {
    row.time = row.stime !== "-" ? row.stime : formatEpochSeconds(row.ltime);
  }
  row.preview = [row.time, row.src, row.dst, row.act, row.program, row.uname, row.msg]
    .filter((v) => v && v !== "-")
    .join(" · ");
  row.search_text = [
    row.time, row.stime, row.etime, row.src, row.dst, row.src_port, row.dst_port,
    row.protocol, row.act, row.rule_id, row.msg, row.uname, row.atype, row.severity,
    row.program, row.device, row.result, row.grp, row.mac, row.from_zone, row.to_zone,
    row.realname, row.con_reason,
  ]
    .filter((v) => v && v !== "-")
    .join(" ")
    .toLowerCase();
  row.dedup_key = [
    row.log_type,
    row.ltime ?? row.time,
    row.src,
    row.dst,
    row.src_port,
    row.dst_port,
    row.act,
    row.msg,
    row.uname,
    row.program,
  ].join("|");
  return row;
}

export function ingestAdbRow(
  logType: LogTypeOrUnknown,
  sourceId: string,
  rowIdx: number,
  raw: Record<string, unknown>,
): CanonicalRow {
  const row = baseRow(sourceId, rowIdx, logType, raw);
  row.ltime = num(raw, "ltime", "stime");
  row.time = formatEpochSeconds(pick(raw, "ltime"));
  row.stime = formatEpochSeconds(pick(raw, "stime"));
  row.etime = formatEpochSeconds(pick(raw, "etime"));
  row.src = ipFromRow(raw, "src");
  row.dst = ipFromRow(raw, "dst");
  row.nat_src = ipFromRow(raw, "nat_src");
  row.nat_dst = ipFromRow(raw, "nat_dst");
  row.src_port = dashIfEmpty(pick(raw, "sport"));
  row.dst_port = dashIfEmpty(pick(raw, "dport"));
  row.protocol = mapProtocol(pick(raw, "protocol", "proto"));
  row.proto = row.protocol;
  const act = mapAct(pick(raw, "act"));
  row.act = act.label;
  row.act_tone = act.tone;
  row.rule_id = dashIfEmpty(pick(raw, "rule_id"));
  row.vd_id = dashIfEmpty(pick(raw, "vd_id"));
  row.msg = dashIfEmpty(pick(raw, "msg", "act"));
  row.uname = dashIfEmpty(pick(raw, "uname"));
  row.atype = dashIfEmpty(pick(raw, "atype"));
  row.severity = mapSeverity(pick(raw, "severity"));
  row.program = dashIfEmpty(pick(raw, "program"));
  row.device = dashIfEmpty(pick(raw, "devicename"));
  row.mac = dashIfEmpty(pick(raw, "mac"));
  row.grp = dashIfEmpty(pick(raw, "grp"));
  row.con_reason = dashIfEmpty(pick(raw, "con_reason"));
  row.realname = dashIfEmpty(pick(raw, "realname"));
  row.country = dashIfEmpty(pick(raw, "country"));
  row.country_dst = dashIfEmpty(pick(raw, "country_dst"));
  row.sent_pkts = dashIfEmpty(pick(raw, "sent_pkts"));
  row.sent_bytes = dashIfEmpty(pick(raw, "sent_bytes"));
  row.rcv_pkts = dashIfEmpty(pick(raw, "rcv_pkts"));
  row.rcv_bytes = dashIfEmpty(pick(raw, "rcv_bytes"));
  row.from_zone = dashIfEmpty(pick(raw, "from_zone"));
  row.to_zone = dashIfEmpty(pick(raw, "to_zone"));
  row.sess_id = dashIfEmpty(pick(raw, "sess_id"));
  row.spi = dashIfEmpty(pick(raw, "spi"));
  row.vpn_type = dashIfEmpty(pick(raw, "vpn_type"));
  row.prof_id = dashIfEmpty(pick(raw, "prof_id"));
  row.facility = dashIfEmpty(pick(raw, "facility"));
  row.pid = dashIfEmpty(pick(raw, "pid"));
  row.uid = dashIfEmpty(pick(raw, "uid"));
  if (logType === "audit") {
    row.msg = dashIfEmpty(pick(raw, "act", "msg"));
  }
  if (logType === "uauth") {
    row.msg = dashIfEmpty(pick(raw, "act", "msg"));
    row.result = parseAuthResult(row.msg);
  }
  if (logType === "ssl") {
    row.src = ipFromRow(raw, "src");
    row.dst = ipFromRow(raw, "dst");
  }
  return finish(row);
}

export function ingestCsvRow(
  logType: LogTypeOrUnknown,
  sourceId: string,
  rowIdx: number,
  raw: Record<string, unknown>,
): CanonicalRow {
  const row = baseRow(sourceId, rowIdx, logType, raw);
  const timeRaw = pick(raw, "시간", "시작 시간", "time");
  row.ltime = parseDateTimeToEpoch(timeRaw);
  row.time = dashIfEmpty(timeRaw);
  row.stime = dashIfEmpty(pick(raw, "시작 시간", "시간"));
  row.etime = dashIfEmpty(pick(raw, "종료 시간"));
  row.src = csvIp(raw, "출발지", "IP 주소", "로컬 주소");
  row.dst = csvIp(raw, "목적지", "원격 주소");
  row.src_port = dashIfEmpty(pick(raw, "출발지 포트"));
  row.dst_port = dashIfEmpty(pick(raw, "목적지 포트"));
  row.protocol = mapProtocol(pick(raw, "프로토콜"));
  row.proto = row.protocol;
  const act = mapAct(pick(raw, "동작"));
  row.act = act.label;
  row.act_tone = act.tone;
  row.rule_id = dashIfEmpty(pick(raw, "정책 ID"));
  row.vd_id = dashIfEmpty(pick(raw, "가상 도메인 ID"));
  row.msg = dashIfEmpty(pick(raw, "메시지"));
  row.uname = dashIfEmpty(pick(raw, "관리자", "사용자 ID", "사용자"));
  row.atype = dashIfEmpty(pick(raw, "접속 유형"));
  row.severity = mapSeverity(pick(raw, "위험도"));
  row.program = dashIfEmpty(pick(raw, "프로세스"));
  row.device = dashIfEmpty(pick(raw, "장비 이름"));
  row.mac = dashIfEmpty(pick(raw, "MAC"));
  row.grp = dashIfEmpty(pick(raw, "사용자 그룹"));
  row.con_reason = dashIfEmpty(pick(raw, "사용자 접속 사유"));
  row.realname = dashIfEmpty(pick(raw, "사용자 이름"));
  row.country = dashIfEmpty(pick(raw, "출발지 국가", "국가"));
  row.country_dst = dashIfEmpty(pick(raw, "목적지 국가"));
  row.sent_pkts = dashIfEmpty(pick(raw, "발신 패킷 수"));
  row.sent_bytes = dashIfEmpty(pick(raw, "발신 바이트 수"));
  row.rcv_pkts = dashIfEmpty(pick(raw, "수신 패킷 수"));
  row.rcv_bytes = dashIfEmpty(pick(raw, "수신 바이트 수"));
  row.from_zone = dashIfEmpty(pick(raw, "출발지 Zone"));
  row.to_zone = dashIfEmpty(pick(raw, "목적지 Zone"));
  if (logType === "uauth") {
    row.result = parseAuthResult(row.msg);
  }
  return finish(row);
}

export function displayEndpoint(ip: string, port: string): string {
  if (ip === "-" && port === "-") return "-";
  if (port === "-" || port === "0") return ip;
  return `${ip}:${port}`;
}

export function listValue(type: LogType, row: CanonicalRow, key: string): string {
  if (type === "session" && key === "src") return displayEndpoint(row.src, row.src_port);
  if (type === "session" && key === "dst") return displayEndpoint(row.dst, row.dst_port);
  const value = (row as unknown as Record<string, unknown>)[key];
  if (value == null || value === "") return "-";
  return String(value);
}
