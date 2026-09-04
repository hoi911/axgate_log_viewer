export type DetectedEncoding = "utf-16le" | "utf-8";

export interface ParsedCsv {
  encoding: DetectedEncoding;
  delimiter: "\t" | ",";
  headers: string[];
  rows: Record<string, string>[];
}

export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return "utf-8";
}

export function decodeText(bytes: Uint8Array): { text: string; encoding: DetectedEncoding } {
  const encoding = detectEncoding(bytes);
  const decoder = new TextDecoder(encoding === "utf-16le" ? "utf-16le" : "utf-8");
  let text = decoder.decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding };
}

export function detectDelimiter(sampleLine: string): "\t" | "," {
  const tabs = (sampleLine.match(/\t/g) ?? []).length;
  const commas = (sampleLine.match(/,/g) ?? []).length;
  return tabs >= commas ? "\t" : ",";
}

function parseCsvRecords(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && rows.length === 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

export function parseCsv(bytes: Uint8Array): ParsedCsv {
  const { text, encoding } = decodeText(bytes);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const records = parseCsvRecords(text, delimiter);
  if (records.length === 0) {
    return { encoding, delimiter, headers: [], rows: [] };
  }
  const rawHeaders = records[0] ?? [];
  const headers: string[] = [];
  for (const h of rawHeaders) {
    const name = h.replace(/^\uFEFF/, "").trim();
    if (name === "" && headers.length > 0) continue;
    if (name !== "") headers.push(name);
  }
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const rec = records[i] ?? [];
    if (rec.every((cell) => cell.trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (rec[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { encoding, delimiter, headers, rows };
}

export function previewCsv(bytes: Uint8Array, maxLines = 3): string[] {
  const { text } = decodeText(bytes);
  return text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .slice(0, maxLines);
}
