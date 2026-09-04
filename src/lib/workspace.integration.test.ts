import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { classifyOpenedFile } from "./classify";
import { setWasmLocator } from "./sqlite";
import { Workspace } from "./workspace";

const EX = join(process.cwd(), "adb_ex");

function load(name: string) {
  return new Uint8Array(readFileSync(join(EX, name)));
}

describe("workspace ingest of sample files", () => {
  beforeAll(() => {
    setWasmLocator(() =>
      pathToFileURL(join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm")).href,
    );
  });

  it("loads session.adb with decoded IPs and 3781 rows", async () => {
    const ws = await Workspace.create();
    const classified = classifyOpenedFile({
      name: "session.2026.09.04.00000.01.adb",
      bytes: load("session.2026.09.04.00000.01.adb"),
    });
    const meta = await ws.ingest(classified);
    expect(meta.rowCount).toBe(3781);
    expect(ws.counts().session).toBe(3781);
    const page = ws.query("session", {}, 1, 5);
    expect(page.total).toBe(3781);
    expect(page.rows[0]?.src).toMatch(/^\d+\.\d+\.\d+\.\d+/);
    const sample = page.rows.find((r) => String(r.src).startsWith("192.168.1.177"));
    expect(sample).toBeTruthy();
    expect(String(sample?.dst)).toContain("10.20.10.255");
    expect(sample?.act).toBe("차단");
    expect(sample?.protocol).toBe("udp");
    ws.close();
  });

  it("loads system.adb and system CSV without failing empty types", async () => {
    const ws = await Workspace.create();
    await ws.ingest(
      classifyOpenedFile({
        name: "system.2026.08.06.00000.04.adb",
        bytes: load("system.2026.08.06.00000.04.adb"),
      }),
    );
    await ws.ingest(
      classifyOpenedFile({
        name: "audit.2026.09.04.00000.00.adb",
        bytes: load("audit.2026.09.04.00000.00.adb"),
      }),
    );
    await ws.ingest(
      classifyOpenedFile({
        name: "Audit.csv",
        bytes: load("Audit.csv"),
      }),
    );
    expect(ws.counts().system).toBe(1263);
    expect(ws.counts().audit).toBeGreaterThan(0);
    const audit = ws.query("audit", { keyword: "logout" }, 1, 10);
    expect(audit.total).toBeGreaterThan(0);
    ws.close();
  });

  it("filters session rows by source IP", async () => {
    const ws = await Workspace.create();
    await ws.ingest(
      classifyOpenedFile({
        name: "session.2026.09.04.00000.01.adb",
        bytes: load("session.2026.09.04.00000.01.adb"),
      }),
    );
    const page = ws.query("session", { srcIp: "192.168.1.177" }, 1, 20);
    expect(page.total).toBeGreaterThan(0);
    expect(page.rows.every((r) => String(r.src).includes("192.168.1.177"))).toBe(true);
    ws.close();
  });

  it("filters session by destination port and groups unified search", async () => {
    const ws = await Workspace.create();
    await ws.ingest(
      classifyOpenedFile({
        name: "session.2026.09.04.00000.01.adb",
        bytes: load("session.2026.09.04.00000.01.adb"),
      }),
    );
    await ws.ingest(
      classifyOpenedFile({
        name: "Audit.csv",
        bytes: load("Audit.csv"),
      }),
    );
    const byPort = ws.query("session", { dstPort: "3871" }, 1, 10);
    expect(byPort.total).toBeGreaterThan(0);
    expect(byPort.rows.every((r) => String(r.dst_port).includes("3871"))).toBe(true);

    const grouped = ws.searchGrouped("192.168.1.177");
    expect(grouped.some((g) => g.logType === "session" && g.count > 0)).toBe(true);

    const ipHits = ws.search("192.168.1.177");
    expect(ipHits.length).toBeGreaterThan(0);
    expect(String(ipHits[0]?.src)).toContain("192.168.1.177");

    const exactMiss = ws.search("192.168", true);
    expect(exactMiss.length).toBe(0);
    const logout = ws.searchGrouped("logout");
    expect(logout.some((g) => g.logType === "audit" && g.count > 0)).toBe(true);
    ws.close();
  });

  it("skips duplicate CSV rows that overlap across files", async () => {
    const ws = await Workspace.create();
    const file = {
      name: "Audit.csv",
      bytes: load("Audit.csv"),
    };
    const first = await ws.ingest(classifyOpenedFile(file));
    const second = await ws.ingest(classifyOpenedFile({ ...file, name: "Audit (1).csv" }));
    expect(first.rowCount).toBeGreaterThan(0);
    expect(second.rowCount).toBe(0);
    expect(ws.counts().audit).toBe(first.rowCount);
    ws.close();
  });
});
