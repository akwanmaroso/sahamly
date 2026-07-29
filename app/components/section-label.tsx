/**
 * Section label with horizontal rule — Server Component.
 * Extracted for reuse across dashboard, ticker detail, compare pages.
 */

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs font-semibold tracking-[0.2em] text-muted uppercase">
        {children}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}
