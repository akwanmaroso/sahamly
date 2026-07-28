import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 bg-bg px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-baseline gap-0.5">
          <span className="font-display text-3xl font-extrabold tracking-tight text-ink">SAHAMLY</span>
          <span className="cursor-blink font-display text-3xl font-extrabold text-amber" aria-hidden>
            _
          </span>
        </div>
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Private research terminal</p>
      </div>
      <LoginForm />
    </div>
  );
}
