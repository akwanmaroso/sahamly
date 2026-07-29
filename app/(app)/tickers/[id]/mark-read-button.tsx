"use client";

import { useTransition } from "react";
import { markAllSignalsRead } from "./actions";

export function MarkAllReadButton({ tickerId }: { tickerId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => markAllSignalsRead(tickerId))}
      className="font-mono text-[0.6rem] text-muted hover:text-ink disabled:opacity-50"
    >
      {pending ? "Marking..." : "Mark all read"}
    </button>
  );
}
