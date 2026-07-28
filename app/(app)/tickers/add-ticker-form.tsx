"use client";

import { useActionState, useRef, useEffect } from "react";
import { addTicker } from "./actions";

export function AddTickerForm() {
  const [state, action, pending] = useActionState(addTicker, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 border border-line bg-surface p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="symbol" className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
          Symbol
        </label>
        <input
          id="symbol"
          name="symbol"
          placeholder="DSNG.JK"
          required
          className="border-b border-line bg-transparent px-1 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="name" className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
          Name
        </label>
        <input
          id="name"
          name="name"
          placeholder="Dharma Satya Nusantara"
          required
          className="border-b border-line bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="sector" className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
          Sector
        </label>
        <input
          id="sector"
          name="sector"
          placeholder="Plantation"
          className="border-b border-line bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-amber"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-amber/50 px-4 py-1.5 text-sm font-medium text-amber transition-colors hover:bg-amber hover:text-bg disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add ticker"}
      </button>
      {state?.error && <p className="text-sm text-loss sm:basis-full">{state.error}</p>}
    </form>
  );
}
