"use client";

import { useActionState } from "react";
import { runPipeline } from "./actions";

export function RefreshButton({ tickerId }: { tickerId: string }) {
  const [state, action, pending] = useActionState(runPipeline.bind(null, tickerId), undefined);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-amber/50 px-3 py-1.5 text-sm font-medium text-amber transition-colors hover:bg-amber hover:text-bg disabled:opacity-50"
        >
          {pending ? "Refreshing…" : "Refresh report"}
        </button>
      </form>
      {state && "error" in state && (
        <p className="max-w-xs text-right text-xs text-loss">{state.error}</p>
      )}
    </div>
  );
}
