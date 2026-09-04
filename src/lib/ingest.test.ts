import { describe, expect, it } from "vitest";
import { ingestAdbRow, ingestCsvRow } from "./ingest";

describe("ingest mapping", () => {
  it("does not treat session deny messages as auth 결과", () => {
    const csv = ingestCsvRow("session", "s", 0, {
      "시작 시간": "2026-09-04 11:01:17",
      출발지: "192.168.1.177",
      목적지: "10.20.10.255",
      동작: "drop",
      프로토콜: "udp",
      메시지: "Session denied (in:eth0-0[untrust]->out:eth0-0[untrust])",
    });
    expect(csv.act).toBe("차단");
    expect(csv.result).toBe("-");
    expect(csv.src).toBe("192.168.1.177");

    const adb = ingestAdbRow("session", "s", 0, {
      ltime: 1788447606,
      act: 1,
      protocol: 17,
      ip_src: -1062731343,
      ip_dst: 169085695,
      sport: 3871,
      dport: 3871,
      msg: "Session denied (in:eth0-0[untrust]->out:eth0-0[untrust])",
    });
    expect(adb.act).toBe("차단");
    expect(adb.protocol).toBe("udp");
    expect(adb.src).toBe("192.168.1.177");
    expect(adb.dst).toBe("10.20.10.255");
    expect(adb.result).toBe("-");
  });

  it("parses uauth login success as 성공", () => {
    const row = ingestCsvRow("uauth", "s", 0, {
      시간: "2026-09-03 10:38:45",
      "사용자 ID": "jyjang",
      메시지: "login: success (local) (os: Windows 11 Pro x64)",
    });
    expect(row.result).toBe("성공");
  });
});
