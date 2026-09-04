import { datetimeLocalToEpoch, epochToDatetimeLocal } from "../lib/bytes";
import { filterChips, filtersFor, type FilterControl } from "../lib/filters";
import { glossaryFor } from "../lib/glossary";
import type { FilterPreset, LogTypeOrUnknown, QueryFilters } from "../lib/types";
import type { DistinctColumn } from "../lib/filters";

interface Props {
  logType: LogTypeOrUnknown;
  filters: QueryFilters;
  options: (column: DistinctColumn) => string[];
  onChange: (next: QueryFilters) => void;
  presets?: FilterPreset[];
  onSavePreset?: (name: string) => void;
  onLoadPreset?: (name: string) => void;
}

function patch(filters: QueryFilters, key: keyof QueryFilters, value: string): QueryFilters {
  return { ...filters, [key]: value || null };
}

export function FilterBar({
  logType,
  filters,
  options,
  onChange,
  presets = [],
  onSavePreset,
  onLoadPreset,
}: Props) {
  const specs = filtersFor(logType);
  const chips = filterChips(logType, filters);

  return (
    <div className="filter-block">
      <div className="filters">
        {specs.map((spec) => (
          <FilterControlView
            key={spec.kind === "daterange" ? "daterange" : spec.key}
            spec={spec}
            filters={filters}
            options={options}
            onChange={onChange}
          />
        ))}
        <button
          className="btn"
          type="button"
          onClick={() => onChange({ keyword: filters.keyword, exact: filters.exact })}
        >
          필터 초기화
        </button>
        {onSavePreset && (
          <button
            className="btn"
            type="button"
            onClick={() => {
              const name = window.prompt("프리셋 이름");
              if (name?.trim()) onSavePreset(name.trim());
            }}
          >
            프리셋 저장
          </button>
        )}
        {presets.length > 0 && onLoadPreset && (
          <label>프리셋
            <select
              value=""
              onChange={(e) => {
                const name = e.target.value;
                if (name) onLoadPreset(name);
              }}
            >
              <option value="">불러오기</option>
              {presets.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {chips.length > 0 && (
        <div className="chips" aria-label="적용된 필터">
          {chips.map((chip) => (
            <button
              key={String(chip.key)}
              type="button"
              className="chip"
              onClick={() => onChange({ ...filters, [chip.key]: null })}
            >
              {chip.label}: {chip.value} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterControlView({
  spec,
  filters,
  options,
  onChange,
}: {
  spec: FilterControl;
  filters: QueryFilters;
  options: (column: DistinctColumn) => string[];
  onChange: (next: QueryFilters) => void;
}) {
  if (spec.kind === "daterange") {
    return (
      <>
        <label title={glossaryFor("시작")}>시작
          <input
            type="datetime-local"
            value={epochToDatetimeLocal(filters.fromEpoch)}
            onChange={(e) => onChange({ ...filters, fromEpoch: datetimeLocalToEpoch(e.target.value) })}
          />
        </label>
        <label title={glossaryFor("종료")}>종료
          <input
            type="datetime-local"
            value={epochToDatetimeLocal(filters.toEpoch)}
            onChange={(e) => onChange({ ...filters, toEpoch: datetimeLocalToEpoch(e.target.value, true) })}
          />
        </label>
      </>
    );
  }
  const value = typeof filters[spec.key] === "string" ? String(filters[spec.key]) : "";
  if (spec.kind === "text") {
    return (
      <label title={glossaryFor(spec.label)}>{spec.label}
        <input
          value={value}
          onChange={(e) => onChange(patch(filters, spec.key, e.target.value))}
        />
      </label>
    );
  }
  if (spec.kind === "combo") {
    const listId = `combo-${spec.column}`;
    return (
      <label title={glossaryFor(spec.label)}>{spec.label}
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(patch(filters, spec.key, e.target.value))}
        />
        <datalist id={listId}>
          {options(spec.column).map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </label>
    );
  }
  return (
    <label title={glossaryFor(spec.label)}>{spec.label}
      <select
        value={value}
        onChange={(e) => onChange(patch(filters, spec.key, e.target.value))}
      >
        <option value="">전체</option>
        {options(spec.column).map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
