import { Highlight } from "./Highlight";
import { listValue, type CanonicalRow } from "../lib/ingest";
import { LOG_TYPE_LABELS, SEARCH_PRESET } from "../lib/mappings";
import type { LogType, LogTypeOrUnknown } from "../lib/types";
import type { Workspace } from "../lib/workspace";

interface Props {
  workspace: Workspace;
  keyword: string;
  exact: boolean;
  onOpenType: (type: LogTypeOrUnknown) => void;
}

export function SearchResults({ workspace, keyword, exact, onOpenType }: Props) {
  const groups = workspace.searchGrouped(keyword, exact);
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  if (groups.length === 0) {
    return (
      <div className="empty">
        <h3>‘{keyword}’에 해당하는 로그가 없습니다</h3>
        <p>다른 검색어를 입력하거나 정확히 일치 옵션을 해제해 보세요.</p>
      </div>
    );
  }
  return (
    <div className="search-groups">
      <p className="sub">통합 검색 결과 {total.toLocaleString()}건 — 그룹을 누르면 해당 로그 화면으로 이동합니다.</p>
      {groups.map((group) => {
        const samples = workspace.query(group.logType, { keyword, exact }, 1, 5).rows;
        return (
          <section key={group.logType} className="search-group">
            <button type="button" className="search-group-head" onClick={() => onOpenType(group.logType)}>
              <strong>{LOG_TYPE_LABELS[group.logType]}</strong>
              <span>{group.count.toLocaleString()}건</span>
            </button>
            <table className="logs compact-preview">
              <thead>
                <tr>
                  {SEARCH_PRESET.filter((c) => c.key !== "log_type").map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map((row) => {
                  const type = (row.log_type as LogTypeOrUnknown) ?? group.logType;
                  return (
                    <tr key={String(row.id)} onClick={() => onOpenType(type)}>
                      {SEARCH_PRESET.filter((c) => c.key !== "log_type").map((col) => {
                        const value = listValue(
                          type === "unknown" ? "system" : (type as LogType),
                          row as unknown as CanonicalRow,
                          col.key,
                        );
                        return (
                          <td key={col.key} className={col.key === "msg" ? "cell-msg" : undefined}>
                            <Highlight text={value} query={keyword} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
