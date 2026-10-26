import { SideBarNavigation } from "@/components/SideBarNavigation";
import { FaArrowUp, FaBoxOpen, FaUser } from "react-icons/fa";

const STEPS = [
  <>Ketuk ikon profil di pojok kiri atas.</>,
  <>
    Pilih <strong>Profil</strong> dari menu.
  </>,
  <>
    Tekan <strong>Masuk</strong>, lalu isi nomor telepon dan kata sandi.
  </>,
];

export function LoggedOutDashboard() {
  return (
    <>
      <header className="app-header">
        <SideBarNavigation isLoggedIn={false} pending={false} onToggleStatus={() => undefined} />
        <div>
          <p className="eyebrow">2M Kurir</p>
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>
      </header>

      <main className="app-main items-center text-center" aria-labelledby="login-prompt-title">
        <div className="empty-state-icon mt-6 size-20 text-4xl">
          <FaBoxOpen aria-hidden="true" />
        </div>
        <h2 id="login-prompt-title" className="max-w-xs text-2xl font-bold">
          Siap mulai bertugas?
        </h2>
        <p className="max-w-sm text-base text-muted-foreground">
          Masuk ke akun kurir untuk melihat pesanan dan mengaktifkan status bekerja.
        </p>

        <div className="card w-full text-left">
          <h3 className="mb-3 font-bold">Cara masuk</h3>
          <ol className="flex flex-col gap-3 text-sm">
            {STEPS.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-surface font-bold text-primary-pressed">
                  {i + 1}
                </span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          <FaArrowUp aria-hidden="true" />
          <FaUser aria-hidden="true" />
          <span>Mulai dari ikon profil di atas</span>
        </div>
      </main>
    </>
  );
}
