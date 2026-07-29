"use client";

import { useActionState } from "react";
import { runBacktestAction } from "./actions";

export function BacktestButton({ tickerId }: { tickerId: string }) {
  const [state, action, pending] = useActionState(
    runBacktestAction.bind(null, tickerId),
    undefined
  );

  return (
    <div className="flex items-center gap-3">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-amber/50 hover:text-amber disabled:opacity-50"
        >
          {pending ? "Running backtest…" : "Run backtest"}
        </button>
      </form>
      {state && "error" in state && (
        <span className="text-xs text-loss">{state.error}</span>
      )}
      {state && "success" in state && (
        <span className="text-xs text-gain">{state.rows} signals analyzed</span>
      )}
    </div>
  );
}
