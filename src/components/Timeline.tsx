import { useState } from "react";
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
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  if (!range.min || !range.max) return null;
  const size = pickBucketSeconds(range.min, range.max);
  const bars = workspace.histogram(logType, filters);
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.count), 1);
  const width = 100;
  const barW = Math.max(width / bars.length, 0.4);

  const indexFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * width;
    return Math.max(0, Math.min(bars.length - 1, Math.floor(x / barW)));
  };

  const applyRange = (a: number, b: number) => {
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const start = bars[from];
    const end = bars[to];
    if (!start || !end) return;
    onBrush(start.bucket, end.bucket + size - 1);
  };

  return (
    <div className="timeline" title="막대를 클릭하거나 드래그하면 해당 시간 구간으로 필터됩니다">
      <svg
        viewBox={`0 0 ${width} 28`}
        preserveAspectRatio="none"
        role="img"
        aria-label="시간대별 로그량"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const i = indexFromEvent(e);
          setDrag({ start: i, end: i });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          setDrag({ ...drag, end: indexFromEvent(e) });
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          const end = indexFromEvent(e);
          applyRange(drag.start, end);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {bars.map((bar, i) => {
          const h = Math.max(1, (bar.count / max) * 26);
          const lo = drag ? Math.min(drag.start, drag.end) : -1;
          const hi = drag ? Math.max(drag.start, drag.end) : -1;
          const dragging = drag && i >= lo && i <= hi;
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
              className={dragging || active ? "tl-bar on" : "tl-bar"}
            >
              <title>{`${bar.count}건`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
