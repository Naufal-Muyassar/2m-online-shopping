import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSession } from "./session";
import { errorMessage } from "@/lib/api";
import { FaSignInAlt } from "react-icons/fa";

export function LoginPage() {
  const { user, login } = useSession();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "field h-14 text-lg";

  return (
    <div className="app-shell-plain">
      <main className="flex flex-1 flex-col justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-lg bg-hero text-xl font-bold text-primary-foreground shadow-glow">
            2M
          </span>
          <h1 className="text-3xl font-bold">2M Kurir</h1>
          {user && <p className="text-sm text-muted-foreground">Sedang masuk sebagai {user.name}.</p>}
        </div>
        <form onSubmit={onSubmit} className="card flex animate-rise flex-col gap-4">
          <h2 className="text-xl font-bold">Masuk</h2>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Nomor HP
            <input
              className={inputClass}
              inputMode="tel"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Kata sandi
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="alert-box">
              {error}
            </p>
          )}
          <Button type="submit" variant="hero" loading={submitting}>
            <FaSignInAlt aria-hidden="true" className="mr-2 inline" />
            Masuk
          </Button>
        </form>
        <p className="notice">
          Pasang aplikasi di iPhone: ketuk <strong>Bagikan → Tambah ke Layar Utama</strong>.
        </p>
      </main>
    </div>
  );
}
