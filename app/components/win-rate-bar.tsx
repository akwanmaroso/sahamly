/**
 * Horizontal win rate progress bar — Server Component.
 * Green fill for wins, red remainder for losses.
 */

type Props = {
  winRate: number; // 0 to 100
  label?: string;
  className?: string;
};

export function WinRateBar({ winRate, label, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(100, winRate));

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <span className="shrink-0 font-mono text-[0.625rem] text-muted">{label}</span>
      )}
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${clamped}%`,
            backgroundColor:
              clamped >= 60 ? "var(--color-gain)" : clamped >= 40 ? "var(--color-amber)" : "var(--color-loss)",
          }}
        />
      </div>
      <span
        className={`shrink-0 font-mono text-xs font-semibold ${
          clamped >= 60 ? "text-gain" : clamped >= 40 ? "text-amber" : "text-loss"
        }`}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  );
}
