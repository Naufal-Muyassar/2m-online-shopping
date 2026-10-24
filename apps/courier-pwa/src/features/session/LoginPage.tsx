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

  const inputClass = "h-14 w-full rounded-lg border border-input bg-background px-4 text-lg";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">2M Kurir</h1>
      {user && <p className="text-sm text-muted-foreground">Sedang masuk sebagai {user.name}.</p>}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-base font-medium">
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
        <label className="flex flex-col gap-1 text-base font-medium">
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
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-foreground">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting}>
          <FaSignInAlt aria-hidden="true" className="mr-2 inline" />
          Masuk
        </Button>
      </form>
      <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Pasang aplikasi di iPhone: ketuk <strong>Bagikan → Tambah ke Layar Utama</strong>.
      </p>
    </main>
  );
}
