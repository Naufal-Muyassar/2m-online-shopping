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
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm animate-rise space-y-4 p-6 shadow-md">
        <h1 className="text-2xl font-bold">Masuk</h1>
        <label className="field-label block">
          Email / No. HP
          <input
            className="field mt-1"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="field-label block">
          Password
          <input
            type="password"
            className="field mt-1"
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
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-md bg-primary px-3 py-2 font-bold text-primary-foreground hover:bg-primary-pressed disabled:opacity-60"
        >
          {pending ? "Masuk…" : "Masuk"}
        </button>
      </form>
    </main>
  );
}
