import { describe, expect, it } from "vitest";
import { hashString } from "./hash";
import { ingestCsvRow } from "./ingest";

describe("dedup key", () => {
  it("is stable for the same raw row", () => {
    const a = ingestCsvRow("audit", "s1", 0, { 시간: "2026-09-04 11:00:00", 메시지: "logout" });
    const b = ingestCsvRow("audit", "s2", 9, { 시간: "2026-09-04 11:00:00", 메시지: "logout" });
    expect(a.dedup_key).toBe(b.dedup_key);
    expect(a.dedup_key.length).toBe(16);
  });

  it("differs when the raw payload differs", () => {
    const a = ingestCsvRow("system", "s", 0, { 시간: "2026-09-04 11:00:00", 프로세스: "httpd", 메시지: "start" });
    const b = ingestCsvRow("system", "s", 1, { 시간: "2026-09-04 11:00:00", 프로세스: "httpd", 메시지: "stop" });
    expect(a.dedup_key).not.toBe(b.dedup_key);
  });

  it("hashes the same string to the same value", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
});
