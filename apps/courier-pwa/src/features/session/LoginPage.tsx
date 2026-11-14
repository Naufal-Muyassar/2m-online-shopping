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
      <main className="flex flex-1 flex-col justify-center gap-8 px-5 py-10">
        <div className="flex flex-col gap-5">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-md bg-rail text-base font-extrabold tracking-tight text-rail-foreground">
            2M
          </span>
          <h1 className="t-display">2M Kurir</h1>
          {user && <p className="text-sm text-muted-foreground">Sedang masuk sebagai {user.name}.</p>}
        </div>
        <form onSubmit={onSubmit} className="flex animate-rise flex-col gap-4">
          <div className="section-head">
            <h2 className="t-title">Masuk</h2>
          </div>
          <label className="field-label flex flex-col gap-1.5">
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
          <label className="field-label flex flex-col gap-1.5">
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
          <Button type="submit" loading={submitting}>
            <FaSignInAlt aria-hidden="true" />
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
