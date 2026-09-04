import { COLUMN_PRESETS, DETAIL_LABELS, UNKNOWN_PRESET } from "./mappings";
import { listValue, type CanonicalRow } from "./ingest";
import type { ExportEncoding, LogType, LogTypeOrUnknown } from "./types";

function rowAsCanonical(row: Record<string, unknown>): CanonicalRow {
  return row as unknown as CanonicalRow;
}

export function buildCsv(
  logType: LogTypeOrUnknown,
  rows: Record<string, unknown>[],
  encoding: ExportEncoding,
): Uint8Array {
  const preset = logType === "unknown" ? UNKNOWN_PRESET : COLUMN_PRESETS[logType as LogType];
  const headers = preset.map((c) => c.label);
  const lines = [headers.join("\t")];
  for (const raw of rows) {
    const row = rowAsCanonical(raw);
    const type = (raw.log_type as LogTypeOrUnknown) ?? logType;
    const cells = preset.map((c) => {
      if (type === "unknown") return escapeCell(String(raw[c.key] ?? "-"));
      return escapeCell(listValue(type, row, c.key));
    });
    lines.push(cells.join("\t"));
  }
  const text = lines.join("\r\n") + "\r\n";
  if (encoding === "utf-16le") {
    return encodeUtf16Le(text, true);
  }
  const utf8 = new TextEncoder().encode(text);
  const out = new Uint8Array(utf8.length + 3);
  out[0] = 0xef;
  out[1] = 0xbb;
  out[2] = 0xbf;
  out.set(utf8, 3);
  return out;
}

function escapeCell(value: string): string {
  if (/[\t\r\n"]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function encodeUtf16Le(text: string, bom: boolean): Uint8Array {
  const out = new Uint8Array((text.length + (bom ? 1 : 0)) * 2);
  let offset = 0;
  if (bom) {
    out[0] = 0xff;
    out[1] = 0xfe;
    offset = 2;
  }
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[offset] = code & 0xff;
    out[offset + 1] = code >> 8;
    offset += 2;
  }
  return out;
}

export function defaultExportName(logType: LogTypeOrUnknown): string {
  const label = logType === "unknown" ? "unknown" : logType;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${label}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
}

export { DETAIL_LABELS };
