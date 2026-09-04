import { EXTRA_COLUMNS, presetFor } from "../lib/mappings";
import type { LogType, LogTypeOrUnknown } from "../lib/types";

interface Props {
  logType: LogTypeOrUnknown;
  hidden: string[];
  extra: string[];
  onChange: (hidden: string[], extra: string[]) => void;
}

export function ColumnPicker({ logType, hidden, extra, onChange }: Props) {
  if (logType === "unknown") return null;
  const type = logType as LogType;
  const base = presetFor(type);
  const extras = EXTRA_COLUMNS[type] ?? [];

  return (
    <details className="column-picker">
      <summary>열</summary>
      <div className="column-picker-menu">
        {base.map((col) => (
          <label key={col.key}>
            <input
              type="checkbox"
              checked={!hidden.includes(col.key)}
              onChange={(e) => {
                const next = e.target.checked
                  ? hidden.filter((k) => k !== col.key)
                  : [...hidden, col.key];
                onChange(next, extra);
              }}
            />
            {col.label}
          </label>
        ))}
        {extras.length > 0 && <hr />}
        {extras.map((col) => (
          <label key={col.key}>
            <input
              type="checkbox"
              checked={extra.includes(col.key)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...extra, col.key]
                  : extra.filter((k) => k !== col.key);
                onChange(hidden, next);
              }}
            />
            {col.label}
          </label>
        ))}
      </div>
    </details>
  );
}
