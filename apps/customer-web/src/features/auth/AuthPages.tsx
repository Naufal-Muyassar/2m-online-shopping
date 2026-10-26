import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";

const input = "field";
const primaryBtn = "inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 font-medium text-primary-foreground hover:bg-primary-pressed disabled:opacity-60";

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
    <div className="app-shell-plain">
      <main className="flex flex-1 flex-col justify-center gap-6 p-4">
        <div className="flex flex-col items-center gap-2">
          <span className="avatar h-14 w-14 text-lg shadow-glow">2M</span>
          <p className="text-lg font-bold">2M Sembako</p>
        </div>
        <form onSubmit={onSubmit} className="card animate-rise space-y-4">
          <h1 className="text-2xl font-bold">Masuk</h1>
          <label className="block space-y-1">
            <span className="field-label">No. HP / Email</span>
            <input className={input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </label>
          <label className="block space-y-1">
            <span className="field-label">Password</span>
            <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && (
            <p role="alert" className="alert-box">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Masuk…" : "Masuk"}
          </button>
          <p className="text-center text-sm">
            Belum punya akun?{" "}
            <Link to="/register" state={{ from }} className="font-medium text-accent underline">
              Daftar
            </Link>
          </p>
        </form>
      </main>
    </div>
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
    <div className="app-shell-plain">
      <main className="flex flex-1 flex-col justify-center gap-6 p-4">
        <div className="flex flex-col items-center gap-2">
          <span className="avatar h-14 w-14 text-lg shadow-glow">2M</span>
          <p className="text-lg font-bold">2M Sembako</p>
        </div>
        <form onSubmit={onSubmit} className="card animate-rise space-y-4">
          <h1 className="text-2xl font-bold">Daftar</h1>
          <label className="block space-y-1">
            <span className="field-label">Nama</span>
            <input className={input} value={form.name} onChange={set("name")} autoComplete="name" required />
          </label>
          <label className="block space-y-1">
            <span className="field-label">No. HP</span>
            <input className={input} value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" required />
          </label>
          <label className="block space-y-1">
            <span className="field-label">Email (opsional)</span>
            <input type="email" className={input} value={form.email} onChange={set("email")} autoComplete="email" />
          </label>
          <label className="block space-y-1">
            <span className="field-label">Password (min. 8 karakter)</span>
            <input type="password" className={input} value={form.password} onChange={set("password")} minLength={8} autoComplete="new-password" required />
          </label>
          {error && (
            <p role="alert" className="alert-box">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Mendaftar…" : "Daftar"}
          </button>
          <p className="text-center text-sm">
            Sudah punya akun?{" "}
            <Link to="/login" state={{ from }} className="font-medium text-accent underline">
              Masuk
            </Link>
          </p>
        </form>
      </main>
    </div>
  );
}
