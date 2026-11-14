import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaArrowRight, FaCommentDots, FaHistory, FaIdCard, FaPhone, FaSignInAlt, FaSignOutAlt, FaUser, FaWallet } from "react-icons/fa";
import { BalanceAmount } from "@/features/balance/BalanceAmount";
import { useSession } from "./session";

const rowIcon = "flex w-5 shrink-0 justify-center text-primary";

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="list-row">
      <span className={rowIcon}>{icon}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="t-label">{label}</p>
        <p className="mt-0.5 truncate font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function LinkRow({ to, icon, label, value }: { to: string; icon: ReactNode; label: string; value?: ReactNode }) {
  return (
    <Link to={to} className="list-row font-semibold">
      <span className={rowIcon}>{icon}</span>
      <span className="flex-1">{label}</span>
      {value}
      <FaArrowRight aria-hidden="true" className="row-arrow text-xs" />
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
        className="panel-ink flex animate-rise items-center gap-4 rounded-none px-4 pb-7 pt-[calc(2rem+env(safe-area-inset-top))]"
      >
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-rail-foreground text-3xl font-extrabold uppercase text-rail">
          {user?.name ? user.name.trim().charAt(0) : <FaUser aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h1 className="t-headline truncate capitalize">{user?.name ?? "Pengguna"}</h1>
          {user?.phone && <p className="t-label mt-1.5 tabular-nums">{user.phone}</p>}
        </div>
      </section>

      <main className="app-main">
        <nav aria-label="Menu profil" className="list">
          <LinkRow to="/history" icon={<FaHistory aria-hidden="true" />} label="Riwayat pengantaran" />
          <LinkRow to="/chat/admin"icon={<FaCommentDots aria-hidden="true" />} label="Chat admin" />
          {user && <LinkRow to="/balance" icon={<FaWallet aria-hidden="true" />} label="Saldo keuntungan" value={<BalanceAmount />} />}
        </nav>
        <div className="list">
          <InfoRow icon={<FaIdCard aria-hidden="true" />} label="ID" value={user?.id ?? "Belum tersedia"} />
          <InfoRow icon={<FaPhone aria-hidden="true" />} label="No. Telp" value={user?.phone ?? "Belum tersedia"} />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleSessionAction()}
          className={`btn btn-lg btn-block ${user ? "btn-danger-quiet" : "btn-primary"}`}
        >
          {user ? <FaSignOutAlt aria-hidden="true" /> : <FaSignInAlt aria-hidden="true" />}
          {loading ? "Memuat…" : user ? "Keluar" : "Masuk"}
        </button>
      </main>
    </>
  );
}
