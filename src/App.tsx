import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { Highlight } from "./components/Highlight";
import { SearchResults } from "./components/SearchResults";
import { Timeline } from "./components/Timeline";
import { classifyOpenedFile } from "./lib/classify";
import { filesFromDataTransfer, filesFromFileList } from "./lib/files";
import { toBytes, formatBytes } from "./lib/bytes";
import { buildCsv, defaultExportName } from "./lib/exportCsv";
import { hasActiveFilters } from "./lib/filters";
import { glossaryFor } from "./lib/glossary";
import { listValue, type CanonicalRow } from "./lib/ingest";
import { DETAIL_LABELS, LOG_TYPE_LABELS, presetFor } from "./lib/mappings";
import { loadSettings, resolveTheme, saveSettings } from "./lib/settings";
import type {
  ClassifiedFile,
  ExportEncoding,
  LogType,
  LogTypeOrUnknown,
  OpenedFile,
  QueryFilters,
  Settings,
} from "./lib/types";
import { LOG_TYPES } from "./lib/types";
import { Workspace, emptyCounts } from "./lib/workspace";

type Screen = "start" | "preview" | "workspace";

const DETAIL_KEYS: Array<keyof CanonicalRow> = [
  "time", "stime", "etime", "src", "dst", "src_port", "dst_port", "protocol",
  "act", "rule_id", "vd_id", "uname", "atype", "severity", "program", "device",
  "result", "mac", "grp", "con_reason", "realname", "country", "country_dst",
  "nat_src", "nat_dst", "sent_pkts", "sent_bytes", "rcv_pkts", "rcv_bytes",
  "from_zone", "to_zone", "sess_id", "spi", "vpn_type", "prof_id", "facility",
  "pid", "uid", "msg",
];

function isElectron(): boolean {
  return Boolean(window.axgate?.isElectron);
}

async function normalizeOpened(files: OpenedFile[]): Promise<OpenedFile[]> {
  return files.map((f) => ({ ...f, bytes: toBytes(f.bytes) }));
}

async function saveBytes(name: string, data: Uint8Array): Promise<void> {
  if (window.axgate?.saveFile) {
    await window.axgate.saveFile({ defaultName: name, data, encodingLabel: "csv" });
    return;
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy.buffer as ArrayBuffer], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window === "undefined" ? { theme: "system", density: "comfortable", pageSize: 100 } : loadSettings(),
  );
  const theme = resolveTheme(settings.theme);
  const [screen, setScreen] = useState<Screen>("start");
  const [pending, setPending] = useState<ClassifiedFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeType, setActiveType] = useState<LogTypeOrUnknown>("session");
  const [filters, setFilters] = useState<QueryFilters>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawFields, setRawFields] = useState<Record<string, unknown> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exactMatch, setExactMatch] = useState(false);
  const [searchMode, setSearchMode] = useState<"off" | "grouped" | "typed">("off");
  const [exportEnc, setExportEnc] = useState<ExportEncoding>("utf-8-bom");
  const [dragging, setDragging] = useState(false);
  const [forceType, setForceType] = useState<LogTypeOrUnknown | "">("");
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => workspace?.counts() ?? emptyCounts(), [workspace]);
  const stats = useMemo(() => workspace?.stats() ?? { files: 0, rows: 0, bytes: 0 }, [workspace]);
  const pageSize = settings.pageSize;
  const groupedView = searchMode === "grouped" && Boolean(debouncedSearch);
  const queryFilters: QueryFilters = useMemo(
    () => ({
      ...filters,
      keyword: debouncedSearch || null,
      exact: exactMatch,
    }),
    [filters, debouncedSearch, exactMatch],
  );
  const query = useMemo(() => {
    if (!workspace || groupedView) return null;
    return workspace.query(activeType, queryFilters, page, pageSize);
  }, [workspace, activeType, queryFilters, page, pageSize, groupedView]);

  const rows = query?.rows ?? [];
  const total = query?.total ?? 0;
  const unfiltered = counts[activeType] ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visibleRows = rows;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = settings.density;
  }, [theme, settings.density]);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!showRaw || !selected || !workspace) {
      setRawFields(null);
      return;
    }
    setRawFields(workspace.getRawJson(Number(selected.id)));
  }, [showRaw, selected, workspace]);

  useEffect(() => {
    if (!debouncedSearch) {
      if (searchMode !== "off") setSearchMode("off");
      return;
    }
    if (searchMode === "typed") return;
    setSearchMode("grouped");
    setPage(1);
    setSelected(null);
  }, [debouncedSearch, searchMode]);

  const classifyAll = useCallback(async (opened: OpenedFile[], forced?: LogTypeOrUnknown | "") => {
    const files = await normalizeOpened(opened);
    const classified = files.map((file) => {
      const item = classifyOpenedFile(file);
      if (forced) {
        item.logType = forced;
        item.confidence = "high";
        item.reason = `사용자가 ${LOG_TYPE_LABELS[forced]}(으)로 지정`;
      }
      return item;
    });
    if (classified.length === 0) {
      setError("불러올 .adb / .csv 파일이 없습니다.");
      return;
    }
    setError(null);
    setPending(classified);
    setScreen("preview");
  }, []);

  const onPickBrowserFiles = async (list: FileList | null, folder = false) => {
    if (!list || list.length === 0) return;
    void folder;
    await classifyAll(await filesFromFileList(list), forceType);
  };

  const openFolder = async () => {
    if (window.axgate?.openFolder) {
      const result = await window.axgate.openFolder();
      if (!result) return;
      await classifyAll(result.files as OpenedFile[], forceType);
      return;
    }
    folderInput.current?.click();
  };

  const openFiles = async () => {
    if (window.axgate?.openFiles) {
      const result = await window.axgate.openFiles();
      if (!result) return;
      await classifyAll(result as OpenedFile[], forceType);
      return;
    }
    fileInput.current?.click();
  };

  const loadDevSamples = async () => {
    const names = [
      "session.2026.09.04.00000.01.adb",
      "system.2026.08.06.00000.04.adb",
      "audit.2026.09.04.00000.00.adb",
      "ipsec.2026.08.06.00000.00.adb",
      "ssl.2026.09.04.00000.00.adb",
      "uauth.2026.09.04.00000.00.adb",
      "Audit.csv",
      "Authentication.csv",
      "Session.csv",
      "SSL_VPN.csv",
      "System (6).csv",
    ];
    const opened: OpenedFile[] = [];
    for (const name of names) {
      const url = `/@fs${encodeURI(`/Users/jyjang/orca/projects/axgate_log_viewer/adb_ex/${name}`)}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      opened.push({ name, bytes: new Uint8Array(await res.arrayBuffer()) });
    }
    await classifyAll(opened, forceType);
  };

  const confirmImport = async () => {
    setBusy("파일을 읽고 있습니다…");
    try {
      workspace?.close();
      const ws = await Workspace.create();
      for (let i = 0; i < pending.length; i += 1) {
        const file = pending[i]!;
        setBusy(`${i + 1}/${pending.length} ${file.name}`);
        await ws.ingest(file);
        file.bytes = new Uint8Array();
        await new Promise((r) => setTimeout(r, 0));
      }
      setPending([]);
      const nextCounts = ws.counts();
      const first = (["session", "system", "audit", "uauth", "ssl", "ipsec", "unknown"] as LogTypeOrUnknown[])
        .find((t) => nextCounts[t] > 0) ?? "session";
      setWorkspace(ws);
      setActiveType(first);
      setFilters({});
      setPage(1);
      setSelected(null);
      setSearch("");
      setDebouncedSearch("");
      setSearchMode("off");
      setScreen("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const resetToStart = () => {
    workspace?.close();
    setWorkspace(null);
    setPending([]);
    setSelected(null);
    setSearch("");
    setDebouncedSearch("");
    setSearchMode("off");
    setScreen("start");
  };

  const exportCurrent = async () => {
    if (!workspace) return;
    const dataRows = workspace.exportRows(activeType, queryFilters);
    const bytes = buildCsv(activeType, dataRows, exportEnc);
    await saveBytes(defaultExportName(activeType), bytes);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFolder();
      }
      if (meta && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setSelected(null);
        if (searchMode === "grouped") {
          setSearch("");
          setDebouncedSearch("");
          setSearchMode("off");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const platform = window.axgate?.platform ?? (navigator.platform.startsWith("Mac") ? "darwin" : "browser");
  const traffic = platform === "darwin" && isElectron();

  return (
    <div className="app">
      <header className={`titlebar ${traffic ? "" : "no-traffic"}`}>
        <div className="brand">
          <span className="brand-mark">AX</span>
          AXGATE 로그 뷰어
        </div>
        {screen === "workspace" && (
          <div className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
            <input
              ref={searchRef}
              placeholder="통합 검색 (메시지, IP, 사용자)"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchMode(e.target.value.trim() ? "grouped" : "off");
              }}
            />
            <label className="exact-toggle">
              <input
                type="checkbox"
                checked={exactMatch}
                onChange={(e) => setExactMatch(e.target.checked)}
              />
              정확히 일치
            </label>
          </div>
        )}
        <div className="title-actions">
          {screen === "workspace" && (
            <>
              <button className="btn" onClick={() => void exportCurrent()}>내보내기</button>
              <button className="btn" onClick={resetToStart}>폴더 열기</button>
            </>
          )}
          <button className="btn ghost" onClick={() => setSettingsOpen(true)}>설정</button>
          {isElectron() && platform !== "darwin" && (
            <div className="win-controls">
              <button type="button" onClick={() => window.axgate?.minimize?.()}>–</button>
              <button type="button" onClick={() => window.axgate?.maximize?.()}>□</button>
              <button type="button" className="close" onClick={() => window.axgate?.close?.()}>×</button>
            </div>
          )}
        </div>
      </header>

      {screen === "start" && (
        <div className="screen start">
          <div
            className={`start-card ${dragging ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragging(false);
              await classifyAll(await filesFromDataTransfer(e.dataTransfer), forceType);
            }}
          >
            <h1>방화벽 로그를 열어보세요</h1>
            <p>
              `.adb` 백업과 장비 UI에서 내보낸 `.csv`를 같은 화면에서 조회합니다.
              폴더를 통째로 열거나 파일을 끌어다 놓으면 로그 종류를 자동으로 판별합니다.
            </p>
            <div className="start-actions">
              <button className="btn primary" onClick={() => void openFolder()}>폴더 열기</button>
              <button className="btn" onClick={() => void openFiles()}>파일 열기</button>
              {import.meta.env.DEV && (
                <button className="btn" onClick={() => void loadDevSamples()}>샘플 불러오기</button>
              )}
              <select
                className="retype"
                value={forceType}
                onChange={(e) => setForceType(e.target.value as LogTypeOrUnknown | "")}
                aria-label="종류를 지정해서 가져오기"
              >
                <option value="">자동 판별 (기본)</option>
                {LOG_TYPES.map((t) => (
                  <option key={t} value={t}>{LOG_TYPE_LABELS[t]} 지정해서 가져오기</option>
                ))}
                <option value="unknown">원본 그대로 (제네릭)</option>
              </select>
            </div>
            <div className="hint">드래그 앤 드롭도 지원합니다. 원본 파일은 읽기만 하며, 로그는 이 기기를 벗어나지 않습니다.</div>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {screen === "preview" && (
        <div className="screen preview">
          <h2>가져오기 미리보기</h2>
          <p className="sub">{pending.length}개 파일 감지됨 — 종류가 틀리면 재지정한 뒤 가져오세요.</p>
          <table className="preview-table">
            <thead>
              <tr>
                <th>파일명</th>
                <th>형식</th>
                <th>추정 로그종류</th>
                <th>신뢰도</th>
                <th>재지정</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((file) => (
                <tr key={file.id}>
                  <td>
                    <div>{file.name}</div>
                    <div className="hint">{file.reason}{file.warning ? ` · ${file.warning}` : ""}</div>
                  </td>
                  <td>{file.format.toUpperCase()}</td>
                  <td>{LOG_TYPE_LABELS[file.logType]}</td>
                  <td>
                    <span className={`badge ${file.confidence}`}>
                      {file.confidence === "high" ? "자동 인식" : file.confidence === "low" ? "확인 필요" : "미확인"}
                    </span>
                  </td>
                  <td>
                    <select
                      className="retype"
                      value={file.logType}
                      onChange={(e) => {
                        const logType = e.target.value as LogTypeOrUnknown;
                        setPending((prev) => prev.map((p) => p.id === file.id ? { ...p, logType, confidence: "high", reason: "사용자 지정" } : p));
                      }}
                    >
                      {LOG_TYPES.map((t) => <option key={t} value={t}>{LOG_TYPE_LABELS[t]}</option>)}
                      <option value="unknown">알 수 없음</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="preview-actions">
            <button className="btn" onClick={resetToStart}>취소</button>
            <button className="btn primary" onClick={() => void confirmImport()}>가져오기</button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {screen === "workspace" && workspace && (
        <div className={`workspace ${selected ? "with-detail" : ""}`}>
          <aside className="sidebar">
            <div className="side-list">
              {LOG_TYPES.map((t) => (
                <button
                  key={t}
                  className={`side-item ${activeType === t && !groupedView ? "active" : ""} ${counts[t] === 0 ? "zero" : ""}`}
                  onClick={() => {
                    setActiveType(t);
                    setSearchMode(debouncedSearch ? "typed" : "off");
                    setPage(1);
                    setSelected(null);
                    setFilters(debouncedSearch ? { keyword: debouncedSearch, exact: exactMatch } : {});
                  }}
                >
                  <span>{LOG_TYPE_LABELS[t]}</span>
                  <span className="count">{counts[t].toLocaleString()}</span>
                </button>
              ))}
              {counts.unknown > 0 && (
                <button
                  className={`side-item ${activeType === "unknown" && !groupedView ? "active" : ""}`}
                  onClick={() => {
                    setActiveType("unknown");
                    setSearchMode(debouncedSearch ? "typed" : "off");
                    setPage(1);
                    setSelected(null);
                    setFilters(debouncedSearch ? { keyword: debouncedSearch, exact: exactMatch } : {});
                  }}
                >
                  <span>알 수 없음</span>
                  <span className="count">{counts.unknown.toLocaleString()}</span>
                </button>
              )}
            </div>
            <div className="side-foot">
              <button className="btn" style={{ width: "100%" }} onClick={() => setSettingsOpen(true)}>설정</button>
            </div>
          </aside>
          <section className="main">
            {workspace.isGeneric(activeType) && !groupedView && (
              <div className="banner">이 로그 형식은 자동 인식되지 않아 원본 그대로 표시 중입니다.</div>
            )}
            {groupedView ? (
              <div className="table-wrap">
                <SearchResults
                  workspace={workspace}
                  keyword={debouncedSearch}
                  exact={exactMatch}
                  onOpenType={(type) => {
                    setActiveType(type);
                    setSearchMode("typed");
                    setPage(1);
                    setSelected(null);
                    setFilters({ keyword: debouncedSearch, exact: exactMatch });
                  }}
                />
              </div>
            ) : (
              <>
                <FilterBar
                  logType={activeType}
                  filters={queryFilters}
                  options={(column) => workspace.distinct(activeType, column)}
                  onChange={(next) => {
                    setFilters(next);
                    setPage(1);
                    if (!next.keyword) {
                      setSearch("");
                      setDebouncedSearch("");
                      setSearchMode("off");
                    }
                  }}
                />
                <Timeline
                  workspace={workspace}
                  logType={activeType}
                  filters={queryFilters}
                  onBrush={(fromEpoch, toEpoch) => {
                    setFilters((f) => ({ ...f, fromEpoch, toEpoch }));
                    setPage(1);
                  }}
                />
                <div className="table-wrap">
                  {visibleRows.length === 0 ? (
                    <div className="empty">
                      <h3>
                        {hasActiveFilters(queryFilters)
                          ? `조건에 맞는 ${LOG_TYPE_LABELS[activeType]} 로그가 없습니다`
                          : `이 기간 동안 기록된 ${LOG_TYPE_LABELS[activeType]} 로그가 없습니다`}
                      </h3>
                      <p>다른 종류를 선택하거나 필터를 초기화해 보세요.</p>
                    </div>
                  ) : (
                    <table className="logs">
                      <thead>
                        <tr>
                          {presetFor(activeType).map((col) => (
                            <th
                              key={col.key}
                              style={col.width ? { width: col.width } : undefined}
                              title={glossaryFor(col.label)}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => {
                          const type = (row.log_type as LogTypeOrUnknown) ?? activeType;
                          const cols = presetFor(activeType);
                          const id = String(row.id);
                          return (
                            <tr key={id} className={selected && String(selected.id) === id ? "selected" : ""} onClick={() => setSelected(row)}>
                              {cols.map((col) => {
                                const value = listValue(type === "unknown" ? "system" : type as LogType, row as unknown as CanonicalRow, col.key);
                                if (col.key === "act" || col.key === "result" || col.key === "severity") {
                                  const tone = col.key === "act" ? String(row.act_tone ?? "neutral") : value === "실패" || value === "오류" ? "danger" : value === "성공" ? "ok" : "neutral";
                                  return <td key={col.key}><span className={`tone ${tone}`}><Highlight text={value} query={debouncedSearch} /></span></td>;
                                }
                                return (
                                  <td key={col.key} className={col.key === "msg" ? "cell-msg" : undefined}>
                                    <Highlight text={value} query={debouncedSearch} />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
            <div className="status">
              <span>
                {groupedView
                  ? `통합 검색 ‘${debouncedSearch}’`
                  : hasActiveFilters(queryFilters)
                    ? `${LOG_TYPE_LABELS[activeType]} ${unfiltered.toLocaleString()}건 중 ${total.toLocaleString()}건 표시`
                    : `${LOG_TYPE_LABELS[activeType]} ${total.toLocaleString()}건`}
                {query ? ` · ${query.elapsedMs}ms` : ""}
                {` · 파일 ${stats.files}개 · ${formatBytes(stats.bytes)}`}
              </span>
              {!groupedView && (
                <div className="pager">
                  <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
                  <span>{page} / {pages}</span>
                  <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>다음</button>
                </div>
              )}
            </div>
          </section>
          {selected && (
            <aside className="detail">
              <header>
                <h3>상세</h3>
                <div>
                  <button className="btn ghost" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "해석값" : "원시값"}</button>
                  <button className="btn ghost" onClick={() => setSelected(null)}>닫기</button>
                </div>
              </header>
              <div className="detail-body">
                {DETAIL_KEYS.map((key) => {
                  const value = String((selected as unknown as CanonicalRow)[key] ?? "-");
                  if (value === "-" || value === "") return null;
                  return (
                    <div className="kv" key={key}>
                      <span title={glossaryFor(DETAIL_LABELS[key] ?? key)}>{DETAIL_LABELS[key] ?? key}</span>
                      <b><Highlight text={value} query={debouncedSearch} /></b>
                    </div>
                  );
                })}
                {showRaw && rawFields && (
                  <>
                    <div className="kv"><span>원시 JSON</span><b /></div>
                    {Object.entries(rawFields).map(([k, v]) => (
                      <div className="kv" key={k}>
                        <span>{k}</span>
                        <b>{String(v)}</b>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      )}

      {settingsOpen && (
        <div className="modal-back" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>설정</h2>
            <label className="field">테마
              <select value={settings.theme} onChange={(e) => setSettings((s) => ({ ...s, theme: e.target.value as Settings["theme"] }))}>
                <option value="system">OS 설정 따르기</option>
                <option value="light">라이트</option>
                <option value="dark">다크</option>
              </select>
            </label>
            <label className="field">밀도
              <select value={settings.density} onChange={(e) => setSettings((s) => ({ ...s, density: e.target.value as Settings["density"] }))}>
                <option value="comfortable">기본</option>
                <option value="compact">조밀</option>
              </select>
            </label>
            <label className="field">페이지 크기
              <select value={settings.pageSize} onChange={(e) => setSettings((s) => ({ ...s, pageSize: Number(e.target.value) }))}>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
            <label className="field">CSV 내보내기 인코딩
              <select value={exportEnc} onChange={(e) => setExportEnc(e.target.value as ExportEncoding)}>
                <option value="utf-8-bom">UTF-8 (BOM, 엑셀 호환)</option>
                <option value="utf-16le">UTF-16LE (장비 UI와 동일)</option>
              </select>
            </label>
            <p className="hint">이 앱은 방화벽 로그를 외부로 전송하지 않으며, 원본 .adb/.csv 파일은 수정하지 않습니다.</p>
            <div className="preview-actions">
              <button className="btn primary" onClick={() => setSettingsOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="modal-back"><div className="modal"><h2>{busy}</h2></div></div>
      )}

      <input ref={fileInput} type="file" multiple accept=".adb,.csv,text/csv" hidden
        onChange={(e) => void onPickBrowserFiles(e.target.files)} />
      <input ref={folderInput} type="file" multiple hidden
        onChange={(e) => void onPickBrowserFiles(e.target.files, true)} />
    </div>
  );
}
