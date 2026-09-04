import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyOpenedFile, looksLikeSqlite, scoreHeaders } from "./classify";
import { parseCsv } from "./csv";

const EX = join(process.cwd(), "adb_ex");

function load(name: string) {
  return new Uint8Array(readFileSync(join(EX, name)));
}

describe("CSV header classification", () => {
  it("classifies the five sample CSVs with high confidence", () => {
    const cases: Array<[string, string]> = [
      ["Session.csv", "session"],
      ["Audit.csv", "audit"],
      ["Authentication.csv", "uauth"],
      ["System (6).csv", "system"],
      ["SSL_VPN.csv", "ssl"],
    ];
    for (const [name, type] of cases) {
      const parsed = parseCsv(load(name));
      const scored = scoreHeaders(parsed.headers);
      expect(scored.logType, name).toBe(type);
      const file = classifyOpenedFile({ name, bytes: load(name) });
      expect(file.logType).toBe(type);
      expect(file.format).toBe("csv");
      expect(file.confidence).toBe("high");
    }
  });

  it("decodes UTF-16LE tab-separated Session.csv", () => {
    const parsed = parseCsv(load("Session.csv"));
    expect(parsed.encoding).toBe("utf-16le");
    expect(parsed.delimiter).toBe("\t");
    expect(parsed.headers).toContain("정책 ID");
    expect(parsed.headers).toContain("출발지");
    expect(parsed.headers.at(-1)).not.toBe("");
    expect(parsed.rows[0]?.["동작"]).toBe("drop");
    expect(parsed.rows[0]?.["출발지"]).toBe("192.168.1.177");
  });
});

describe("ADB classification", () => {
  it("recognizes sqlite magic and filename hints", () => {
    const bytes = load("session.2026.09.04.00000.01.adb");
    expect(looksLikeSqlite(bytes)).toBe(true);
    const file = classifyOpenedFile({
      name: "session.2026.09.04.00000.01.adb",
      bytes,
    });
    expect(file.format).toBe("adb");
    expect(file.logType).toBe("session");
    expect(file.confidence).toBe("high");
  });
});
