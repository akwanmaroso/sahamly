/**
 * SVG sparkline/area chart — Server Component.
 * Used for trend visualization (whale score, price, etc.)
 */

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  showZeroLine?: boolean;
  className?: string;
};

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--color-amber)",
  fillOpacity = 0.15,
  showZeroLine = false,
  className = "",
}: Props) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // Zero line position
  const zeroY = min >= 0
    ? height - padding
    : max <= 0
      ? padding
      : padding + (1 - (0 - min) / range) * (height - padding * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`${className}`}
      style={{ width, height }}
      role="img"
      aria-label="Sparkline"
    >
      {showZeroLine && (
        <line
          x1={0}
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke="var(--color-line)"
          strokeWidth={0.5}
          strokeDasharray="2,2"
        />
      )}
      <path d={areaPath} fill={color} opacity={fillOpacity} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={2}
        fill={color}
      />
    </svg>
  );
}
