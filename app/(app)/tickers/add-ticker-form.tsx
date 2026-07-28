"use client";

import { useActionState, useRef, useState, useEffect, useCallback } from "react";
import { addTicker } from "./actions";

type StockResult = { code: string; name: string; sector: string };

export function AddTickerForm() {
  const [state, action, pending] = useActionState(addTicker, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResult[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StockResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset after successful submit
  useEffect(() => {
    if (!pending && !state?.error) {
      setQuery("");
      setSelected(null);
      setResults([]);
      formRef.current?.reset();
    }
  }, [pending, state]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/idx-stocks?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: StockResult[] = await res.json();
          setResults(data);
          setOpen(data.length > 0);
        }
      } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);
    search(val);
  }

  function handleSelect(stock: StockResult) {
    setSelected(stock);
    setQuery(`${stock.code} — ${stock.name}`);
    setOpen(false);
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 border border-line bg-surface p-4 sm:flex-row sm:items-end"
    >
      {selected && (
        <>
          <input type="hidden" name="symbol" value={selected.code} />
          <input type="hidden" name="name" value={selected.name} />
          <input type="hidden" name="sector" value={selected.sector} />
        </>
      )}

      <div ref={containerRef} className="relative flex flex-1 flex-col gap-1.5">
        <label
          htmlFor="stock-search"
          className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase"
        >
          Search stock
        </label>
        <input
          id="stock-search"
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Type code or name, e.g. BBCA"
          autoComplete="off"
          className="border-b border-line bg-transparent px-1 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
        />
        {loading && (
          <span className="absolute right-1 bottom-2 font-mono text-xs text-muted">
            searching...
          </span>
        )}

        {open && (
          <ul className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto border border-line bg-bg shadow-lg">
            {results.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
                >
                  <span className="font-mono font-semibold text-ink">{c.code}</span>
                  <span className="flex-1 truncate text-ink">{c.name}</span>
                  {c.sector && (
                    <span className="shrink-0 text-xs text-muted">{c.sector}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !selected}
        className="rounded border border-amber/50 px-4 py-1.5 text-sm font-medium text-amber transition-colors hover:bg-amber hover:text-bg disabled:opacity-50"
      >
        {pending ? "Adding..." : "Add ticker"}
      </button>

      {state?.error && <p className="text-sm text-loss sm:basis-full">{state.error}</p>}
    </form>
  );
}
