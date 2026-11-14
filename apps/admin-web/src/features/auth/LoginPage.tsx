import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(identifier, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between bg-rail p-12 text-rail-foreground lg:flex">
        <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-md bg-rail-foreground text-base font-extrabold tracking-tight text-rail">
          2M
        </span>
        <p className="t-display">2M Admin</p>
        <span aria-hidden="true" className="h-px w-16 bg-rail-foreground/40" />
      </aside>
      <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-8 px-4 py-10 sm:px-6">
        <p className="flex items-center gap-3 text-lg font-extrabold tracking-tight lg:hidden">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-rail text-sm text-rail-foreground">
            2M
          </span>
          2M Admin
        </p>
        <form onSubmit={onSubmit} className="flex animate-rise flex-col gap-5">
          <h1 className="t-headline border-t border-foreground pt-5">Masuk</h1>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Email / No. HP</span>
            <input className="field" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Password</span>
            <input
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="alert-box" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending} className="btn btn-primary btn-lg btn-block">
            {pending ? "Masuk…" : "Masuk"}
          </button>
        </form>
      </main>
    </div>
  );
}
