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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-4">
      <header className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Kembali ke dashboard"
          onClick={() => navigate("/")}
          className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-lg active:bg-muted"
        >
          <FaArrowLeft aria-hidden="true" />
        </button>
        <h1 className="text-2xl font-bold">Profil</h1>
      </header>

      <section className="flex flex-col items-center gap-3 py-3" aria-label="Foto profil">
        <div className="flex size-32 items-center justify-center overflow-hidden rounded-full border-4 border-secondary bg-muted text-6xl text-muted-foreground">
          <FaUser aria-hidden="true" />
        </div>
        <p className="text-lg font-semibold">{user?.name ?? "Pengguna"}</p>
      </section>

      <section className="flex flex-col gap-1" aria-labelledby="account-information-heading">
        <h2 id="account-information-heading" className="mb-2 text-lg font-bold">Informasi akun</h2>
        {profileDetails.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex min-h-16 items-center gap-3 border-b border-border py-3">
            <Icon aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="break-all text-base font-medium">{value}</p>
            </div>
          </div>
        ))}
      </section>

      <Button variant={user ? "secondary" : "primary"} disabled={loading} onClick={() => void handleSessionAction()}>
        {user ? <FaSignOutAlt aria-hidden="true" className="mr-2 inline" /> : <FaSignInAlt aria-hidden="true" className="mr-2 inline" />}
        {loading ? "Memuat…" : user ? "Keluar" : "Masuk"}
      </Button>
    </main>
  );
}