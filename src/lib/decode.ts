export function toUint32(n: number): number {
  return n >>> 0;
}

export function ipv4FromLeInt(n: number): string {
  const u = toUint32(n);
  return `${u & 0xff}.${(u >>> 8) & 0xff}.${(u >>> 16) & 0xff}.${(u >>> 24) & 0xff}`;
}

export function ipv4FromBeInt(n: number): string {
  const u = toUint32(n);
  return `${(u >>> 24) & 0xff}.${(u >>> 16) & 0xff}.${(u >>> 8) & 0xff}.${u & 0xff}`;
}

function wordToBytes(n: number, endian: "le" | "be"): number[] {
  const u = toUint32(n);
  if (endian === "le") {
    return [u & 0xff, (u >>> 8) & 0xff, (u >>> 16) & 0xff, (u >>> 24) & 0xff];
  }
  return [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff];
}

export function ipv6FromWords(words: number[], endian: "le" | "be"): string {
  const hextets: string[] = [];
  for (const word of words) {
    const bytes = wordToBytes(word, endian);
    hextets.push(((bytes[0]! << 8) | bytes[1]!).toString(16));
    hextets.push(((bytes[2]! << 8) | bytes[3]!).toString(16));
  }
  return compressIpv6(hextets);
}

function compressIpv6(hextets: string[]): string {
  const norm = hextets.map((h) => h.replace(/^0+(?=\w)/, "") || "0");
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < norm.length) {
    if (norm[i] !== "0") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < norm.length && norm[j] === "0") j += 1;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  if (bestLen < 2) return norm.join(":");
  const head = norm.slice(0, bestStart).join(":");
  const tail = norm.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

export function decodeIp(opts: {
  ipVer?: number | null;
  beWords?: Array<number | null | undefined>;
  leWords?: Array<number | null | undefined>;
  emptyAsDash?: boolean;
}): string {
  const ver = opts.ipVer ?? 4;
  const be = (opts.beWords ?? []).map((v) => (typeof v === "number" ? v : 0));
  const le = (opts.leWords ?? []).map((v) => (typeof v === "number" ? v : 0));
  const primary = be.some((v) => v !== 0) ? be : le;
  const endian: "be" | "le" = be.some((v) => v !== 0) ? "be" : "le";
  const allZero = primary.length === 0 || primary.every((v) => v === 0);

  if (allZero) return opts.emptyAsDash === false ? "0.0.0.0" : "-";
  if (ver === 6 && primary.length >= 4) {
    return ipv6FromWords(primary.slice(0, 4), endian);
  }
  const first = primary[0] ?? 0;
  return endian === "be" ? ipv4FromBeInt(first) : ipv4FromLeInt(first);
}

export function formatEpochSeconds(n: unknown): string {
  if (n == null || n === "" || n === 0 || n === "0" || n === "-") return "-";
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num) || num <= 0) return String(n);
  const d = new Date(num * 1000);
  if (Number.isNaN(d.getTime())) return String(n);
  return formatLocalDateTime(d);
}

export function formatLocalDateTime(d: Date): string {
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseDateTimeToEpoch(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const s = String(value).trim();
  if (!s || s === "-") return null;
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/,
  );
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  return Math.floor(d.getTime() / 1000);
}

export function dashIfEmpty(value: unknown): string {
  if (value == null) return "-";
  const s = String(value).trim();
  return s === "" ? "-" : s;
}

export function unknownCode(value: unknown): string {
  return `코드 ${String(value)} (알 수 없음)`;
}

export function parseAuthResult(message: string): string {
  const s = message.toLowerCase();
  if (s.includes("login") && (s.includes("success") || s.includes("ok"))) {
    return "성공";
  }
  if (
    s.includes("fail") ||
    s.includes("denied") ||
    s.includes("invalid") ||
    s.includes("error")
  ) {
    return "실패";
  }
  if (s.includes("logout")) return "로그아웃";
  if (s.includes("timeout")) return "타임아웃";
  return dashIfEmpty(message) === "-" ? "-" : "기타";
}
