const VERDICT_META: Record<string, { glyph: string; className: string; borderClassName: string }> = {
  Accumulate: { glyph: "▲", className: "text-gain", borderClassName: "border-l-gain" },
  Hold: { glyph: "●", className: "text-hold", borderClassName: "border-l-hold" },
  Watch: { glyph: "◆", className: "text-amber", borderClassName: "border-l-amber" },
  Avoid: { glyph: "▼", className: "text-loss", borderClassName: "border-l-loss" },
};

/** Left-edge accent color for board rows — falls back to a quiet neutral when there's no report yet. */
export function verdictAccentClass(verdict: string | null | undefined): string {
  return (verdict && VERDICT_META[verdict]?.borderClassName) || "border-l-line";
}

/**
 * Verdict is always shown as glyph + word, never color alone — the glyph
 * carries the meaning for anyone who can't distinguish the colors.
 */
export function VerdictBadge({
  verdict,
  compact = false,
}: {
  verdict: string | null | undefined;
  compact?: boolean;
}) {
  const meta = verdict ? VERDICT_META[verdict] : undefined;

  if (!meta) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
        <span aria-hidden>·</span>
        {!compact && "No report yet"}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium ${meta.className}`}>
      <span aria-hidden>{meta.glyph}</span>
      {!compact && <span className="tracking-wide uppercase">{verdict}</span>}
    </span>
  );
}
