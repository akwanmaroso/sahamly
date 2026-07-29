"use client";

/**
 * Dual-axis chart: price line + volume bars — Client Component.
 * Used for volume vs price overlay in flow timeline.
 */

import { useState } from "react";

type DataPoint = {
  label: string;
  price: number;
  volume: number;
};

type Props = {
  data: DataPoint[];
  height?: number;
  className?: string;
};

export function DualAxisChart({
  data,
  height = 160,
  className = "",
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (data.length < 2) return null;

  const prices = data.map((d) => d.price);
  const volumes = data.map((d) => d.volume);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const maxVol = Math.max(...volumes, 1);

  const padding = 2;
  const tooltipH = 20;
  const chartH = height - tooltipH;
  const svgWidth = 300;
  const barWidth = Math.max(4, Math.floor(svgWidth / data.length) - 1);
  const gap = 1;

  const hoveredItem = hovered !== null ? data[hovered] : null;

  // Price line points
  const pricePoints = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (svgWidth - padding * 2);
    const y = padding + (1 - (d.price - minPrice) / priceRange) * (chartH - padding * 2);
    return { x, y };
  });
  const pricePath = pricePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className={`relative ${className}`}>
      {/* Tooltip */}
      <div className="flex h-5 items-center justify-between font-mono text-[0.625rem]">
        {hoveredItem ? (
          <>
            <span className="text-muted">{hoveredItem.label}</span>
            <span className="flex gap-3">
              <span className="text-amber">
                Rp {hoveredItem.price.toLocaleString()}
              </span>
              <span className="text-muted">
                Vol: {hoveredItem.volume > 1e6 ? `${(hoveredItem.volume / 1e6).toFixed(0)}M` : hoveredItem.volume.toLocaleString()}
              </span>
            </span>
          </>
        ) : (
          <span className="text-muted">Hover to inspect</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${svgWidth} ${chartH}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: chartH }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Volume bars (background) */}
        {data.map((d, i) => {
          const x = i * (barWidth + gap);
          const barH = (d.volume / maxVol) * chartH * 0.4; // 40% max height
          const isActive = hovered === i;

          return (
            <g key={`vol-${i}`}>
              <rect
                x={x}
                y={0}
                width={barWidth + gap}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
              <rect
                x={x}
                y={chartH - barH}
                width={barWidth}
                height={barH}
                fill="var(--color-muted)"
                opacity={isActive ? 0.3 : 0.12}
                rx={1}
              />
            </g>
          );
        })}

        {/* Price line */}
        <path
          d={pricePath}
          fill="none"
          stroke="var(--color-amber)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover dot on price */}
        {hovered !== null && pricePoints[hovered] && (
          <circle
            cx={pricePoints[hovered].x}
            cy={pricePoints[hovered].y}
            r={3}
            fill="var(--color-amber)"
          />
        )}
      </svg>
    </div>
  );
}
