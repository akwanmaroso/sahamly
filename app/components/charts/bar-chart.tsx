/**
 * SVG vertical bar chart — Server Component.
 * Used for foreign flow, leaderboards, score comparisons.
 */

type BarItem = {
  label: string;
  value: number;
  color?: string;
};

type Props = {
  data: BarItem[];
  height?: number;
  showLabels?: boolean;
  showValues?: boolean;
  /** If true, bars go up/down from zero line (for pos/neg data) */
  bipolar?: boolean;
  className?: string;
};

export function BarChart({
  data,
  height = 120,
  showLabels = false,
  showValues = false,
  bipolar = false,
  className = "",
}: Props) {
  if (data.length === 0) return null;

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const barWidth = Math.max(4, Math.floor(100 / data.length) - 1);
  const gap = 1;
  const svgWidth = data.length * (barWidth + gap);
  const labelHeight = showLabels ? 16 : 0;
  const valueHeight = showValues ? 14 : 0;
  const chartHeight = height - labelHeight - valueHeight;
  const midY = bipolar ? chartHeight / 2 : chartHeight;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      role="img"
      aria-label="Bar chart"
    >
      {/* Zero line for bipolar charts */}
      {bipolar && (
        <line
          x1={0}
          y1={midY}
          x2={svgWidth}
          y2={midY}
          stroke="var(--color-line)"
          strokeWidth={0.5}
        />
      )}

      {data.map((item, i) => {
        const x = i * (barWidth + gap);
        const absH = (Math.abs(item.value) / maxAbs) * (bipolar ? midY : chartHeight);
        const barColor = item.color ?? (item.value >= 0 ? "var(--color-gain)" : "var(--color-loss)");

        const y = bipolar
          ? item.value >= 0
            ? midY - absH
            : midY
          : chartHeight - absH;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(absH, 0.5)}
              fill={barColor}
              rx={1}
            >
              <title>{`${item.label}: ${item.value.toLocaleString()}`}</title>
            </rect>
            {showLabels && (
              <text
                x={x + barWidth / 2}
                y={chartHeight + labelHeight}
                textAnchor="middle"
                fill="var(--color-muted)"
                fontSize={6}
                fontFamily="var(--font-mono)"
              >
                {item.label.slice(-5)}
              </text>
            )}
            {showValues && (
              <text
                x={x + barWidth / 2}
                y={y - 2}
                textAnchor="middle"
                fill="var(--color-muted)"
                fontSize={5}
                fontFamily="var(--font-mono)"
              >
                {Math.abs(item.value) > 1e9
                  ? `${(item.value / 1e9).toFixed(1)}B`
                  : Math.abs(item.value) > 1e6
                    ? `${(item.value / 1e6).toFixed(0)}M`
                    : item.value.toLocaleString()}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Horizontal bar chart for leaderboards (e.g., foreign flow ranked by ticker).
 */
type HBarItem = {
  label: string;
  value: number;
  sublabel?: string;
};

export function HorizontalBarChart({
  data,
  className = "",
}: {
  data: HBarItem[];
  className?: string;
}) {
  if (data.length === 0) return null;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {data.map((item, i) => {
        const pct = Math.abs(item.value) / maxAbs;
        const isPositive = item.value >= 0;

        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-12 shrink-0 font-mono text-xs font-semibold text-ink">
              {item.label}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-surface-2">
              <div
                className="absolute inset-y-0 rounded-sm transition-all"
                style={{
                  width: `${Math.max(pct * 100, 2)}%`,
                  left: isPositive ? 0 : undefined,
                  right: isPositive ? undefined : 0,
                  backgroundColor: isPositive ? "var(--color-gain)" : "var(--color-loss)",
                  opacity: 0.7,
                }}
              />
              <span className="absolute inset-y-0 right-1.5 flex items-center font-mono text-[0.625rem] text-ink">
                {Math.abs(item.value) > 1e9
                  ? `${(item.value / 1e9).toFixed(1)}B`
                  : Math.abs(item.value) > 1e6
                    ? `${(item.value / 1e6).toFixed(0)}M`
                    : item.value.toLocaleString()}
              </span>
            </div>
            {item.sublabel && (
              <span className="shrink-0 text-[0.625rem] text-muted">{item.sublabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
