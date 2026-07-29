"use client";

/**
 * Interactive bar chart with hover tooltips — Client Component.
 * Used for detailed flow timeline views.
 */

import { useState } from "react";

type BarItem = {
  label: string;
  value: number;
  detail?: string;
};

type Props = {
  data: BarItem[];
  height?: number;
  bipolar?: boolean;
  className?: string;
};

export function BarChartInteractive({
  data,
  height = 140,
  bipolar = true,
  className = "",
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const barWidth = Math.max(6, Math.floor(100 / data.length) - 1);
  const gap = 1;
  const svgWidth = data.length * (barWidth + gap);
  const chartHeight = height - 20; // reserve space for tooltip
  const midY = bipolar ? chartHeight / 2 : chartHeight;

  const hoveredItem = hovered !== null ? data[hovered] : null;

  function formatValue(v: number): string {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    return v.toLocaleString();
  }

  return (
    <div className={`relative ${className}`}>
      {/* Tooltip */}
      <div className="flex h-5 items-center justify-between font-mono text-[0.625rem]">
        {hoveredItem ? (
          <>
            <span className="text-muted">{hoveredItem.label}</span>
            <span
              className={
                hoveredItem.value >= 0 ? "text-gain" : "text-loss"
              }
            >
              {hoveredItem.value >= 0 ? "+" : ""}
              {formatValue(hoveredItem.value)}
              {hoveredItem.detail ? ` ${hoveredItem.detail}` : ""}
            </span>
          </>
        ) : (
          <span className="text-muted">Hover to inspect</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: chartHeight }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Zero line */}
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
          const isActive = hovered === i;
          const baseColor = item.value >= 0 ? "var(--color-gain)" : "var(--color-loss)";

          const y = bipolar
            ? item.value >= 0
              ? midY - absH
              : midY
            : chartHeight - absH;

          return (
            <g key={i}>
              {/* Invisible wider hit area for hover */}
              <rect
                x={x - gap / 2}
                y={0}
                width={barWidth + gap}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(absH, 0.5)}
                fill={baseColor}
                opacity={isActive ? 1 : 0.7}
                rx={1}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
