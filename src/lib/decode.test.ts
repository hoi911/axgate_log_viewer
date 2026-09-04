import { describe, expect, it } from "vitest";
import {
  formatEpochSeconds,
  ipv4FromBeInt,
  ipv4FromLeInt,
  parseAuthResult,
  parseDateTimeToEpoch,
  decodeIp,
} from "./decode";
import { mapAct, mapProtocol, mapSeverity } from "./mappings";

describe("IP endian decoding", () => {
  it("decodes the PLAN.md sample 192.168.1.177 from both field encodings", () => {
    expect(ipv4FromLeInt(-1325291328)).toBe("192.168.1.177");
    expect(ipv4FromBeInt(-1062731343)).toBe("192.168.1.177");
  });

  it("decodes destination 10.20.10.255 from both field encodings", () => {
    expect(ipv4FromLeInt(-16116726)).toBe("10.20.10.255");
    expect(ipv4FromBeInt(169085695)).toBe("10.20.10.255");
  });

  it("prefers big-endian ip_src when both word sets exist", () => {
    expect(
      decodeIp({
        ipVer: 4,
        beWords: [-1062731343, 0, 0, 0],
        leWords: [-1325291328, 0, 0, 0],
      }),
    ).toBe("192.168.1.177");
  });

  it("renders zero addresses as dash by default", () => {
    expect(decodeIp({ beWords: [0, 0, 0, 0], leWords: [0, 0, 0, 0] })).toBe("-");
  });
});

describe("time", () => {
  it("formats the sample epoch as a local datetime", () => {
    const formatted = formatEpochSeconds(1788447606);
    expect(formatted).toMatch(/^2026-09-0[34] \d{2}:\d{2}:\d{2}$/);
  });

  it("parses CSV timestamps as local time", () => {
    expect(parseDateTimeToEpoch("2026-09-04 11:01:17")).toBe(
      Math.floor(new Date(2026, 8, 4, 11, 1, 17).getTime() / 1000),
    );
  });

  it("treats 0 / '-' as empty", () => {
    expect(formatEpochSeconds(0)).toBe("-");
    expect(parseDateTimeToEpoch("-")).toBeNull();
  });
});

describe("code mappings", () => {
  it("maps session act=1 to 차단", () => {
    expect(mapAct(1).label).toBe("차단");
    expect(mapAct("drop").label).toBe("차단");
    expect(mapAct("accept").label).toBe("허용");
    expect(mapAct(99).label).toBe("코드 99 (알 수 없음)");
  });

  it("maps IANA protocol numbers and syslog severity", () => {
    expect(mapProtocol(17)).toBe("udp");
    expect(mapProtocol(6)).toBe("tcp");
    expect(mapProtocol(99)).toBe("코드 99 (알 수 없음)");
    expect(mapSeverity(6)).toBe("정보");
    expect(mapSeverity("warning")).toBe("경고");
  });

  it("parses auth result from free-text messages", () => {
    expect(parseAuthResult("login: success (local)")).toBe("성공");
    expect(parseAuthResult("logout: timeout")).toBe("로그아웃");
    expect(parseAuthResult("authentication failed")).toBe("실패");
  });
});
