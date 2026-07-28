"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex w-full max-w-xs flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="border-b border-line bg-transparent px-1 py-2 text-sm text-ink outline-none focus:border-amber"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-mono text-[0.6875rem] tracking-wide text-muted uppercase">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="border-b border-line bg-transparent px-1 py-2 text-sm text-ink outline-none focus:border-amber"
        />
      </div>
      {state?.error && <p className="text-sm text-loss">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded border border-amber/50 px-4 py-2 text-sm font-medium text-amber transition-colors hover:bg-amber hover:text-bg disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
