import { describe, expect, it } from "vitest";
import { applyColumnFilters, applyKeyword, escapeLike, filterChips, filtersFor } from "./filters";

describe("filter engine", () => {
  it("defines the PLAN2 column filters per log type", () => {
    expect(filtersFor("session").some((f) => f.kind === "text" && f.key === "dstPort")).toBe(true);
    expect(filtersFor("audit").some((f) => f.kind === "select" && f.key === "atype")).toBe(true);
    expect(filtersFor("uauth").some((f) => f.kind === "select" && f.key === "result")).toBe(true);
    expect(filtersFor("system").some((f) => f.kind === "combo" && f.key === "program")).toBe(true);
    expect(filtersFor("ssl").some((f) => f.kind === "text" && f.key === "msgContains")).toBe(true);
  });

  it("combines column filters with AND and escapes LIKE wildcards", () => {
    const { where, params } = applyColumnFilters({
      srcIp: "192.168.1.177",
      dstPort: "443",
      action: "차단",
      protocol: "udp",
    });
    expect(where.join(" AND ")).toContain("src LIKE");
    expect(where.join(" AND ")).toContain("act = ?");
    expect(where.join(" AND ")).toContain("AND");
    expect(params).toContain("차단");
    expect(params).toContain("%192.168.1.177%");
    expect(escapeLike("100%_")).toBe("100\\%\\_");
  });

  it("builds partial vs exact keyword clauses", () => {
    const partial = applyKeyword("Denied");
    expect(partial.where[0]).toContain("search_text LIKE");
    expect(partial.params[0]).toBe("%denied%");

    const exact = applyKeyword("jyjang", true);
    expect(exact.where[0]).toContain("LOWER(uname) = ?");
    expect(exact.params.every((p) => p === "jyjang")).toBe(true);

    expect(applyKeyword("  ").where).toEqual([]);
  });

  it("emits chips for active filters", () => {
    const chips = filterChips("session", {
      action: "차단",
      srcIp: "10.0.0.1",
      keyword: "denied",
    });
    expect(chips.map((c) => c.label)).toEqual(["출발지 IP", "동작", "검색어"]);
  });
});
