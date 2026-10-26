import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSession } from "./session";
import { FaArrowLeft, FaEnvelope, FaIdCard, FaPhone, FaSignInAlt, FaSignOutAlt, FaUser } from "react-icons/fa";

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

  const profileDetails = [
    { label: "Nama", value: user?.name ?? "Belum tersedia", icon: FaUser },
    { label: "ID", value: user?.id ?? "Belum tersedia", icon: FaIdCard },
    { label: "No. Telp", value: user?.phone ?? "Belum tersedia", icon: FaPhone },
    { label: "Email", value: "Belum tersedia", icon: FaEnvelope },
  ];

  return (
    <>
      <header className="app-header">
        <button type="button" aria-label="Kembali ke dashboard" onClick={() => navigate("/")} className="icon-btn shrink-0">
          <FaArrowLeft aria-hidden="true" />
        </button>
        <h1 className="text-xl font-bold">Profil</h1>
      </header>

      <main className="app-main gap-6">
        <section className="flex flex-col items-center gap-3 py-3" aria-label="Foto profil">
          <div className="avatar size-28 text-5xl shadow-glow ring-4 ring-surface">
            {user?.name ? user.name.trim().charAt(0) : <FaUser aria-hidden="true" />}
          </div>
          <p className="text-lg font-bold">{user?.name ?? "Pengguna"}</p>
        </section>

        <section className="card flex animate-rise flex-col" aria-labelledby="account-information-heading">
          <h2 id="account-information-heading" className="eyebrow mb-1">
            Informasi akun
          </h2>
          {profileDetails.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex min-h-16 items-center gap-3 border-b border-border py-3 last:border-b-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-surface text-primary">
                <Icon aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="break-all text-base font-medium">{value}</p>
              </div>
            </div>
          ))}
        </section>

        <Button variant={user ? "secondary" : "hero"} disabled={loading} onClick={() => void handleSessionAction()}>
          {user ? <FaSignOutAlt aria-hidden="true" className="mr-2 inline" /> : <FaSignInAlt aria-hidden="true" className="mr-2 inline" />}
          {loading ? "Memuat…" : user ? "Keluar" : "Masuk"}
        </Button>
      </main>
    </>
  );
}
