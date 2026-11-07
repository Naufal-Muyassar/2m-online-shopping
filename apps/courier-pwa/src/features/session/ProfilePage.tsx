import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaArrowRight, FaCommentDots, FaHistory, FaIdCard, FaPhone, FaSignInAlt, FaSignOutAlt, FaUser, FaWallet } from "react-icons/fa";
import { useSession } from "./session";

const row = "flex min-h-16 w-full items-center gap-3 rounded-full bg-surface p-2 pr-4 text-left shadow-sm";
const rowIcon = "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-surface text-primary";

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className={row}>
      <span className={rowIcon}>{icon}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
    </div>
  );
}

function LinkRow({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className={`${row} transition active:scale-[0.98]`}>
      <span className={rowIcon}>{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      <FaArrowRight aria-hidden="true" className="text-muted-foreground" />
    </Link>
  );
}

export function ProfilePage() {
  const { user, loading, logout } = useSession();
  const navigate = useNavigate();

  const handleSessionAction = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <section
        aria-label="Foto profil"
        className="flex flex-col items-center gap-2 rounded-b-2xl bg-hero px-4 pb-8 pt-[calc(2.5rem+env(safe-area-inset-top))] text-primary-foreground"
      >
        <div className="flex size-28 items-center justify-center rounded-full bg-surface text-5xl font-bold uppercase text-primary shadow-lg">
          {user?.name ? user.name.trim().charAt(0) : <FaUser aria-hidden="true" />}
        </div>
        <h1 className="mt-2 text-xl font-bold capitalize">{user?.name ?? "Pengguna"}</h1>
        {user?.phone && <p className="text-sm opacity-90">{user.phone}</p>}
      </section>

      <main className="app-main gap-3">
        <LinkRow to="/history" icon={<FaHistory aria-hidden="true" />} label="Riwayat pengantaran" />
        <LinkRow to="/chat" icon={<FaCommentDots aria-hidden="true" />} label="Chat admin" />
        <div className={row}>
          <span className={rowIcon}>
            <FaWallet aria-hidden="true" />
          </span>
          <span className="flex-1 font-medium">Saldo keuntungan</span>
          <span className="pill">Segera</span>
        </div>
        <InfoRow icon={<FaIdCard aria-hidden="true" />} label="ID" value={user?.id ?? "Belum tersedia"} />
        <InfoRow icon={<FaPhone aria-hidden="true" />} label="No. Telp" value={user?.phone ?? "Belum tersedia"} />
        <button type="button" disabled={loading} onClick={() => void handleSessionAction()} className={`${row} disabled:opacity-60 ${user ? "text-destructive" : ""}`}>
          <span className={user ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive-surface" : rowIcon}>
            {user ? <FaSignOutAlt aria-hidden="true" /> : <FaSignInAlt aria-hidden="true" />}
          </span>
          <span className="flex-1 font-medium">{loading ? "Memuat…" : user ? "Keluar" : "Masuk"}</span>
        </button>
      </main>
    </>
  );
}
