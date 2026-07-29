import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { getTickersWithLatestReport } from "@/lib/tickers/get-tickers-with-latest-report";
import { VerdictBadge } from "@/app/components/verdict-badge";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tickers } = await getTickersWithLatestReport();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-0.5">
          <span className="font-display text-2xl font-extrabold tracking-tight text-ink">SAHAMLY</span>
          <span className="cursor-blink font-display text-2xl font-extrabold text-amber" aria-hidden>
            _
          </span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-5">
          <span className="hidden font-mono text-xs text-muted md:inline">{user?.email}</span>
          <Link href="/screener" className="text-sm font-medium text-ink hover:text-amber">
            Screener
          </Link>
          <Link href="/compare" className="text-sm font-medium text-ink hover:text-amber">
            Compare
          </Link>
          <Link href="/tickers" className="text-sm font-medium text-ink hover:text-amber">
            Watchlist
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-amber hover:text-amber"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <nav
        aria-label="Watchlist tape"
        className="flex items-center gap-px overflow-x-auto border-b border-line bg-bg px-2 [scrollbar-width:thin]"
      >
        {tickers.length === 0 && (
          <span className="px-4 py-2 font-mono text-xs text-muted">No tickers yet</span>
        )}
        {tickers.map((ticker) => (
          <Link
            key={ticker.id}
            href={`/tickers/${ticker.id}`}
            className="flex shrink-0 items-center gap-2 border-r border-line/60 px-4 py-2 transition-colors hover:bg-surface"
          >
            <span className="font-mono text-xs font-medium text-ink">{ticker.symbol}</span>
            <VerdictBadge verdict={ticker.reports[0]?.verdict} compact />
          </Link>
        ))}
      </nav>

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
