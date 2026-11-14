import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";

const fieldGroup = "flex flex-col gap-1.5";

function Wordmark({ onInk = false }: { onInk?: boolean }) {
  return (
    <p className="flex items-center gap-3 text-lg font-extrabold tracking-tight">
      <span
        aria-hidden="true"
        className={`flex size-10 items-center justify-center rounded-md text-sm ${onInk ? "bg-rail-foreground text-rail" : "bg-rail text-rail-foreground"}`}
      >
        2M
      </span>
      2M Sembako
    </p>
  );
}

// Wide screens split into an ink brand panel and the form; phones show the form under the wordmark.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-rail p-12 text-rail-foreground lg:flex xl:p-16">
        <Wordmark onInk />
        <p className="t-display max-w-lg">Sembako harian, diantar ke rumah</p>
        <span aria-hidden="true" className="h-px w-16 bg-rail-foreground/40" />
      </aside>
      <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-8 px-4 py-10 sm:px-6">
        <div className="lg:hidden">
          <Wordmark />
        </div>
        {children}
      </main>
    </div>
  );
}

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
    <AuthShell>
      <form onSubmit={onSubmit} className="flex animate-rise flex-col gap-5">
        <h1 className="t-headline border-t border-foreground pt-5">Masuk</h1>
        <label className={fieldGroup}>
          <span className="field-label">No. HP / Email</span>
          <input className="field" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
        </label>
        <label className={fieldGroup}>
          <span className="field-label">Password</span>
          <input type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="alert-box">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary btn-lg btn-block">
          {pending ? "Masuk…" : "Masuk"}
        </button>
        <p className="text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link to="/register" state={{ from }} className="link min-h-0">
            Daftar
          </Link>
        </p>
      </form>
    </AuthShell>
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
    <AuthShell>
      <form onSubmit={onSubmit} className="flex animate-rise flex-col gap-5">
        <h1 className="t-headline border-t border-foreground pt-5">Daftar</h1>
        <label className={fieldGroup}>
          <span className="field-label">Nama</span>
          <input className="field" value={form.name} onChange={set("name")} autoComplete="name" required />
        </label>
        <label className={fieldGroup}>
          <span className="field-label">No. HP</span>
          <input className="field" value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" required />
        </label>
        <label className={fieldGroup}>
          <span className="field-label">Email (opsional)</span>
          <input type="email" className="field" value={form.email} onChange={set("email")} autoComplete="email" />
        </label>
        <label className={fieldGroup}>
          <span className="field-label">Password (min. 8 karakter)</span>
          <input type="password" className="field" value={form.password} onChange={set("password")} minLength={8} autoComplete="new-password" required />
        </label>
        {error && (
          <p role="alert" className="alert-box">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn btn-primary btn-lg btn-block">
          {pending ? "Mendaftar…" : "Daftar"}
        </button>
        <p className="text-sm text-muted-foreground">
          Sudah punya akun?{" "}
          <Link to="/login" state={{ from }} className="link min-h-0">
            Masuk
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
