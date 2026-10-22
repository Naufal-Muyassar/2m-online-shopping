import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";

const input = "mt-1 w-full rounded-md border px-3 py-2";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(identifier, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Masuk</h1>
        <label className="block text-sm">
          No. HP / Email
          <input className={input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
        </label>
        <label className="block text-sm">
          Password
          <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={pending} className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60">
          {pending ? "Masuk…" : "Masuk"}
        </button>
        <p className="text-center text-sm">
          Belum punya akun?{" "}
          <Link to="/register" state={{ from }} className="text-primary underline">
            Daftar
          </Link>
        </p>
      </form>
    </main>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={from} replace />;

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await register({ name: form.name, phone: form.phone, email: form.email || undefined, password: form.password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Daftar</h1>
        <label className="block text-sm">
          Nama
          <input className={input} value={form.name} onChange={set("name")} autoComplete="name" required />
        </label>
        <label className="block text-sm">
          No. HP
          <input className={input} value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" required />
        </label>
        <label className="block text-sm">
          Email (opsional)
          <input type="email" className={input} value={form.email} onChange={set("email")} autoComplete="email" />
        </label>
        <label className="block text-sm">
          Password (min. 8 karakter)
          <input type="password" className={input} value={form.password} onChange={set("password")} minLength={8} autoComplete="new-password" required />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={pending} className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-60">
          {pending ? "Mendaftar…" : "Daftar"}
        </button>
        <p className="text-center text-sm">
          Sudah punya akun?{" "}
          <Link to="/login" state={{ from }} className="text-primary underline">
            Masuk
          </Link>
        </p>
      </form>
    </main>
  );
}
