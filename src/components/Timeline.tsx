import { pickBucketSeconds } from "../lib/filters";
import type { LogTypeOrUnknown, QueryFilters } from "../lib/types";
import type { Workspace } from "../lib/workspace";

interface Props {
  workspace: Workspace;
  logType: LogTypeOrUnknown;
  filters: QueryFilters;
  onBrush: (fromEpoch: number, toEpoch: number) => void;
}

export function Timeline({ workspace, logType, filters, onBrush }: Props) {
  const range = workspace.timeRange(logType);
  if (!range.min || !range.max) return null;
  const size = pickBucketSeconds(range.min, range.max);
  const bars = workspace.histogram(logType, filters);
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.count), 1);
  const width = 100;
  const barW = Math.max(width / bars.length, 0.4);

  return (
    <div className="timeline" title="막대를 클릭하면 해당 시간 구간으로 필터됩니다">
      <svg viewBox={`0 0 ${width} 28`} preserveAspectRatio="none" role="img" aria-label="시간대별 로그량">
        {bars.map((bar, i) => {
          const h = Math.max(1, (bar.count / max) * 26);
          const active =
            Boolean(filters.fromEpoch && filters.toEpoch) &&
            bar.bucket + size - 1 >= (filters.fromEpoch ?? 0) &&
            bar.bucket <= (filters.toEpoch ?? 0);
          return (
            <rect
              key={bar.bucket}
              x={i * barW}
              y={28 - h}
              width={Math.max(barW - 0.15, 0.2)}
              height={h}
              className={active ? "tl-bar on" : "tl-bar"}
              onClick={() => onBrush(bar.bucket, bar.bucket + size - 1)}
            >
              <title>{`${bar.count}건`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
